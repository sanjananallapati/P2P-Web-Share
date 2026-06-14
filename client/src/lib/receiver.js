import { ACK_EVERY } from '../config.js';
import { sha256, decryptChunk, bytesEqual } from './crypto.js';
import { MSG, parseFrame } from './protocol.js';
import { bufferToHex } from './utils.js';

/** Collects chunks in memory, then hands back a Blob to download. */
class MemorySink {
  constructor(totalChunks) {
    this.chunks = new Array(totalChunks);
    this.type = 'memory';
  }
  async write(index, bytes) {
    this.chunks[index] = bytes;
  }
  async finish(mime) {
    return { blob: new Blob(this.chunks, { type: mime }) };
  }
  abort() {
    this.chunks = [];
  }
}

/** Streams chunks straight to a file on disk via the File System Access API. */
class DiskStreamSink {
  constructor(writable) {
    this.writable = writable;
    this.type = 'disk';
  }
  async write(_index, bytes) {
    // Receiver processing is serial and the data channel is ordered, so writes
    // arrive in index order — exactly what an append-only stream needs.
    await this.writable.write(bytes);
  }
  async finish() {
    await this.writable.close();
    return { savedToDisk: true };
  }
  async abort() {
    try {
      await this.writable.abort();
    } catch {
      /* ignore */
    }
  }
}

/**
 * Prompt the user to choose a save location and return a disk sink.
 * Must be called from a user gesture (e.g. a button click). Returns null if
 * the API is unavailable or the user cancels.
 */
export async function pickDiskSink(meta) {
  if (typeof window.showSaveFilePicker !== 'function') return null;
  try {
    const handle = await window.showSaveFilePicker({ suggestedName: meta.name });
    const writable = await handle.createWritable();
    return new DiskStreamSink(writable);
  } catch {
    return null; // user cancelled the picker
  }
}

function triggerDownload(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name || 'beam-download';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 15000);
}

/**
 * Drives the receive side of a transfer: verifies and decrypts each chunk,
 * reassembles the file, and triggers the download.
 */
export class FileReceiver {
  /**
   * @param {object} opts
   * @param {import('./peer.js').Peer} opts.peer
   * @param {CryptoKey|null} opts.key
   * @param {(meta:object)=>void} opts.onMeta
   * @param {(p:object)=>void} opts.onProgress
   * @param {(r:object)=>void} opts.onComplete
   * @param {(e:Error)=>void} opts.onError
   * @param {object|null} opts.sink   optional pre-built sink (e.g. disk)
   */
  constructor({ peer, key, onMeta, onProgress, onComplete, onError, sink = null }) {
    this.peer = peer;
    this.key = key;
    this.onMeta = onMeta || (() => {});
    this.onProgress = onProgress || (() => {});
    this.onComplete = onComplete || (() => {});
    this.onError = onError || (() => {});

    this.meta = null;
    this.sink = sink;
    this.have = null; // Uint8Array flag per chunk (for resume / dedupe)
    this.received = 0;
    this.hashLedger = null; // concatenated chunk hashes → transfer fingerprint
    this.senderRoot = null;

    this._bytes = 0;
    this._queue = [];
    this._draining = false;
    this._failed = false;

    // Throughput tracking.
    this._speed = 0;
    this._lastSampleTime = 0;
    this._lastSampleBytes = 0;
    this._lastEmit = 0;
  }

  /** Entry point wired to the peer's 'message' event. */
  handleMessage(data) {
    if (typeof data === 'string') {
      this._handleControl(JSON.parse(data));
    } else {
      this._queue.push(data);
      this._drain();
    }
  }

  /** The chunk index we next need — used to resume after a drop. */
  get nextNeeded() {
    if (!this.have) return 0;
    let i = 0;
    while (i < this.have.length && this.have[i]) i++;
    return i;
  }

  async _handleControl(msg) {
    if (msg.type === MSG.META) {
      this.meta = msg;
      this.have = new Uint8Array(msg.totalChunks);
      this.hashLedger = new Uint8Array(msg.totalChunks * 32);
      if (!this.sink) this.sink = new MemorySink(msg.totalChunks);
      this._lastSampleTime = performance.now();
      this.onMeta(msg);
      // Tell the sender we're wired up; resume from whatever we still need.
      this.peer.send(JSON.stringify({ type: MSG.READY, from: this.nextNeeded }));
    } else if (msg.type === MSG.COMPLETE) {
      this.senderRoot = msg.root || null;
      await this._finalize();
    } else if (msg.type === MSG.CANCEL) {
      this._fail(new Error('The sender cancelled the transfer.'));
    }
  }

