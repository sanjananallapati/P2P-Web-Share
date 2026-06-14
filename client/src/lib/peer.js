import { ICE_SERVERS, BUFFER_LOW_WATER } from '../config.js';

/**
 * A focused wrapper around a single RTCPeerConnection + one data channel.
 *
 * Roles are fixed by the signaling layer to avoid negotiation "glare":
 *   - The peer already in the room is the INITIATOR. It creates the data
 *     channel and sends the offer.
 *   - The peer that just joined is the RESPONDER. It waits for the offer and
 *     replies with an answer.
 *
 * ICE candidates can arrive before the remote description is set, so we buffer
 * them and flush once the description lands — a common source of flaky
 * connections when skipped.
 */
export class Peer {
  /**
   * @param {object} opts
   * @param {boolean} opts.initiator  true if this side creates the offer
   * @param {(data:any)=>void} opts.signalSend  send an opaque payload to the peer
   */
  constructor({ initiator, signalSend }) {
    this.initiator = initiator;
    this.signalSend = signalSend;
    this.listeners = new Map();
    this.pendingCandidates = [];
    this.remoteDescriptionSet = false;
    this.closed = false;

    this.pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    this.channel = null;

    this.pc.onicecandidate = (e) => {
      if (e.candidate) {
        this.signalSend({ type: 'candidate', candidate: e.candidate });
      }
    };

    this.pc.onconnectionstatechange = () => {
      const state = this.pc.connectionState;
      this.emit('state', { state });
      if (state === 'failed' || state === 'closed') {
        this.emit('failed', { state });
      }
    };

    // The responder receives the channel; the initiator makes it (in start()).
    this.pc.ondatachannel = (e) => this._bindChannel(e.channel);
  }

  /** Kick off negotiation. Only the initiator does meaningful work here. */
  async start() {
    if (!this.initiator) return; // responder waits for the offer
    const channel = this.pc.createDataChannel('beam', {
      ordered: true, // reliable + ordered: required for clean file reassembly
    });
    this._bindChannel(channel);

    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    this.signalSend({ type: 'offer', sdp: this.pc.localDescription });
  }

  /** Feed a payload that arrived from the remote peer via signaling. */
  async handleSignal(data) {
    if (this.closed) return;
    try {
      if (data.type === 'offer') {
        await this.pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
        this.remoteDescriptionSet = true;
        await this._flushCandidates();
        const answer = await this.pc.createAnswer();
        await this.pc.setLocalDescription(answer);
        this.signalSend({ type: 'answer', sdp: this.pc.localDescription });
      } else if (data.type === 'answer') {
        await this.pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
        this.remoteDescriptionSet = true;
        await this._flushCandidates();
      } else if (data.type === 'candidate') {
        if (this.remoteDescriptionSet) {
          await this.pc.addIceCandidate(new RTCIceCandidate(data.candidate));
        } else {
          this.pendingCandidates.push(data.candidate);
        }
      }
    } catch (err) {
      this.emit('error', err);
    }
  }

  async _flushCandidates() {
    const queued = this.pendingCandidates.splice(0);
    for (const c of queued) {
      try {
        await this.pc.addIceCandidate(new RTCIceCandidate(c));
      } catch {
        /* a late/duplicate candidate is harmless */
      }
    }
  }

  _bindChannel(channel) {
    this.channel = channel;
    channel.binaryType = 'arraybuffer';
    channel.bufferedAmountLowThreshold = BUFFER_LOW_WATER;

    channel.onopen = () => this.emit('channel-open');
    channel.onclose = () => this.emit('channel-close');
    channel.onerror = (e) => this.emit('error', e.error || e);
    channel.onmessage = (e) => this.emit('message', e.data);
  }

  /** Send a string (control) or ArrayBuffer (chunk) over the data channel. */
  send(data) {
    this.channel?.send(data);
  }

  get bufferedAmount() {
    return this.channel?.bufferedAmount ?? 0;
  }

  get isOpen() {
    return this.channel?.readyState === 'open';
  }

  /** Resolve once the send buffer has drained below the low-water mark. */
  waitForDrain() {
    return new Promise((resolve) => {
      if (!this.channel) return resolve();
      const onLow = () => {
        this.channel.removeEventListener('bufferedamountlow', onLow);
        resolve();
      };
      this.channel.addEventListener('bufferedamountlow', onLow);
    });
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

  close() {
    this.closed = true;
    this.listeners.clear();
    try {
      this.channel?.close();
    } catch {
      /* ignore */
    }
    try {
      this.pc.close();
    } catch {
      /* ignore */
    }
  }
}
