import { io } from 'socket.io-client';
import { SIGNALING_URL } from '../config.js';

/**
 * Thin, promise-friendly wrapper around the Socket.io signaling connection.
 * The rest of the app never touches socket.io directly — it talks to this.
 *
 * Events emitted (subscribe with `.on(name, handler)`):
 *   - 'status'      { state }            connection lifecycle
 *   - 'peer-joined' { peerId }           someone joined our room
 *   - 'peer-left'   { peerId }           someone left / dropped
 *   - 'signal'      { from, data }       relayed WebRTC payload
 */
export class Signaling {
  constructor() {
    this.socket = null;
    this.listeners = new Map();
  }

  connect() {
    if (this.socket) return;
    this.socket = io(SIGNALING_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 8,
      reconnectionDelay: 800,
    });

    this.socket.on('connect', () => this.emit('status', { state: 'connected' }));
    this.socket.on('disconnect', (reason) =>
      this.emit('status', { state: 'disconnected', reason })
    );
    this.socket.on('connect_error', (err) =>
      this.emit('status', { state: 'error', message: err.message })
    );
    this.socket.io.on('reconnect_attempt', () =>
      this.emit('status', { state: 'reconnecting' })
    );

    this.socket.on('peer-joined', (p) => this.emit('peer-joined', p));
    this.socket.on('peer-left', (p) => this.emit('peer-left', p));
    this.socket.on('signal', (p) => this.emit('signal', p));
  }

  /** Ask the server to mint a room. Resolves with the room id. */
  createRoom() {
    return new Promise((resolve, reject) => {
      this.socket.emit('create-room', (res) => {
        if (res?.ok) resolve(res.roomId);
        else reject(new Error(res?.error || 'create-failed'));
      });
    });
  }

  /** Join an existing room. Resolves with the peers already present. */
  joinRoom(roomId) {
    return new Promise((resolve, reject) => {
      this.socket.emit('join-room', { roomId }, (res) => {
        if (res?.ok) resolve(res);
        else reject(new Error(res?.error || 'join-failed'));
      });
    });
  }

  /** Relay an opaque WebRTC payload to a specific peer. */
  signal(to, data) {
    this.socket?.emit('signal', { to, data });
  }

  leaveRoom() {
    this.socket?.emit('leave-room');
  }

  get id() {
    return this.socket?.id || null;
  }

  // --- tiny event emitter --------------------------------------------------
  on(event, handler) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event).add(handler);
    return () => this.listeners.get(event)?.delete(handler);
  }

  emit(event, payload) {
    this.listeners.get(event)?.forEach((h) => h(payload));
  }

  destroy() {
    this.listeners.clear();
    this.socket?.removeAllListeners();
    this.socket?.disconnect();
    this.socket = null;
  }
}