  async _drain() {
    if (this._draining || this._failed) return;
    this._draining = true;
    try {
      while (this._queue.length > 0) {
        const frame = this._queue.shift();
        await this._handleChunk(frame);
        if (this._failed) break;
      }
    } finally {
      this._draining = false;
    }
  }

  async _handleChunk(buffer) {
    if (!this.meta) return; // chunk before metadata — shouldn't happen
    const { index, hash, iv, payload } = parseFrame(buffer);

    if (this.have[index]) return; // already have it (e.g. resume overlap)

    // Decrypt if needed. A GCM failure throws and is treated as corruption.
    let plaintext;
    try {
      plaintext = this.meta.encrypted
        ? await decryptChunk(this.key, iv, payload)
        : payload;
    } catch {
      return this._fail(
        new Error(`Chunk ${index} failed to decrypt — wrong key or corrupted.`)
      );
    }

    // Verify the integrity tag.
    const check = await sha256(plaintext);
    if (!bytesEqual(check, hash)) {
      return this._fail(
        new Error(`Chunk ${index} failed integrity check — data was corrupted.`)
      );
    }

    await this.sink.write(index, plaintext);
    this.hashLedger.set(hash, index * 32);
    this.have[index] = 1;
    this.received += 1;
    this._bytes += plaintext.length;

    // Periodic acknowledgement so the sender can show true progress + resume.
    if (this.received % ACK_EVERY === 0) {
      this.peer.send(JSON.stringify({ type: MSG.ACK, received: this.received }));
    }

    this._maybeEmit();
  }

  async _finalize() {
    if (this._failed) return;
    if (this.received < this.meta.totalChunks) {
      // COMPLETE arrived but we're missing chunks — ask for the gap.
      this.peer.send(JSON.stringify({ type: MSG.RESUME, from: this.nextNeeded }));
      return;
    }

    // Compute the end-to-end transfer fingerprint and compare to the sender's.
    const rootBytes = await sha256(this.hashLedger);
    const root = bufferToHex(rootBytes);
    const verified = !this.senderRoot || this.senderRoot === root;

    let result;
    try {
      result = await this.sink.finish(this.meta.mime);
    } catch (err) {
      return this._fail(new Error('Could not finish writing the file.'));
    }

    // Memory mode: trigger the download. Disk mode: already saved.
    if (result.blob) {
      triggerDownload(result.blob, this.meta.name);
    }

    this._emit(true);
    this.onComplete({
      name: this.meta.name,
      size: this.meta.size,
      mime: this.meta.mime,
      encrypted: this.meta.encrypted,
      savedToDisk: !!result.savedToDisk,
      fingerprint: root,
      verified,
    });
  }

  cancel() {
    this._failed = true;
    this.peer.send(JSON.stringify({ type: MSG.CANCEL }));
    this.sink?.abort?.();
  }

  _fail(err) {
    if (this._failed) return;
    this._failed = true;
    this.sink?.abort?.();
    this.onError(err);
  }

  // --- progress + speed ----------------------------------------------------
  _maybeEmit() {
    const now = performance.now();
    if (now - this._lastEmit < 90 && this.received < this.meta.totalChunks) return;
    this._lastEmit = now;
    this._recomputeSpeed(now);
    this._emit(false);
  }

  _recomputeSpeed(now) {
    const dt = (now - this._lastSampleTime) / 1000;
    if (dt >= 0.25) {
      const instant = (this._bytes - this._lastSampleBytes) / dt;
      this._speed = this._speed === 0 ? instant : this._speed * 0.7 + instant * 0.3;
      this._lastSampleTime = now;
      this._lastSampleBytes = this._bytes;
    }
  }

  _emit(done) {
    this.onProgress({
      role: 'receive',
      bytes: this._bytes,
      total: this.meta?.size || 0,
      chunks: this.received,
      totalChunks: this.meta?.totalChunks || 0,
      speed: done ? 0 : this._speed,
      done,
    });
  }
}
