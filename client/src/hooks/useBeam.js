import { useCallback, useEffect, useReducer, useRef } from 'react';
import { Signaling } from '../lib/signaling.js';
import { Peer } from '../lib/peer.js';
import { FileSender } from '../lib/sender.js';
import { FileReceiver, pickDiskSink } from '../lib/receiver.js';
import {
  generateKey,
  exportKeyBytes,
  importKeyBytes,
} from '../lib/crypto.js';
import { MSG } from '../lib/protocol.js';
import { buildShareLink } from '../lib/links.js';
import { STREAM_TO_DISK_THRESHOLD } from '../config.js';

/*
 * useBeam — the single source of truth for a transfer.
 *
 * It owns the long-lived engine objects (signaling socket, peer connection,
 * sender/receiver) in refs, and projects their events into a small, explicit
 * state machine that the UI renders. One hook drives both directions:
 *
 *   send:     idle → armed → linking → live → transferring → done
 *   receive:  joining → linking → live → transferring → done
 *
 * Either side can branch to `dropped` (peer left / connection failed) or
 * `error` (room missing, bad key, corrupted chunk, ...).
 */

const initialState = {
  phase: 'idle',
  role: 'send',
  encrypted: true,
  // send
  file: null,
  roomId: null,
  shareLink: null,
  peerPresent: false,
  sentFingerprint: null,
  // receive
  meta: null,
  result: null,
  diskChosen: false,
  // shared
  connState: 'new',
  progress: null, // { bytes, total, chunks, totalChunks, speed, pct }
  error: null,
};

function reducer(state, action) {
  switch (action.type) {
    case 'PATCH':
      return { ...state, ...action.patch };
    case 'PROGRESS':
      return { ...state, progress: action.progress };
    case 'RESET':
      return { ...initialState, role: state.role, encrypted: state.encrypted };
    default:
      return state;
  }
}

function pct(bytes, total) {
  if (!total) return 0;
  return Math.min(100, Math.round((bytes / total) * 1000) / 10);
}

