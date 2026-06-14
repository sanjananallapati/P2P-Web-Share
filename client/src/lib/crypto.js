/**
 * Cryptography for Beam, built entirely on the browser's Web Crypto API.
 *
 * Two independent guarantees:
 *
 *  1. INTEGRITY — every chunk carries a SHA-256 of its plaintext. The receiver
 *     re-hashes each chunk and rejects any that don't match. If every chunk
 *     verifies and lands at its correct index, the reassembled file is
 *     bit-identical to the original. That is what "zero data corruption" means
 *     here, and it works without ever holding the whole file in memory.
 *
 *  2. CONFIDENTIALITY (zero-knowledge) — chunks are encrypted with AES-GCM
 *     before they leave the sender. The 256-bit key is generated in the
 *     browser and travels only inside the URL fragment (#k=...), which is never
 *     sent to the signaling server. So the server can match two peers by room
 *     id but can never read the file. AES-GCM also authenticates each chunk:
 *     any tampering makes decryption fail outright.
 */

const KEY_ALGO = { name: 'AES-GCM', length: 256 };
const IV_BYTES = 12; // 96-bit nonce, the standard size for AES-GCM

/** Generate a fresh, extractable AES-GCM key for a single transfer. */
export async function generateKey() {
  return crypto.subtle.generateKey(KEY_ALGO, true, ['encrypt', 'decrypt']);
}

/** Export a key to raw bytes so it can be packed into the share link. */
export async function exportKeyBytes(key) {
  const raw = await crypto.subtle.exportKey('raw', key);
  return new Uint8Array(raw);
}

/** Re-import a key from the raw bytes carried in the link fragment. */
export async function importKeyBytes(bytes) {
  return crypto.subtle.importKey('raw', bytes, KEY_ALGO, true, [
    'encrypt',
    'decrypt',
  ]);
}

/** SHA-256 of a byte range → 32 raw bytes. Chunks are small, so this is fast. */
export async function sha256(bytes) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return new Uint8Array(digest);
}

/**
 * Encrypt one plaintext chunk.
 * Returns the random IV and the ciphertext (which already includes the
 * 16-byte GCM auth tag appended by Web Crypto).
 */
export async function encryptChunk(key, plaintext) {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    plaintext
  );
  return { iv, ciphertext: new Uint8Array(ciphertext) };
}

/**
 * Decrypt one chunk. Throws if the auth tag fails — i.e. the chunk was
 * corrupted in transit or tampered with. Callers treat a throw as a hard error.
 */
export async function decryptChunk(key, iv, ciphertext) {
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext
  );
  return new Uint8Array(plaintext);
}

/** Constant-shape comparison of two equal-length byte arrays. */
export function bytesEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export const IV_LENGTH = IV_BYTES;
