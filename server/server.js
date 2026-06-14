/**
 * Beam — Signaling Server
 * ------------------------
 * A deliberately "dumb" matchmaker. Its only jobs are:
 *   1. Mint a room when a sender wants to share a file.
 *   2. Let a receiver join that room.
 *   3. Relay the WebRTC handshake (offers, answers, ICE candidates) between the
 *      two browsers so they can open a direct peer connection.
 *   4. Tell the other side when a peer leaves.
 *
 * It NEVER sees, reads, buffers, or stores a single byte of the file. Once the
 * two browsers are connected, the file streams directly between them over an
 * encrypted WebRTC data channel and this server is no longer in the loop.
 */

const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const crypto = require('crypto');

const PORT = process.env.PORT || 3001;

// Comma-separated list of origins allowed to talk to this server.
// In production set CLIENT_ORIGIN to your deployed frontend URL.
const ALLOWED_ORIGINS = (process.env.CLIENT_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map((o) => o.trim());

// A room is 1-to-1 by default: one host (sender) + one guest (receiver).
const ROOM_CAPACITY = Number(process.env.ROOM_CAPACITY || 2);

// ---------------------------------------------------------------------------
// HTTP layer — just enough for health checks. No file routes exist on purpose.
// ---------------------------------------------------------------------------
const app = express();

app.get('/', (_req, res) => {
  res.json({ service: 'beam-signaling', status: 'ok', rooms: rooms.size });
});

app.get('/healthz', (_req, res) => res.send('ok'));

const httpServer = http.createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: ALLOWED_ORIGINS,
    methods: ['GET', 'POST'],
  },
});

// ---------------------------------------------------------------------------
// Room registry. Map<roomId, { hostId, members: Set<socketId>, createdAt }>
// Kept entirely in memory — rooms are ephemeral and disappear when empty.
// ---------------------------------------------------------------------------
const rooms = new Map();

// Human-friendly, URL-safe room id. Avoids look-alike characters (0/O, 1/l/I).
const ID_ALPHABET = '23456789abcdefghijkmnpqrstuvwxyz';
function makeRoomId(length = 8) {
  const bytes = crypto.randomBytes(length);
  let id = '';
  for (let i = 0; i < length; i++) {
    id += ID_ALPHABET[bytes[i] % ID_ALPHABET.length];
  }
  // Vanishingly unlikely to collide, but guarantee uniqueness anyway.
  return rooms.has(id) ? makeRoomId(length) : id;
}

// ---------------------------------------------------------------------------
// Socket lifecycle
// ---------------------------------------------------------------------------
io.on('connection', (socket) => {
  // Track which room this socket belongs to, so we can clean up on disconnect.
  socket.data.roomId = null;

  /**
   * Sender opens a room. The creator becomes the host and will be the one to
   * initiate the WebRTC offer once a guest arrives.
   */
  socket.on('create-room', (cb) => {
    const roomId = makeRoomId();
    rooms.set(roomId, {
      hostId: socket.id,
      members: new Set([socket.id]),
      createdAt: Date.now(),
    });
    socket.data.roomId = roomId;
    socket.join(roomId);
    log('room created', { roomId, host: socket.id });
    respond(cb, { ok: true, roomId });
  });

  /**
   * Receiver joins an existing room. We notify the host so the host can start
   * the handshake. The newcomer stays passive and waits for the offer — this
   * is how we avoid "glare" (both sides offering at once).
   */
  socket.on('join-room', ({ roomId } = {}, cb) => {
    const room = roomId && rooms.get(roomId);

    if (!room) {
      return respond(cb, { ok: false, error: 'not-found' });
    }
    if (room.members.has(socket.id)) {
      return respond(cb, { ok: false, error: 'already-joined' });
    }
    if (room.members.size >= ROOM_CAPACITY) {
      return respond(cb, { ok: false, error: 'full' });
    }

    room.members.add(socket.id);
    socket.data.roomId = roomId;
    socket.join(roomId);
    log('peer joined', { roomId, peer: socket.id });

    // Tell everyone already in the room that a new peer arrived.
    socket.to(roomId).emit('peer-joined', { peerId: socket.id });

    // Hand the joiner the list of peers already present (the host).
    const peers = [...room.members].filter((id) => id !== socket.id);
    respond(cb, { ok: true, peers });
  });

  /**
   * Blind relay for WebRTC signaling. We forward `data` to the target socket
   * without inspecting it — it is opaque SDP / ICE payload to us.
   */
  socket.on('signal', ({ to, data } = {}) => {
    if (!to || !data) return;
    io.to(to).emit('signal', { from: socket.id, data });
  });

  /** Explicit leave (e.g. user starts a new transfer). */
  socket.on('leave-room', () => leaveRoom(socket));

  socket.on('disconnect', () => {
    leaveRoom(socket);
  });
});

/**
 * Remove a socket from its room and notify the remaining peer so the UI can
 * react gracefully instead of hanging on a dead connection.
 */
function leaveRoom(socket) {
  const roomId = socket.data.roomId;
  if (!roomId) return;

  const room = rooms.get(roomId);
  socket.data.roomId = null;
  socket.leave(roomId);

  if (!room) return;

  room.members.delete(socket.id);
  socket.to(roomId).emit('peer-left', { peerId: socket.id });
  log('peer left', { roomId, peer: socket.id });

  // Drop the room once nobody is left.
  if (room.members.size === 0) {
    rooms.delete(roomId);
    log('room closed', { roomId });
  } else if (room.hostId === socket.id) {
    // If the host left, promote the next member so the room stays usable.
    room.hostId = [...room.members][0];
  }
}

// Tiny helpers ---------------------------------------------------------------
function respond(cb, payload) {
  if (typeof cb === 'function') cb(payload);
}

function log(event, detail) {
  // Note: we intentionally never log file names or contents — only connection
  // metadata, because the server has no business knowing what is being shared.
  console.log(`[beam] ${event}`, JSON.stringify(detail));
}

// Sweep out rooms that were created but never used (e.g. sender closed the tab
// before anyone joined). Runs every few minutes.
const ROOM_TTL_MS = 1000 * 60 * 30; // 30 minutes
setInterval(() => {
  const now = Date.now();
  for (const [roomId, room] of rooms) {
    if (room.members.size === 0 || now - room.createdAt > ROOM_TTL_MS) {
      rooms.delete(roomId);
    }
  }
}, 1000 * 60 * 5).unref();

httpServer.listen(PORT, () => {
  console.log(`[beam] signaling server listening on :${PORT}`);
  console.log(`[beam] allowed origins: ${ALLOWED_ORIGINS.join(', ')}`);
});
