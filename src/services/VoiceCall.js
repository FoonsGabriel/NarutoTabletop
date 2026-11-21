/**
 * Sistema de Chamadas de Voz P2P (estilo Discord) integrado ao NarutoTabletop.
 *
 * - Utiliza WebRTC Mesh (RTCPeerConnection) com servidores STUN públicos do Google.
 * - Sinalização (SDP offer/answer e ICE candidates) via Supabase Realtime Broadcast.
 * - Detecção de fala em tempo real (Voice Activity Detection via Web Audio API AnalyserNode).
 * - Controle de volume individual por participante, mute e deafen (ensurdecer).
 */

import { supabase } from './supabase/client';
import { VozProcessador } from './VozEfeitos';

// Aparelhos escolhidos em "Configurar câmera/fone/microfone" (só neste aparelho).
export function lerAparelhos() {
  try { return JSON.parse(window.localStorage.getItem('vtt_aparelhos') || '{}'); } catch { return {}; }
}
export function salvarAparelhos(dados) {
  try { window.localStorage.setItem('vtt_aparelhos', JSON.stringify({ ...lerAparelhos(), ...dados })); } catch { /* sem localStorage */ }
}
const ehCelular = () => typeof window !== 'undefined' && (window.matchMedia?.('(pointer: coarse)').matches || window.innerWidth < 768);

/** Áudio do microfone com o aparelho escolhido. */
const restricoesMic = (micId) => ({
  echoCancellation: true, noiseSuppression: true, autoGainControl: true,
  ...(micId ? { deviceId: { exact: micId } } : {}),
});
/**
 * Qualidade da câmera (seção 14 + Modo live):
 *  0 = miniatura (pouca internet para 5–6 pessoas) · 1 = média (jogadores vendo a live)
 *  2 = alta (o Mestre na tela de gravação, para gravar; ~2,5 Mbps). Cada um manda para cada pessoa a
 *  qualidade que ELA pediu; a câmera captura na maior qualidade que alguém pediu.
 */
