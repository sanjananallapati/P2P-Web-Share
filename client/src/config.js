/**
 * Central configuration for the Beam client.
 * Everything tunable lives here so the transfer engine reads cleanly.
 */

// Where the signaling server lives. Falls back to localhost for dev.
export const SIGNALING_URL =
  import.meta.env.VITE_SIGNALING_URL || 'http://localhost:3001';

/**
 * ICE servers used to discover a direct path between the two browsers.
 * Public STUN servers help peers learn their public-facing address and punch
 * through most home/office NATs. A TURN relay (optional) is the fallback for
 * strict/symmetric NATs where no direct path exists — supply credentials via
 * env vars to enable it.
 */
export const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

if (import.meta.env.VITE_TURN_URL) {
  ICE_SERVERS.push({
    urls: import.meta.env.VITE_TURN_URL,
    username: import.meta.env.VITE_TURN_USERNAME || '',
    credential: import.meta.env.VITE_TURN_CREDENTIAL || '',
  });
}

// --- Transfer tuning --------------------------------------------------------

// Plaintext bytes read from the file per chunk. Kept comfortably under the
// 16 KiB WebRTC message-size floor once the 48-byte frame header and the
// 28-byte AES-GCM overhead (12-byte IV + 16-byte tag) are added, so messages
// stay deliverable across every modern browser.
export const CHUNK_SIZE = 16 * 1024; // 16 KiB

// Soft cap on how much unsent data we let pile up in the data channel's send
// buffer. When we cross this, we pause and wait for it to drain (backpressure).
// Without this, a fast disk + slow network overflows the buffer and the
// connection dies on large files.
export const BUFFER_HIGH_WATER = 8 * 1024 * 1024; // 8 MiB
export const BUFFER_LOW_WATER = 1 * 1024 * 1024; // 1 MiB

// Receiver acknowledges progress back to the sender every N chunks, so the
// sender can show true receiver-side progress and support resume.
export const ACK_EVERY = 64;

// Core MVP advisory limit. Files above this still work, but we warn that they
// lean on the streaming-to-disk path / more memory.
export const SOFT_SIZE_LIMIT = 50 * 1024 * 1024; // 50 MB

// Above this size the receiver prefers streaming straight to disk (via the
// File System Access API where available) instead of holding the whole file
// in memory before download.
export const STREAM_TO_DISK_THRESHOLD = 256 * 1024 * 1024; // 256 MB
