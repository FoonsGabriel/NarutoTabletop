/**
 * Sistema de Chamadas de Voz P2P (estilo Discord) integrado ao NarutoTabletop.
 *
 * - Utiliza WebRTC Mesh (RTCPeerConnection) com servidores STUN públicos do Google.
 * - Sinalização (SDP offer/answer e ICE candidates) via Supabase Realtime Broadcast.
 * - Detecção de fala em tempo real (Voice Activity Detection via Web Audio API AnalyserNode).
 * - Controle de volume individual por participante, mute e deafen (ensurdecer).
 */

import { supabase } from './supabase/client';

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
  ],
};

class VoiceCallManager {
  constructor() {
    this.roomId = null;
    this.playerId = null;
    this.playerName = 'Ninja';
    this.channel = null;

    this.localStream = null;
    this.audioCtx = null;
    this.analyser = null;
    this.vadTimer = null;

    // peerId -> { pc: RTCPeerConnection, stream: MediaStream, audioEl: HTMLAudioElement, analyser, speaking, volume }
    this.peers = new Map();

    // peerId -> { id, name, muted, deafened, speaking, volume, joinedAt }
    this.participants = new Map();

    this.isMuted = false;
    this.isDeafened = false;
    this.isSpeaking = false;
    this.isConnected = false;
    this.listeners = new Set();
  }

  notify() {
    const state = this.getState();
    this.listeners.forEach((fn) => {
      try { fn(state); } catch (e) { console.error('Erro no ouvinte de voz:', e); }
    });
  }

  onStateChange(fn) {
    this.listeners.add(fn);
    fn(this.getState());
    return () => this.listeners.delete(fn);
  }

  getState() {
    return {
      isConnected: this.isConnected,
      isMuted: this.isMuted,
      isDeafened: this.isDeafened,
      isSpeaking: this.isSpeaking,
      participants: Array.from(this.participants.values()),
    };
  }

  /**
   * Conecta à chamada de voz da sala.
   */
  async join({ roomId, playerId, playerName }) {
    if (this.isConnected) return;
    this.roomId = roomId;
    this.playerId = playerId;
    this.playerName = playerName || 'Ninja';

    try {
      // 1. Captura o microfone local
      // navigator.mediaDevices só existe em contextos seguros (HTTPS ou localhost).
      // Em HTTP puro ele é undefined — usamos o fallback legado se disponível.
      const mediaDevices = navigator.mediaDevices;
      let stream;

      if (mediaDevices && mediaDevices.getUserMedia) {
        stream = await mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
          video: false,
        });
      } else if (navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia) {
        // Fallback legado para navegadores/contextos antigos
        const legacyGetUserMedia = (navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia).bind(navigator);
        stream = await new Promise((resolve, reject) => {
          legacyGetUserMedia(
            { audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false },
            resolve,
            reject
          );
        });
      } else {
        throw new Error(
          'Microfone indisponível. O site precisa estar em HTTPS (ou localhost) para usar chamadas de voz. '
          + 'Peça ao Mestre para servir o site com HTTPS.'
        );
      }

      this.localStream = stream;
      this.isConnected = true;
      this.isMuted = false;
      this.isDeafened = false;
      this.isSpeaking = false;

      // 2. Inicia detecção de voz local
      this.setupLocalVAD();

      // 3. Adiciona o próprio usuário aos participantes
      this.participants.set(this.playerId, {
        id: this.playerId,
        name: this.playerName,
        muted: false,
        deafened: false,
        speaking: false,
        isSelf: true,
        volume: 1,
      });

      // 4. Conecta ao canal de sinalização Supabase Realtime
      const channel = supabase.channel(`voice_room_${roomId}`, {
        config: { broadcast: { self: false }, presence: { key: this.playerId } },
      });