const QUALIDADES = [
  { width: 320, height: 240, fps: 15, kbps: 150 },
  { width: 640, height: 480, fps: 24, kbps: 500 },
  { width: 1280, height: 720, fps: 30, kbps: 2500 },
];
const formatoCamera = (nivel = 0) => {
  const q = QUALIDADES[nivel] || QUALIDADES[0];
  return { width: { ideal: q.width }, height: { ideal: q.height }, frameRate: { ideal: q.fps, max: q.fps } };
};
const restricoesCamera = (cameraId, nivel = 0) => ({
  ...formatoCamera(nivel),
  ...(cameraId ? { deviceId: { exact: cameraId } } : {}),
});

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

    this.localStream = null; // o que vai para a chamada (já com efeito de voz)
    this.rawStream = null;   // microfone puro (detecção de fala)
    this.voz = null;         // VozProcessador
    this.efeitos = { voz: 'normal', ambiente: '' };
    this.audioCtx = null;
    this.analyser = null;
    this.vadTimer = null;

    // peerId -> { pc: RTCPeerConnection, stream: MediaStream, audioEl: HTMLAudioElement, analyser, speaking, volume }
    this.peers = new Map();

    // peerId -> { id, name, muted, deafened, speaking, volume, joinedAt }
    this.participants = new Map();

    // Câmeras (seção 14)
    this.camStream = null;
    this.cameraOn = false;
    this.querVideo = !ehCelular(); // celular só baixa os vídeos depois de tocar em "Câmeras"
    this.querHD = 0; // qualidade que eu quero receber (0 miniatura, 1 média, 2 alta) — Modo live
    // O que as telas pediram; enquanto o Mestre grava, vale vídeo + qualidade alta mesmo na tela normal.
    this.pedidoVideo = this.querVideo;
    this.pedidoHD = 0;
    this.gravando = false;
    this.remoteVideo = new Map(); // peerId -> MediaStream

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
      efeitos: this.efeitos,
      cameraOn: this.cameraOn,
      camStream: this.camStream,
      querVideo: this.querVideo,
      videos: Array.from(this.remoteVideo.entries()).map(([id, stream]) => ({ id, stream })),
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
        const { mic } = lerAparelhos();
        try {
          stream = await mediaDevices.getUserMedia({ audio: restricoesMic(mic), video: false });
        } catch (e) {
          // O microfone escolhido sumiu (desconectado): usa o padrão do aparelho.
          if (!mic) throw e;
          stream = await mediaDevices.getUserMedia({ audio: restricoesMic(null), video: false });
        }
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

      this.rawStream = stream;
      // Modificador de voz: a chamada recebe a voz já processada (seção 13).
      try {
        this.voz = new VozProcessador(stream);
        this.voz.definir(this.efeitos);
        this.localStream = new MediaStream([this.voz.track]);
      } catch (e) {
        console.warn('Modificador de voz indisponível; usando o microfone puro:', e);
        this.voz = null;
        this.localStream = stream;
      }
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
        .on('broadcast', { event: 'camera_off' }, ({ payload }) => {
          // O Mestre desligou a minha câmera (ex.: momento de suspense).
          if (payload?.to === this.playerId) this.desligarCamera();
        })
        .subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
            await channel.track({
              id: this.playerId,
              name: this.playerName,
              muted: this.isMuted,
              deafened: this.isDeafened,
              speaking: false,
              camera: this.cameraOn,
              querVideo: this.querVideo,
              querHD: this.querHD,
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
    if (this.rawStream) {
      this.rawStream.getTracks().forEach((track) => track.stop());
      this.rawStream = null;
    }
    this.voz?.fechar();
    this.voz = null;
    if (this.camStream) this.camStream.getTracks().forEach((track) => track.stop());
    this.camStream = null;
    this.cameraOn = false;
    this.remoteVideo.clear();

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
      const src = ctx.createMediaStreamSource(this.rawStream || this.localStream);
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
        camera: this.cameraOn,
        querVideo: this.querVideo,
        querHD: this.querHD,
      },
    });
  }

  handleRemoteUserState(payload) {
    if (!payload?.id || payload.id === this.playerId) return;
    const existing = this.participants.get(payload.id);
    if (existing) {
      const queriaAntes = existing.querVideo;
      const hdAntes = existing.querHD || 0;
      Object.assign(existing, payload);
      if (Boolean(queriaAntes) !== Boolean(payload.querVideo) || hdAntes !== (payload.querHD || 0)) this.atualizarVideoPara(payload.id);
      if (hdAntes !== (payload.querHD || 0)) this.ajustarCaptura();
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
            camera: Boolean(p.camera),
            querVideo: p.querVideo !== false,
          querHD: Number(p.querHD || 0),
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
          camera: Boolean(p.camera),
          querVideo: p.querVideo !== false,
          querHD: Number(p.querHD || 0),
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
    this.remoteVideo.delete(peerId);
    this.participants.delete(peerId);
    this.ajustarCaptura(); // quem pedia câmera boa saiu: volta a economizar
    this.notify();
  }

  createPeerConnection(remotePeerId) {
    if (this.peers.has(remotePeerId)) {
      return this.peers.get(remotePeerId).pc;
    }

    const pc = new RTCPeerConnection(ICE_SERVERS);
    const audioEl = new Audio();
    audioEl.autoplay = true;
    const { fone } = lerAparelhos();
    if (fone && audioEl.setSinkId) audioEl.setSinkId(fone).catch(() => {});

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
      if (event.track.kind === 'video') {
        // Canal de vídeo do outro lado (fica reservado; a imagem só vem quando ele liga a câmera
        // e eu quero vídeo). A tela mostra só quem está com a câmera ligada.
        this.remoteVideo.set(remotePeerId, new MediaStream([event.track]));
        event.track.onunmute = () => this.notify();
        this.notify();
        return;
      }
      const remoteStream = new MediaStream([event.track]);
      audioEl.srcObject = remoteStream;
      audioEl.muted = this.isDeafened;
      audioEl.volume = this.participants.get(remotePeerId)?.volume ?? 1;
      audioEl.play().catch(() => {
        console.warn('Autoplay bloqueado pelo navegador; toque na tela para ouvir');
      });

      this.setupRemoteVAD(remotePeerId, remoteStream);
    };

    // Conectou: aplica a qualidade da câmera (antes disso o navegador não deixa).
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        const p = this.peers.get(remotePeerId);
        if (p) p.kbps = null;
        this.atualizarVideoPara(remotePeerId);
      }
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
      // Canal de vídeo reservado desde o início: ligar a câmera depois não precisa reconectar.
      const peerObj = this.peers.get(remotePeerId);
      if (peerObj && !peerObj.videoTx) peerObj.videoTx = pc.addTransceiver('video', { direction: 'sendrecv' });
      this.atualizarVideoPara(remotePeerId);
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
        const tx = pc.getTransceivers().find((t) => t.receiver.track?.kind === 'video');
        if (tx && peerObj) {
          tx.direction = 'sendrecv';
          peerObj.videoTx = tx;
          this.atualizarVideoPara(from);
        }
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

  // ---------------------------------------------------------------
  // Câmeras (seção 14)
  // ---------------------------------------------------------------

  /** Manda (ou para de mandar) a minha câmera para um participante: só se ele quer vídeo. */
  atualizarVideoPara(peerId) {
    const peer = this.peers.get(peerId);
    const sender = peer?.videoTx?.sender;
    if (!sender) return;
    const quer = this.participants.get(peerId)?.querVideo !== false;
    const track = this.cameraOn && quer ? this.camStream?.getVideoTracks()[0] || null : null;
    sender.replaceTrack(track).catch((e) => console.warn('Erro ao trocar o vídeo:', e));
    const nivel = Number(this.participants.get(peerId)?.querHD || 0);
    const q = QUALIDADES[nivel] || QUALIDADES[0];
    if (track && peer.kbps !== q.kbps) {
      try {
        const params = sender.getParameters();
        // Antes da conexão terminar o navegador ainda não tem as "encodings": tenta de novo ao conectar.
        if (!params.encodings?.length) return;
        params.encodings[0].maxBitrate = q.kbps * 1000; // miniatura ~150 kbps; live até ~2,5 Mbps
        params.encodings[0].maxFramerate = q.fps;
        params.encodings[0].scaleResolutionDownBy = 1;
        // Na live, internet fraca diminui os quadros por segundo, não a nitidez da imagem.
        params.degradationPreference = nivel >= 1 ? 'maintain-resolution' : 'balanced';
        sender.setParameters(params)
          .then(() => { peer.kbps = q.kbps; })
          .catch((e) => console.warn('Qualidade da câmera não aplicada:', e));
      } catch { /* navegador sem setParameters */ }
    }
  }

  /** Maior qualidade que alguém (ou eu, na tela de gravação) está pedindo agora. */
  nivelCaptura() {
    let nivel = this.querHD || 0;
    this.participants.forEach((p, id) => { if (id !== this.playerId) nivel = Math.max(nivel, Number(p.querHD || 0)); });
    return Math.min(2, nivel);
  }

  /** Muda a resolução da minha câmera sem desligar (quando alguém abre/fecha a tela de gravação). */
  ajustarCaptura() {
    const track = this.camStream?.getVideoTracks()[0];
    const nivel = this.nivelCaptura();
    if (!track || this.nivelAtual === nivel) return;
    this.nivelAtual = nivel;
    track.applyConstraints(formatoCamera(nivel)).catch(() => {});
  }

  /** Modo live: 2 = Mestre gravando (alta), 1 = vendo a live (média), 0 = miniatura. */
  setQuerHD(nivel) {
    this.pedidoHD = Math.max(0, Math.min(2, Number(nivel) || 0));
    this.querHD = this.gravando ? 2 : this.pedidoHD;
    this.ajustarCaptura();
    this.broadcastUserState();
    this.notify();
  }

  async ligarCamera() {
    if (this.cameraOn) return;
    const { camera } = lerAparelhos();
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: restricoesCamera(camera, this.nivelCaptura()), audio: false });
    } catch (e) {
      if (!camera) throw e;
      stream = await navigator.mediaDevices.getUserMedia({ video: restricoesCamera(null, this.nivelCaptura()), audio: false });
    }
    this.camStream = stream;
    this.nivelAtual = this.nivelCaptura();
    this.cameraOn = true;
    this.peers.forEach((p, id) => { p.kbps = null; this.atualizarVideoPara(id); });
    this.broadcastUserState();
    this.notify();
  }

  desligarCamera() {
    if (this.camStream) this.camStream.getTracks().forEach((track) => track.stop());
    this.camStream = null;
    this.cameraOn = false;
    this.peers.forEach((_, id) => this.atualizarVideoPara(id));
    this.broadcastUserState();
    this.notify();
  }

  /** Celular: só baixa os vídeos dos outros depois de tocar em "Câmeras". */
  setQuerVideo(quer) {
    this.pedidoVideo = Boolean(quer);
    this.querVideo = this.pedidoVideo || this.gravando;
    this.broadcastUserState();
    this.notify();
  }

  /** Gravação da tela de gravação: recebe todos os vídeos em qualidade alta enquanto grava. */
  setGravando(sim) {
    this.gravando = Boolean(sim);
    this.setQuerVideo(this.pedidoVideo);
    this.setQuerHD(this.pedidoHD);
  }

  /** Mestre: desliga a câmera de outro participante. */
  pedirDesligarCamera(peerId) {
    this.channel?.send({ type: 'broadcast', event: 'camera_off', payload: { to: peerId } });
  }

  /** Troca o microfone sem sair da chamada. */
  async trocarMicrofone(micId) {
    salvarAparelhos({ mic: micId || '' });
    if (!this.isConnected) return;
    const novo = await navigator.mediaDevices.getUserMedia({ audio: restricoesMic(micId), video: false });
    this.rawStream?.getTracks().forEach((track) => track.stop());
    this.rawStream = novo;
    if (this.voz) this.voz.trocarFonte(novo);
    else {
      // Sem modificador de voz: troca a faixa enviada direto.
      const track = novo.getAudioTracks()[0];
      this.peers.forEach((peer) => peer.pc.getSenders().filter((sd) => sd.track?.kind === 'audio').forEach((sd) => sd.replaceTrack(track)));
      this.localStream = novo;
    }
    novo.getAudioTracks().forEach((track) => { track.enabled = !this.isMuted; });
    if (this.vadTimer) clearInterval(this.vadTimer);
    this.setupLocalVAD();
  }

  /** Troca o fone/alto-falante (onde o navegador permite escolher). */
  trocarFone(foneId) {
    salvarAparelhos({ fone: foneId || '' });
    this.peers.forEach((peer) => peer.audioEl?.setSinkId?.(foneId || '').catch(() => {}));
  }

  /** Efeito de voz e de ambiente que vão na minha voz (troca sem reconectar). */
  setEfeitos(efeitos) {
    this.efeitos = { ...this.efeitos, ...efeitos };
    this.voz?.definir(this.efeitos);
    this.notify();
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
