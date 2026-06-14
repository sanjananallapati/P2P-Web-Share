import { CHUNK_SIZE, BUFFER_HIGH_WATER } from '../config.js';
import { sha256, encryptChunk, IV_LENGTH } from './crypto.js';
import { MSG, buildFrame } from './protocol.js';
import { bufferToHex } from './utils.js';

const ZERO_IV = new Uint8Array(IV_LENGTH); // placeholder IV for unencrypted mode

/**
 * Reads a slice of the file as an ArrayBuffer.
 *
 * Uses Blob.arrayBuffer() (the promise-based successor to
 * FileReader.readAsArrayBuffer) where available, and falls back to a real
 * FileReader for older engines. Either way the bytes are read locally in the
 * browser and streamed straight over the data channel — they are never
 * uploaded anywhere.
 */
function readSlice(file, start, end) {
  const blob = file.slice(start, end);
  if (typeof blob.arrayBuffer === 'function') {
    return blob.arrayBuffer();
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

/**
 * Drives the send side of a transfer for a single file.
 */
export class FileSender {
  /**
   * @param {object} opts
   * @param {File} opts.file
   * @param {import('./peer.js').Peer} opts.peer
   * @param {CryptoKey|null} opts.key   AES-GCM key, or null for plaintext
   * @param {(p:object)=>void} opts.onProgress
   * @param {()=>void} opts.onComplete
   * @param {(e:Error)=>void} opts.onError
   */
  constructor({ file, peer, key, onProgress, onComplete, onError }) {
    this.file = file;
    this.peer = peer;
    this.key = key;
    this.encrypted = !!key;
    this.onProgress = onProgress || (() => {});
    this.onComplete = onComplete || (() => {});
    this.onError = onError || (() => {});

    this.chunkSize = CHUNK_SIZE;
    this.totalChunks = Math.max(1, Math.ceil(file.size / this.chunkSize));
    this.cancelled = false;

    // Per-chunk SHA-256 tags, concatenated. Hashing this whole ledger at the
    // end yields a single "transfer fingerprint" (a flat Merkle root) that the
    // receiver recomputes independently and compares — an end-to-end guarantee
    // that every byte arrived intact, on top of the per-chunk checks.
    this.hashLedger = new Uint8Array(this.totalChunks * 32);

    // Throughput tracking (smoothed).
    this._bytesSent = 0;
    this._speed = 0;
    this._lastSampleTime = 0;
    this._lastSampleBytes = 0;
    this._lastEmit = 0;
  }

  /** Announce the file to the receiver. Sent once, before any chunks. */
  sendMeta() {
    this.peer.send(
      JSON.stringify({
        type: MSG.META,
        name: this.file.name,
        size: this.file.size,
        mime: this.file.type || 'application/octet-stream',
        chunkSize: this.chunkSize,
        totalChunks: this.totalChunks,
        encrypted: this.encrypted,
      })
    );
  }

  /**
   * Stream chunks to the receiver, honoring backpressure so we never overflow
   * the data channel's send buffer. Can begin partway through (resume).
   */
  async send(fromIndex = 0) {
    this.cancelled = false;
    this._lastSampleTime = performance.now();
    this._lastSampleBytes = this._bytesSent;

    try {
      for (let index = fromIndex; index < this.totalChunks; index++) {
        if (this.cancelled) return;
        if (!this.peer.isOpen) throw new Error('channel-closed');

        // Backpressure: if the buffer is backing up, wait for it to drain.
        if (this.peer.bufferedAmount > BUFFER_HIGH_WATER) {
          await this.peer.waitForDrain();
          if (this.cancelled) return;
        }

        const start = index * this.chunkSize;
        const end = Math.min(start + this.chunkSize, this.file.size);
        const plaintext = new Uint8Array(await readSlice(this.file, start, end));

        // Integrity tag for this chunk (hash of the plaintext).
        const hash = await sha256(plaintext);
        this.hashLedger.set(hash, index * 32);

        // Confidentiality (optional). AES-GCM also authenticates the payload.
        let iv = ZERO_IV;
        let payload = plaintext;
        if (this.encrypted) {
          const enc = await encryptChunk(this.key, plaintext);
          iv = enc.iv;
          payload = enc.ciphertext;
        }

        this.peer.send(buildFrame(index, hash, iv, payload));

        this._bytesSent = end;
        this._maybeEmit(index + 1);
      }

      if (this.cancelled) return;
      // Seal the transfer with the fingerprint of all chunk hashes.
      const root = bufferToHex(await sha256(this.hashLedger));
      this.peer.send(JSON.stringify({ type: MSG.COMPLETE, root }));
      this._emit(this.totalChunks, true);
      this.onComplete({ fingerprint: root });
    } catch (err) {
      if (!this.cancelled) this.onError(err);
    }
  }

  cancel() {
    this.cancelled = true;
  }

  // --- progress + speed ----------------------------------------------------
  _maybeEmit(chunksSent) {
    const now = performance.now();
    // Throttle UI updates: every ~90ms is smooth without thrashing React.
    if (now - this._lastEmit < 90 && chunksSent < this.totalChunks) return;
    this._lastEmit = now;
    this._recomputeSpeed(now);
    this._emit(chunksSent, false);
  }

  _recomputeSpeed(now) {
    const dt = (now - this._lastSampleTime) / 1000;
    if (dt >= 0.25) {
      const instant = (this._bytesSent - this._lastSampleBytes) / dt;
      // Exponential moving average to keep the readout from jittering.
      this._speed = this._speed === 0 ? instant : this._speed * 0.7 + instant * 0.3;
      this._lastSampleTime = now;
      this._lastSampleBytes = this._bytesSent;
    }
  }

  _emit(chunksSent, done) {
    this.onProgress({
      role: 'send',
      bytes: this._bytesSent,
      total: this.file.size,
      chunks: chunksSent,
      totalChunks: this.totalChunks,
      speed: done ? 0 : this._speed,
      done,
    });
  }
}