      channel
        .on('presence', { event: 'sync' }, () => this.handlePresenceSync())
        .on('presence', { event: 'join' }, ({ newPresences }) => this.handlePresenceJoin(newPresences))
        .on('presence', { event: 'leave' }, ({ leftPresences }) => this.handlePresenceLeave(leftPresences))
        .on('broadcast', { event: 'signal' }, ({ payload }) => this.handleSignal(payload))
        .on('broadcast', { event: 'user_state' }, ({ payload }) => this.handleRemoteUserState(payload))
        .subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
            await channel.track({
              id: this.playerId,
              name: this.playerName,
              muted: this.isMuted,
              deafened: this.isDeafened,
              speaking: false,
              joinedAt: Date.now(),
            });
          }
        });

      this.channel = channel;
      this.notify();
    } catch (err) {
      console.error('Erro ao conectar ao microfone / chamada:', err);
      this.leave();
      throw err;
    }
  }

  /**
   * Desconecta da chamada.
   */
  leave() {
    this.isConnected = false;

    // Para VAD
    if (this.vadTimer) clearInterval(this.vadTimer);
    if (this.audioCtx) {
      try { this.audioCtx.close(); } catch { /* ignore */ }
      this.audioCtx = null;
    }

    // Para tracks locais
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => track.stop());
      this.localStream = null;
    }

    // Fecha todas as conexões RTCPeerConnection
    this.peers.forEach((peer) => {
      try {
        peer.pc.close();
        if (peer.audioEl) {
          peer.audioEl.pause();
          peer.audioEl.srcObject = null;
          peer.audioEl.remove();
        }
      } catch { /* ignore */ }
    });
    this.peers.clear();
    this.participants.clear();

    // Sai do canal Supabase
    if (this.channel) {
      try {
        this.channel.untrack();
        supabase.removeChannel(this.channel);
      } catch { /* ignore */ }
      this.channel = null;
    }

    this.notify();
  }

  setupLocalVAD() {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const ctx = new AC();
      const src = ctx.createMediaStreamSource(this.localStream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.4;
      src.connect(analyser);

      this.audioCtx = ctx;
      this.analyser = analyser;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      let speakCounter = 0;

      this.vadTimer = setInterval(() => {
        if (this.isMuted || !this.isConnected) {
          if (this.isSpeaking) {
            this.isSpeaking = false;
            this.updateSelfSpeaking(false);
          }
          return;
        }

        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i += 1) sum += dataArray[i];
        const average = sum / dataArray.length;

        // Se o volume médio for acima do limiar
        const speakingNow = average > 14;
        if (speakingNow) {
          speakCounter = 6; // segura indicador por ~300ms
        } else if (speakCounter > 0) {
          speakCounter -= 1;
        }

        const currentlySpeaking = speakCounter > 0;
        if (currentlySpeaking !== this.isSpeaking) {
          this.isSpeaking = currentlySpeaking;
          this.updateSelfSpeaking(currentlySpeaking);
        }
      }, 50);
    } catch (e) {
      console.warn('VAD não suportado:', e);
    }
  }

  updateSelfSpeaking(speaking) {
    const self = this.participants.get(this.playerId);
    if (self) {
      self.speaking = speaking;
      this.notify();
    }
    this.broadcastUserState();
  }

  broadcastUserState() {
    if (!this.channel) return;
    this.channel.send({
      type: 'broadcast',
      event: 'user_state',
      payload: {
        id: this.playerId,
        name: this.playerName,
        muted: this.isMuted,
        deafened: this.isDeafened,
        speaking: this.isSpeaking,
      },
    });
  }

  handleRemoteUserState(payload) {
    if (!payload?.id || payload.id === this.playerId) return;
    const existing = this.participants.get(payload.id);
    if (existing) {
      Object.assign(existing, payload);
      this.notify();
    }
  }

  handlePresenceSync() {
    if (!this.channel) return;
    const presenceState = this.channel.presenceState();
    const activeIds = new Set();

    Object.values(presenceState).forEach((presences) => {
      presences.forEach((p) => {
        if (!p.id) return;
        activeIds.add(p.id);
        if (p.id === this.playerId) return;

        if (!this.participants.has(p.id)) {
          this.participants.set(p.id, {
            id: p.id,
            name: p.name || 'Ninja',
            muted: Boolean(p.muted),
            deafened: Boolean(p.deafened),
            speaking: false,
            volume: 1,
            isSelf: false,
          });
        }

        // Se o ID remoto for maior que o meu, eu crio a oferta (evita colisão de ofertas simultâneas)
        if (!this.peers.has(p.id) && this.playerId > p.id) {
          this.initiateCallTo(p.id);
        }
      });
    });

    // Remove quem saiu
    this.participants.forEach((_, id) => {
      if (id !== this.playerId && !activeIds.has(id)) {
        this.removePeer(id);
      }
    });

    this.notify();
  }

  handlePresenceJoin(newPresences) {
    newPresences.forEach((p) => {
      if (!p.id || p.id === this.playerId) return;
      if (!this.participants.has(p.id)) {
        this.participants.set(p.id, {
          id: p.id,
          name: p.name || 'Ninja',
          muted: Boolean(p.muted),
          deafened: Boolean(p.deafened),
          speaking: false,
          volume: 1,
          isSelf: false,
        });
      }
      if (!this.peers.has(p.id) && this.playerId > p.id) {
        this.initiateCallTo(p.id);
      }
    });
    this.notify();
  }

  handlePresenceLeave(leftPresences) {
    leftPresences.forEach((p) => {
      if (p.id) this.removePeer(p.id);
    });
    this.notify();
  }

  removePeer(peerId) {
    const peer = this.peers.get(peerId);
    if (peer) {
      try {
        peer.pc.close();
        if (peer.audioEl) {
          peer.audioEl.pause();
          peer.audioEl.srcObject = null;
          peer.audioEl.remove();
        }
      } catch { /* ignore */ }
      this.peers.delete(peerId);
    }
    this.participants.delete(peerId);
    this.notify();
  }

  createPeerConnection(remotePeerId) {
    if (this.peers.has(remotePeerId)) {
      return this.peers.get(remotePeerId).pc;
    }

    const pc = new RTCPeerConnection(ICE_SERVERS);
    const audioEl = new Audio();
    audioEl.autoplay = true;

    // Adiciona tracks de áudio locais
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach((track) => {
        pc.addTrack(track, this.localStream);
      });
    }

    // ICE candidates enviados via Supabase Realtime
    pc.onicecandidate = (event) => {
      if (event.candidate && this.channel) {
        this.channel.send({
          type: 'broadcast',
          event: 'signal',
          payload: {
            from: this.playerId,
            to: remotePeerId,
            type: 'candidate',
            candidate: event.candidate,
          },
        });
      }
    };

    // Recebe áudio remoto
    pc.ontrack = (event) => {
      const remoteStream = event.streams[0] || new MediaStream([event.track]);
      audioEl.srcObject = remoteStream;
      audioEl.muted = this.isDeafened;
      audioEl.volume = this.participants.get(remotePeerId)?.volume ?? 1;
      audioEl.play().catch(() => {
        console.warn('Autoplay bloqueado pelo navegador; toque na tela para ouvir');
      });

      this.setupRemoteVAD(remotePeerId, remoteStream);
    };

    const peerObj = { pc, audioEl, stream: null, pendingCandidates: [] };
    this.peers.set(remotePeerId, peerObj);
    return pc;
  }

  setupRemoteVAD(peerId, stream) {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      if (!this.audioCtx) this.audioCtx = new AC();
      const src = this.audioCtx.createMediaStreamSource(stream);
      const analyser = this.audioCtx.createAnalyser();
      analyser.fftSize = 256;
      src.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      let speakCounter = 0;

      const timer = setInterval(() => {
        if (!this.peers.has(peerId)) {
          clearInterval(timer);
          return;
        }

        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i += 1) sum += dataArray[i];
        const average = sum / dataArray.length;

        const speakingNow = average > 14;
        if (speakingNow) speakCounter = 5;
        else if (speakCounter > 0) speakCounter -= 1;

        const isSpeaking = speakCounter > 0;
        const participant = this.participants.get(peerId);
        if (participant && participant.speaking !== isSpeaking) {
          participant.speaking = isSpeaking;
          this.notify();
        }
      }, 60);
    } catch (e) {
      console.warn('VAD remoto indisponível:', e);
    }
  }

  async initiateCallTo(remotePeerId) {
    const pc = this.createPeerConnection(remotePeerId);
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      this.channel?.send({
        type: 'broadcast',
        event: 'signal',
        payload: {
          from: this.playerId,
          to: remotePeerId,
          type: 'offer',
          sdp: pc.localDescription,
        },
      });
    } catch (err) {
      console.error('Erro ao criar oferta WebRTC:', err);
    }
  }

  async handleSignal(payload) {
    if (!payload || payload.to !== this.playerId) return;
    const { from, type, sdp, candidate } = payload;
    const pc = this.createPeerConnection(from);
    const peerObj = this.peers.get(from);

    try {
      if (type === 'offer') {
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        // Processa candidatos pendentes recebidos antes da oferta
        if (peerObj?.pendingCandidates?.length) {
          for (const cand of peerObj.pendingCandidates) {
            try { await pc.addIceCandidate(new RTCIceCandidate(cand)); } catch { /* ignore */ }
          }
          peerObj.pendingCandidates = [];
        }

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        this.channel?.send({
          type: 'broadcast',
          event: 'signal',
          payload: {
            from: this.playerId,
            to: from,
            type: 'answer',
            sdp: pc.localDescription,
          },
        });
      } else if (type === 'answer') {
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        if (peerObj?.pendingCandidates?.length) {
          for (const cand of peerObj.pendingCandidates) {
            try { await pc.addIceCandidate(new RTCIceCandidate(cand)); } catch { /* ignore */ }
          }
          peerObj.pendingCandidates = [];
        }
      } else if (type === 'candidate' && candidate) {
        if (pc.remoteDescription && pc.remoteDescription.type) {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } else if (peerObj) {
          peerObj.pendingCandidates.push(candidate);
        }
      }
    } catch (err) {
      console.error('Erro ao processar sinal WebRTC:', err);
    }
  }

  /**
   * Liga/Desliga o microfone.
   */
  toggleMute() {
    this.isMuted = !this.isMuted;
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach((track) => {
        track.enabled = !this.isMuted;
      });
    }
    const self = this.participants.get(this.playerId);
    if (self) self.muted = this.isMuted;
    this.broadcastUserState();
    this.notify();
    return this.isMuted;
  }

  /**
   * Liga/Desliga o ensurdecer (deafen).
   */
  toggleDeafen() {
    this.isDeafened = !this.isDeafened;
    // Se ensurdeceu, muta o próprio microfone também (igual ao Discord)
    if (this.isDeafened && !this.isMuted) {
      this.toggleMute();
    }

    this.peers.forEach((peer) => {
      if (peer.audioEl) {
        peer.audioEl.muted = this.isDeafened;
      }
    });

    const self = this.participants.get(this.playerId);
    if (self) self.deafened = this.isDeafened;
    this.broadcastUserState();
    this.notify();
    return this.isDeafened;
  }

  /**
   * Ajusta o volume de um jogador específico (0 a 1).
   */
  setPeerVolume(peerId, volume) {
    const v = Math.min(1, Math.max(0, Number(volume) || 0));
    const peer = this.peers.get(peerId);
    if (peer?.audioEl) {
      peer.audioEl.volume = v;
    }
    const p = this.participants.get(peerId);
    if (p) {
      p.volume = v;
      this.notify();
    }
  }
}

export const voiceCall = new VoiceCallManager();

// Desbloqueia áudios remotos em caso de bloqueio de autoplay do navegador
if (typeof window !== 'undefined') {
  const unlockRemoteAudio = () => {
    voiceCall.peers.forEach((peer) => {
      if (peer.audioEl && peer.audioEl.paused && !voiceCall.isDeafened) {
        peer.audioEl.play().catch(() => {});
      }
    });
  };
  window.addEventListener('pointerdown', unlockRemoteAudio);
}