export function useBeam(location) {
  const [state, dispatch] = useReducer(reducer, {
    ...initialState,
    role: location.mode, // 'send' | 'receive'
    phase: location.mode === 'receive' ? 'joining' : 'idle',
  });

  const sig = useRef(null);
  const peer = useRef(null);
  const sender = useRef(null);
  const receiver = useRef(null);
  const key = useRef(null);
  const remoteId = useRef(null);
  const started = useRef(false); // guard against double-invoke (StrictMode)

  // Mirrors of state that async socket/peer callbacks read after their
  // defining render — refs sidestep stale closures cleanly.
  const fileRef = useRef(null);
  const encryptedRef = useRef(state.encrypted);
  const phaseRef = useRef(state.phase);
  useEffect(() => {
    phaseRef.current = state.phase;
  }, [state.phase]);
  useEffect(() => {
    encryptedRef.current = state.encrypted;
  }, [state.encrypted]);

  const patch = useCallback((p) => dispatch({ type: 'PATCH', patch: p }), []);

  const onProgress = useCallback(
    (p) =>
      dispatch({
        type: 'PROGRESS',
        progress: { ...p, pct: pct(p.bytes, p.total) },
      }),
    []
  );

  // --- teardown ------------------------------------------------------------
  const teardown = useCallback(() => {
    try {
      sender.current?.cancel();
    } catch {
      /* ignore */
    }
    try {
      peer.current?.close();
    } catch {
      /* ignore */
    }
    try {
      sig.current?.leaveRoom();
      sig.current?.destroy();
    } catch {
      /* ignore */
    }
    sender.current = null;
    receiver.current = null;
    peer.current = null;
    sig.current = null;
    remoteId.current = null;
  }, []);

  // --- shared peer wiring --------------------------------------------------
  const bindCommonPeerEvents = useCallback(() => {
    const p = peer.current;
    p.on('state', ({ state: s }) => patch({ connState: s }));
    p.on('failed', () => {
      // Only a problem if we haven't finished.
      dispatch({
        type: 'PATCH',
        patch: { phase: 'dropped', error: null },
      });
    });
    p.on('error', () => {
      /* surfaced via 'failed'/'channel-close'; avoid noisy duplicate states */
    });
  }, [patch]);

  // =========================================================================
  // SEND
  // =========================================================================
  const selectFile = useCallback(
    async (file) => {
      if (!file) return;
      try {
        fileRef.current = file;
        patch({ phase: 'linking', file, error: null, result: null });

        // Mint an encryption key (unless the user turned encryption off).
        let keyBytes = null;
        if (encryptedRef.current) {
          key.current = await generateKey();
          keyBytes = await exportKeyBytes(key.current);
        } else {
          key.current = null;
        }

        // Connect to signaling and create a room.
        sig.current = new Signaling();
        sig.current.connect();
        const roomId = await sig.current.createRoom();
        const shareLink = buildShareLink(roomId, keyBytes);

        // When the receiver joins, we (already in the room) initiate.
        sig.current.on('peer-joined', ({ peerId }) => {
          remoteId.current = peerId;
          patch({ peerPresent: true });
          startAsInitiator();
        });
        sig.current.on('peer-left', () => {
          patch({ peerPresent: false });
          // A drop before we're done is a graceful disconnect, not a crash.
          if (phaseRef.current !== 'done' && !sender.current?.cancelled) {
            patch({ phase: 'dropped' });
          }
        });
        sig.current.on('signal', ({ data }) => peer.current?.handleSignal(data));

        patch({ phase: 'armed', roomId, shareLink });
      } catch (err) {
        patch({ phase: 'error', error: friendlyError(err) });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [patch]
  );

  const startAsInitiator = useCallback(() => {
    peer.current = new Peer({
      initiator: true,
      signalSend: (data) => sig.current.signal(remoteId.current, data),
    });
    bindCommonPeerEvents();

    peer.current.on('channel-open', async () => {
      patch({ phase: 'live', connState: 'connected' });
      sender.current = new FileSender({
        file: fileRef.current,
        peer: peer.current,
        key: key.current,
        onProgress,
        onComplete: ({ fingerprint }) =>
          patch({ phase: 'done', sentFingerprint: fingerprint }),
        onError: (err) => patch({ phase: 'error', error: friendlyError(err) }),
      });
      sender.current.sendMeta();
    });

    peer.current.on('channel-close', () => {
      if (phaseRef.current !== 'done') patch({ phase: 'dropped' });
    });

    peer.current.on('message', (data) => {
      if (typeof data !== 'string') return; // sender only expects control msgs
      let msg;
      try {
        msg = JSON.parse(data);
      } catch {
        return;
      }
      if (msg.type === MSG.READY || msg.type === MSG.RESUME) {
        patch({ phase: 'transferring' });
        sender.current?.send(msg.from || 0);
      } else if (msg.type === MSG.ACK) {
        // Receiver-side checkpoint — could surface remote progress if desired.
      } else if (msg.type === MSG.CANCEL) {
        patch({ phase: 'error', error: 'The receiver cancelled the transfer.' });
      }
    });

    peer.current.start();
  }, [bindCommonPeerEvents, onProgress, patch]);

  // =========================================================================
  // RECEIVE
  // =========================================================================
  const startReceive = useCallback(async () => {
    try {
      // Import the key from the link fragment (if the transfer is encrypted).
      if (location.keyBytes) {
        key.current = await importKeyBytes(location.keyBytes);
        patch({ encrypted: true });
      } else {
        key.current = null;
        patch({ encrypted: false });
      }

      sig.current = new Signaling();
      sig.current.connect();

      const res = await sig.current.joinRoom(location.roomId);
      const host = res.peers?.[0];
      if (!host) throw new Error('empty-room');
      remoteId.current = host;

      sig.current.on('peer-left', () => {
        patch({ peerPresent: false });
        if (phaseRef.current !== 'done') patch({ phase: 'dropped' });
      });
      sig.current.on('signal', ({ data }) => peer.current?.handleSignal(data));

      patch({ phase: 'linking', peerPresent: true });

      // We just joined, so we're the responder: wait for the offer.
      peer.current = new Peer({
        initiator: false,
        signalSend: (data) => sig.current.signal(remoteId.current, data),
      });
      bindCommonPeerEvents();

      receiver.current = new FileReceiver({
        peer: peer.current,
        key: key.current,
        onMeta: (meta) => patch({ phase: 'transferring', meta }),
        onProgress,
        onComplete: (result) => patch({ phase: 'done', result }),
        onError: (err) => patch({ phase: 'error', error: friendlyError(err) }),
      });

      peer.current.on('channel-open', () =>
        patch({ phase: 'live', connState: 'connected' })
      );
      peer.current.on('channel-close', () => {
        if (phaseRef.current !== 'done') patch({ phase: 'dropped' });
      });
      peer.current.on('message', (data) =>
        receiver.current?.handleMessage(data)
      );

      peer.current.start(); // no-op for responder, kept for symmetry
    } catch (err) {
      patch({ phase: 'error', error: friendlyError(err) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bindCommonPeerEvents, location.keyBytes, location.roomId, onProgress, patch]);

  // Auto-start the receive flow once, when in receive mode.
  useEffect(() => {
    if (location.mode !== 'receive') return;
    if (started.current) return;
    started.current = true;
    startReceive();
  }, [location.mode, startReceive]);

  // Best-effort cleanup if the user closes the tab mid-transfer, so the other
  // side is told promptly rather than waiting for a socket timeout.
  useEffect(() => {
    const onUnload = () => {
      try {
        sig.current?.leaveRoom();
        peer.current?.close();
      } catch {
        /* ignore */
      }
    };
    window.addEventListener('beforeunload', onUnload);
    return () => {
      window.removeEventListener('beforeunload', onUnload);
      teardown();
    };
  }, [teardown]);

  // --- actions exposed to the UI ------------------------------------------
  const setEncrypted = useCallback((v) => patch({ encrypted: v }), [patch]);

  const cancel = useCallback(() => {
    try {
      sender.current?.cancel();
      receiver.current?.cancel();
      peer.current?.send(JSON.stringify({ type: MSG.CANCEL }));
    } catch {
      /* ignore */
    }
    patch({ phase: 'error', error: 'Transfer cancelled.' });
  }, [patch]);

  const reset = useCallback(() => {
    teardown();
    key.current = null;
    started.current = false;
    // Send mode resets in place; receive mode returns to the home (send) page.
    if (state.role === 'receive') {
      window.location.href = window.location.origin + '/';
      return;
    }
    dispatch({ type: 'RESET' });
  }, [state.role, teardown]);

  // Large-file convenience: let the receiver stream straight to disk. Must be
  // invoked from a click (user gesture) and only before bytes start arriving.
  const chooseDisk = useCallback(async () => {
    if (!receiver.current || receiver.current.meta) return;
    const sink = await pickDiskSink({ name: 'beam-download' });
    if (sink) {
      receiver.current.sink = sink;
      patch({ diskChosen: true });
    }
  }, [patch]);

  const canStreamToDisk =
    state.role === 'receive' &&
    typeof window !== 'undefined' &&
    typeof window.showSaveFilePicker === 'function' &&
    !state.meta &&
    (state.phase === 'linking' || state.phase === 'live') &&
    // Only worth offering for genuinely large transfers; if we don't yet know
    // the size we still allow it as an explicit user choice.
    true;

  return {
    ...state,
    largeThreshold: STREAM_TO_DISK_THRESHOLD,
    canStreamToDisk,
    // actions
    selectFile,
    setEncrypted,
    cancel,
    reset,
    chooseDisk,
  };
}

/** Map raw/internal errors to a calm, user-facing sentence. */
function friendlyError(err) {
  const m = (err && err.message) || String(err || 'unknown');
  switch (m) {
    case 'not-found':
      return 'That share room no longer exists. Ask the sender for a fresh link.';
    case 'full':
      return 'This room already has two people in it.';
    case 'already-joined':
      return 'You are already connected to this room in another tab.';
    case 'empty-room':
      return 'The sender has left. Ask them to create a new link.';
    case 'create-failed':
      return 'Could not reach the signaling server. Check your connection and retry.';
    case 'channel-closed':
    case 'channel-close':
      return 'The connection closed before the transfer finished.';
    default:
      if (/decrypt|key/i.test(m))
        return 'Decryption failed — the link may be missing its key or was altered.';
      if (/integrity|corrupt/i.test(m))
        return 'A chunk failed its integrity check, so the transfer was stopped.';
      return 'Something interrupted the transfer. You can try again.';
  }
}
