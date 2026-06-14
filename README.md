# Beam — Direct Browser-to-Browser File Transfer

Beam sends a file straight from one browser to another. No upload, no account, no copy of your file sitting on someone's server. You drop a file, you get a link, and the moment the other person opens it their browser connects **directly** to yours over WebRTC and the file streams across — encrypted, chunk-by-chunk, and verified end to end.

A tiny Node.js signaling server introduces the two browsers to each other and then gets out of the way. It never reads, buffers, or stores a single byte of the file.

> Built for the MARS Open Projects 2026 problem statement *“P2P Web Share — Direct Browser-to-Browser File Transfer.”* Everything here — the transfer engine, the wire protocol, the UI — is original work.

---

## Table of contents

- [What it does](#what-it-does)
- [Architecture](#architecture)
- [How a transfer actually works](#how-a-transfer-actually-works)
- [The security model](#the-security-model)
- [Tech stack](#tech-stack)
- [Repository layout](#repository-layout)
- [Run it locally](#run-it-locally)
- [Testing a real transfer](#testing-a-real-transfer)
- [Configuration](#configuration)
- [Deployment](#deployment)
- [Browser support](#browser-support)
- [Design notes](#design-notes)
- [Scope and honest limitations](#scope-and-honest-limitations)

---

## What it does

**Core features (all implemented):**

- **Share-room creation** — drag-and-drop (or browse) a file. Beam opens a unique room and gives you a link + QR code. The 50 MB advisory limit keeps things comfortably in browser memory; larger files still work.
- **Signaling handshake** — a Node.js + Socket.io backend coordinates the WebRTC offer/answer/ICE exchange between the two peers.
- **Direct P2P transfer** — the file is read locally (`Blob.arrayBuffer()`, with a `FileReader` fallback) and streamed over a WebRTC data channel. Nothing transits the server.
- **Per-chunk verification** — every chunk carries a SHA-256 of its plaintext, re-hashed and checked on arrival. Any mismatch stops the transfer immediately.
- **Live progress & connection status** — real-time percentage, transfer speed (MB/s), ETA, chunk count, and a connection-state badge.
- **Graceful disconnect handling** — closing a tab or dropping the connection never crashes the app; the other side is told clearly and nothing half-written is kept.
- **Auto-download** — verified chunks are reassembled and the download triggers automatically on completion.

**Advanced extensions (implemented):**

- **Zero-knowledge encryption** — chunks are AES-GCM (256-bit) encrypted in the browser before they leave. The key is generated client-side and travels **only in the URL fragment** (`/r/<room>#k=…`), which browsers never send to the server.
- **End-to-end transfer fingerprint** — beyond per-chunk hashes, Beam computes a SHA-256 over the concatenation of every chunk hash (a flat Merkle root) on both ends and compares them. Matching fingerprints prove the reassembled file is bit-for-bit identical.
- **Large-file streaming to disk** — when the receiver's browser supports the File System Access API, big files can be written straight to disk as they arrive instead of being held in memory.
- **Backpressure-aware sending** — the sender watches the data channel's buffer and pauses when it backs up, so large files don't drown and kill the connection.
- **In-session resume / gap-fill** — chunks are self-describing (the index lives in the frame), so the receiver can detect missing pieces and ask the sender to resend from the last verified chunk rather than restarting.

---

## Architecture

```
        ┌─────────────────────────┐
        │   Signaling server      │   Node.js · Express · Socket.io
        │   (Render / Railway)    │   • mints rooms
        │                         │   • relays offer/answer/ICE
        │   never sees file bytes │   • announces peer join/leave
        └───────────▲─────────────┘
                    │  WebSocket (handshake only)
        ┌───────────┴───────────┐
        │                       │
 ┌──────┴───────┐        ┌──────┴───────┐
 │  Sender's    │        │  Receiver's  │
 │  browser     │        │  browser     │
 │  (React)     │        │  (React)     │
 └──────┬───────┘        └──────┬───────┘
        │                       │
        └───── WebRTC data ─────┘
           channel: the file
       (encrypted, chunked, hashed)
            — direct, P2P —
```

The signaling server is on the WebSocket path **only during the handshake**. Once the data channel opens, file chunks flow directly between the two browsers and the server is no longer involved.

---

## How a transfer actually works

1. **Sender drops a file.** The browser generates an AES-GCM key, opens a room via the signaling server, and builds a share link with the key in the fragment.
2. **Sender shares the link.** Nothing has moved yet — the file is still only in the sender's browser.
3. **Receiver opens the link.** Their browser joins the room. The server tells the sender "a peer arrived."
4. **Handshake.** The sender (the peer already in the room) creates the data channel and sends a WebRTC offer; the receiver answers. ICE candidates are exchanged and buffered until the remote description is set, then flushed.
5. **Metadata.** Over the open channel the sender sends a small JSON descriptor (name, size, chunk size, total chunks, whether encrypted). The receiver wires up and replies `READY`, telling the sender which chunk to start from.
6. **Streaming.** For each chunk the sender: reads the slice → SHA-256 hashes the plaintext → (optionally) AES-GCM encrypts → packs a binary frame → sends it, pausing whenever the channel buffer is full.
7. **Verification.** The receiver decrypts (if needed), re-hashes, and rejects any chunk that doesn't match. Good chunks are written to the sink (memory or disk) at their declared index.
8. **Completion.** The sender sends `COMPLETE` with the transfer fingerprint. The receiver confirms it has every chunk, recomputes the fingerprint, compares, and auto-downloads. Done.

### Wire protocol

Two kinds of messages travel the channel:

- **Control messages** are JSON strings: `meta`, `ready`, `resume`, `ack`, `complete`, `cancel`.
- **Chunk messages** are self-describing binary frames:

```
 byte 0 ───────────── 4 ────────────────────── 36 ───────── 48 ──────────── end
 │ index (uint32 BE) │ SHA-256 of plaintext(32)│ AES-GCM IV(12)│ payload (cipher+tag
 │                   │                         │              │  or raw plaintext)
```

Because the index lives inside every frame, chunks can be placed correctly regardless of arrival order, and resume knows exactly what's already been received.

---

## The security model

This is where Beam goes beyond a bare WebRTC demo. Three independent guarantees:

**1. The server is blind.** Signaling only swaps the connection details needed to introduce two browsers. File bytes never touch it — they travel on the direct peer channel. The server logs connection metadata only, never file names or contents.

**2. Integrity → confidence.** Two layers:
- *Per chunk:* a SHA-256 of the plaintext rides in each frame and is re-checked on arrival. With AES-GCM on, the GCM auth tag also fails loudly on any tampering.
- *Whole file:* at the end, both sides hash the concatenation of all chunk hashes into a single fingerprint and compare. A match is proof the reassembled file is identical to the original — without ever needing to hold the entire file in memory to hash it.

**3. Zero-knowledge encryption.** The AES-GCM key is generated in the sender's browser, exported to a URL-safe string, and placed in the link's fragment (`#k=…`). Browsers never transmit the fragment to a server, so the key reaches the receiver without the signaling server — or anything logging requests in between — ever seeing it. The room only matches two peers; it can't read what they share.

---

## Tech stack

| Layer | Technology |
| --- | --- |
| Frontend | React 18, Vite, Tailwind CSS |
| P2P transport | WebRTC (`RTCPeerConnection` + `RTCDataChannel`), used directly |
| Crypto & hashing | Web Crypto API (AES-GCM, SHA-256) |
| Signaling backend | Node.js, Express, Socket.io |
| QR codes | `qrcode` |

WebRTC is used directly rather than through a wrapper, so the connection logic, backpressure handling, and protocol are all explicit and original.

---

## Repository layout

```
beam/
├── package.json            # root convenience scripts (install / dev / build both)
├── .gitignore
│
├── server/                 # signaling backend
│   ├── server.js           # Express + Socket.io; rooms, relay, cleanup
│   ├── package.json
│   └── .env.example
│
├── client/                 # React frontend (Vite)
│   ├── src/
│   │   ├── lib/
│   │   │   ├── crypto.js        # AES-GCM + SHA-256 (Web Crypto)
│   │   │   ├── signaling.js     # Socket.io client wrapper
│   │   │   ├── peer.js          # RTCPeerConnection + data channel
│   │   │   ├── protocol.js      # message types + binary frame format
│   │   │   ├── sender.js        # chunk → hash → encrypt → send (backpressure)
│   │   │   ├── receiver.js      # receive → decrypt → verify → reassemble
│   │   │   ├── links.js         # build/parse share URLs (key in fragment)
│   │   │   └── utils.js         # formatting + base64url + clipboard helpers
│   │   ├── hooks/
│   │   │   └── useBeam.js       # the state machine wiring it all together
│   │   ├── components/          # DropZone, ShareLink, Channel, TransferPanel…
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   ├── config.js
│   │   └── index.css
│   ├── package.json
│   ├── vite.config.js
│   ├── tailwind.config.js
│   ├── vercel.json             # SPA rewrite for /r/* routes
│   └── .env.example
│
└── README.md
```

---

## Run it locally

You'll need **Node.js 18+**.

### Quick start (one command)

From the repo root:

```bash
npm run install:all      # installs root, server, and client deps
npm run dev              # boots the signaling server + the client together
```

Then open <http://localhost:5173>. The signaling server comes up on <http://localhost:3001>. Defaults work out of the box; copy the `.env.example` files only if you want to override anything.

### Manual (two terminals)

Prefer to run each piece yourself:

**1) Signaling server**

```bash
cd server
npm install
cp .env.example .env      # optional; defaults are fine for local dev
npm run dev               # starts on http://localhost:3001
```

**2) Client**

```bash
cd client
npm install
cp .env.example .env      # VITE_SIGNALING_URL defaults to http://localhost:3001
npm run dev               # starts on http://localhost:5173
```

Open <http://localhost:5173>.

---

## Testing a real transfer

WebRTC needs two peers, so open **two browser windows** (or two devices on the same network):

1. In window A, drop a file. Copy the share link (or scan the QR with a phone).
2. Open that link in window B.
3. Watch the channel light up and the file transfer, verify, and download automatically.

Try these to see the engineering work:

- **Disconnect mid-transfer** — close window B while a large file is moving. Window A reports the drop cleanly instead of hanging.
- **Tamper check** — the per-chunk hash and fingerprint mean any corruption stops the transfer with a clear message rather than a silently broken file.
- **Encryption** — notice the key (`#k=…`) in the link. Remove it and the receiver gets a clear "missing key" error.

> A note on localhost: the Web Crypto API and clipboard require a secure context. `http://localhost` counts as secure, so local dev works. When deployed, serve over HTTPS (Vercel/Netlify/Render all do by default).

---

## Configuration

**Server (`server/.env`)**

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3001` | Port to listen on |
| `CLIENT_ORIGIN` | `http://localhost:5173` | Allowed CORS origin(s), comma-separated. Set to your deployed frontend URL in production. |
| `ROOM_CAPACITY` | `2` | Max peers per room (2 = one-to-one) |

**Client (`client/.env`)**

| Variable | Default | Purpose |
| --- | --- | --- |
| `VITE_SIGNALING_URL` | `http://localhost:3001` | URL of the signaling server |
| `VITE_TURN_URL` | — | Optional TURN server URL (see below) |
| `VITE_TURN_USERNAME` | — | TURN username |
| `VITE_TURN_CREDENTIAL` | — | TURN credential |

**About TURN:** Beam ships with public Google STUN servers, which let peers punch through most home and office NATs. On strict/symmetric NATs where no direct path exists, you'll want a TURN relay as a fallback — supply its credentials via the env vars above. (TURN relays the encrypted stream when a direct path is impossible; the data stays end-to-end encrypted regardless.)

---

## Deployment

Beam is two independent deployables.

**Frontend → Vercel or Netlify**

- Root directory: `client`
- Build command: `npm run build`
- Output directory: `dist`
- Set `VITE_SIGNALING_URL` to your deployed backend URL.
- SPA routing for `/r/*` links is already handled: `vercel.json` (Vercel) and `public/_redirects` (Netlify) rewrite all routes to `index.html`.

**Backend → Render or Railway**

- Root directory: `server`
- Start command: `npm start`
- Set `CLIENT_ORIGIN` to your deployed frontend URL (this is required for CORS).
- The server is stateless apart from in-memory rooms, so a single small instance is plenty.

After both are live, update `CLIENT_ORIGIN` (backend) and `VITE_SIGNALING_URL` (frontend) to point at each other, and redeploy.

---

## Browser support

Works in current Chrome, Edge, Firefox, and Safari — all of which support WebRTC data channels and the Web Crypto API. Streaming-to-disk for very large files uses the File System Access API (Chromium-based browsers); elsewhere Beam falls back to assembling in memory and downloading, which is the standard path for files within the advisory size limit.

---

## Design notes

The interface is built around one signature element: a live **secure channel** between two nodes, where the file's progress *is* the data visibly travelling down an encrypted wire — not a generic progress bar bolted on afterward. Colour encodes state throughout (teal = secure/verified/connected, coral = data in flight, red = dropped), the type system pairs Space Grotesk, Inter, and JetBrains Mono for display/body/data, and all motion respects `prefers-reduced-motion`. The goal was an interface that looks like what it is: a precise, secure instrument, not a template.

---

## Scope and honest limitations

- **One-to-one transfers.** Rooms are capped at two peers. Multi-peer mesh swarming (the optional brownie feature) is not implemented; the room model and protocol leave room to add it.
- **Resume is in-session.** Gap detection and resend from the last verified chunk work within a live session. Full auto-resume across a page reload would require persisting the received-chunk map (e.g. to IndexedDB); the self-describing frame format is designed to make that a natural extension.
- **One file per transfer.** Multi-file selection isn't wired up, though batching them would be straightforward.
- **NAT traversal.** STUN covers most networks; symmetric NATs need a TURN relay you provide.

---

Built with care for MARS Open Projects 2026.
