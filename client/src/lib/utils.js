/** Small, dependency-free helpers used across the UI and transfer engine. */

/** Human-readable byte size, e.g. 4.20 MB. */
export function formatBytes(bytes, decimals = 2) {
  if (!bytes || bytes < 0) return '0 B';
  const k = 1024;
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const value = bytes / Math.pow(k, i);
  return `${value.toFixed(i === 0 ? 0 : decimals)} ${units[i]}`;
}

/** Transfer rate, e.g. 1.4 MB/s. */
export function formatSpeed(bytesPerSecond) {
  if (!bytesPerSecond || bytesPerSecond < 0) return '0 B/s';
  return `${formatBytes(bytesPerSecond, 1)}/s`;
}

/** Rough ETA from remaining bytes and current speed. */
export function formatEta(remainingBytes, bytesPerSecond) {
  if (!bytesPerSecond || bytesPerSecond <= 0) return '—';
  const seconds = Math.ceil(remainingBytes / bytesPerSecond);
  if (seconds < 1) return '<1s';
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}

/** Short, readable fingerprint of a long hex hash: a1b2c3…e9f0 */
export function shortHash(hex, lead = 6, tail = 4) {
  if (!hex || hex.length <= lead + tail) return hex || '';
  return `${hex.slice(0, lead)}…${hex.slice(-tail)}`;
}

// --- base64url (URL-safe, no padding) — used to carry the encryption key -----

export function bytesToBase64Url(bytes) {
  let binary = '';
  const arr = new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i++) binary += String.fromCharCode(arr[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function base64UrlToBytes(b64url) {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64.padEnd(b64.length + ((4 - (b64.length % 4)) % 4), '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Convert an ArrayBuffer of bytes to a lowercase hex string. */
export function bufferToHex(buffer) {
  const bytes = new Uint8Array(buffer);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}

/** Copy text to the clipboard, with a legacy fallback for older browsers. */
export async function copyToClipboard(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to legacy path */
  }
  try {
    const el = document.createElement('textarea');
    el.value = text;
    el.style.position = 'fixed';
    el.style.opacity = '0';
    document.body.appendChild(el);
    el.select();
    document.execCommand('copy');
    document.body.removeChild(el);
    return true;
  } catch {
    return false;
  }
}

/** Pick a small label for a file based on its extension. */
export function fileKind(name = '') {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  return ext.length > 0 && ext.length <= 5 ? ext : 'file';
}

/** Clamp a number into [min, max]. */
export function clamp(n, min, max) {
  return Math.min(Math.max(n, min), max);
}
