import { bytesToBase64Url, base64UrlToBytes } from './utils.js';

/*
 * Share-link format
 * -----------------
 *   https://host/r/<roomId>#k=<base64url key>
 *
 * The room id lives in the PATH so the signaling server can match two peers.
 * The encryption key lives in the URL FRAGMENT (after #). Browsers never send
 * the fragment to any server, so the key reaches the receiver without the
 * signaling server — or anyone logging requests — ever seeing it. That is the
 * whole basis of the zero-knowledge guarantee.
 */

const ROOM_PREFIX = '/r/';
const KEY_PARAM = 'k';

/** Build the full share URL for a room + raw key bytes. */
export function buildShareLink(roomId, keyBytes) {
  const base = `${window.location.origin}${ROOM_PREFIX}${roomId}`;
  if (!keyBytes) return base;
  return `${base}#${KEY_PARAM}=${bytesToBase64Url(keyBytes)}`;
}

/**
 * Read the current URL and work out what mode we're in.
 * @returns {{ mode: 'send'|'receive', roomId: string|null, keyBytes: Uint8Array|null }}
 */
export function parseLocation() {
  const { pathname, hash } = window.location;

  let roomId = null;
  if (pathname.startsWith(ROOM_PREFIX)) {
    const rest = pathname.slice(ROOM_PREFIX.length).split('/')[0].trim();
    if (rest) roomId = rest;
  }

  let keyBytes = null;
  if (hash) {
    const frag = hash.startsWith('#') ? hash.slice(1) : hash;
    const params = new URLSearchParams(frag);
    const raw = params.get(KEY_PARAM);
    if (raw) {
      try {
        keyBytes = base64UrlToBytes(raw);
      } catch {
        keyBytes = null; // malformed key — receiver will surface a clear error
      }
    }
  }

  return { mode: roomId ? 'receive' : 'send', roomId, keyBytes };
}
