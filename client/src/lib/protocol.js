/**
 * The wire protocol spoken over the WebRTC data channel.
 *
 * Two kinds of messages travel the channel:
 *
 *  - CONTROL messages are JSON strings (metadata, ready, complete, ack, ...).
 *  - CHUNK messages are binary ArrayBuffers with a fixed 48-byte header that
 *    makes each chunk fully self-describing. Because the index travels inside
 *    the frame, the receiver can place chunks correctly without relying on
 *    arrival order, and resume knows exactly what it already has.
 *
 *  Chunk frame layout:
 *    bytes  0..3    chunk index            (uint32, big-endian)
 *    bytes  4..35   SHA-256 of plaintext   (32 bytes)
 *    bytes 36..47   AES-GCM IV / nonce     (12 bytes; zeroed when unencrypted)
 *    bytes 48..end  payload                (ciphertext+tag, or raw plaintext)
 */

export const MSG = {
  META: 'meta', // sender → receiver: file description, starts a transfer
  READY: 'ready', // receiver → sender: handlers wired, begin sending
  RESUME: 'resume', // receiver → sender: continue from a given chunk index
  ACK: 'ack', // receiver → sender: progress checkpoint
  COMPLETE: 'complete', // sender → receiver: all chunks sent
  CANCEL: 'cancel', // either side: abort the transfer
};

export const FRAME = {
  INDEX_OFFSET: 0,
  HASH_OFFSET: 4,
  HASH_LEN: 32,
  IV_OFFSET: 36,
  IV_LEN: 12,
  HEADER_LEN: 48,
};

/**
 * Assemble a binary chunk frame.
 * @param {number} index
 * @param {Uint8Array} hash   32-byte SHA-256 of the plaintext chunk
 * @param {Uint8Array} iv     12-byte IV (use a zero-filled array if unencrypted)
 * @param {Uint8Array} payload
 * @returns {ArrayBuffer}
 */
export function buildFrame(index, hash, iv, payload) {
  const buffer = new ArrayBuffer(FRAME.HEADER_LEN + payload.byteLength);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  view.setUint32(FRAME.INDEX_OFFSET, index, false); // big-endian
  bytes.set(hash, FRAME.HASH_OFFSET);
  bytes.set(iv, FRAME.IV_OFFSET);
  bytes.set(payload, FRAME.HEADER_LEN);

  return buffer;
}

/**
 * Parse a binary chunk frame back into its parts.
 * @param {ArrayBuffer} buffer
 */
export function parseFrame(buffer) {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  const index = view.getUint32(FRAME.INDEX_OFFSET, false);
  const hash = bytes.slice(FRAME.HASH_OFFSET, FRAME.HASH_OFFSET + FRAME.HASH_LEN);
  const iv = bytes.slice(FRAME.IV_OFFSET, FRAME.IV_OFFSET + FRAME.IV_LEN);
  const payload = bytes.slice(FRAME.HEADER_LEN);

  return { index, hash, iv, payload };
}
