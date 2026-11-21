/**
 * Gravação (Modo live parte 4, PLANEJAMENTO 21/11). Só o Mestre, no PC (Chrome/Edge).
 *
 * Dois jeitos (pedido do Gabriel, 21/11):
 *  🎬 "Só a tela de gravação" — o vídeo é MONTADO à parte (câmeras, mesa, personagens), igual à
 *     tela de gravação. O Mestre pode voltar à tela normal e usar a mesa: as trocas de tela dele
 *     não aparecem no vídeo.
 *  🖥️ "Qualquer tela" — grava o que o Mestre escolher no navegador (esta aba, outra aba, uma
 *     janela ou a tela inteira), do jeito que estiver aparecendo.
 *
 * O arquivo (.webm) vai sendo salvo no PC aos pedaços enquanto grava: sessão longa não enche a
 * memória. Navegador sem "escolher onde salvar" (ex.: Firefox): grava na memória e baixa no fim.
 */

import { voiceCall } from './VoiceCall';
import { elementoMusica } from './Musica';
import { streamSfxGravacao } from './Sfx';
import {
  LAYOUT_LIVE_PADRAO, VISUAL_ETAPA, etapaMachucado, svgMachucados, svgRachaduras,
  personagensDaLive, colunasLive,
} from './Live';

const TIPOS = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
const VIDEO_BPS = 5_000_000; // ~5 Mbps: boa qualidade em 1080p, ~2,2 GB por hora
const AUDIO_BPS = 128_000;
const W = 1920;
const H = 1080;
const FPS = 30;

export const podeGravar = () => typeof window !== 'undefined' && typeof window.MediaRecorder !== 'undefined';
export const podeGravarQualquerTela = () => podeGravar() && Boolean(navigator.mediaDevices?.getDisplayMedia);
export const salvaDireto = () => typeof window !== 'undefined' && typeof window.showSaveFilePicker === 'function';

// ---------------------------------------------------------------------------------------------
// Estado (os botões da tela normal e da tela de gravação mostram o mesmo)
// estado: 'parado' · 'escolhendo' (Qualquer tela: arquivo escolhido, falta escolher a tela)
//         · 'gravando' · 'salvando'
// ---------------------------------------------------------------------------------------------
let estado = { estado: 'parado', modo: null, inicio: 0, aviso: '' };
const ouvintes = new Set();
let atual = null; // { parar }
let arquivoEscolhido = null;

const mudar = (novo) => { estado = { ...estado, ...novo }; ouvintes.forEach((fn) => fn(estado)); };
export const estadoGravacao = () => estado;
export function onGravacao(fn) { ouvintes.add(fn); fn(estado); return () => ouvintes.delete(fn); }

const nomeArquivo = () => {
  const d = new Date();
  const dois = (n) => String(n).padStart(2, '0');
  return `Sessao-${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}_${dois(d.getHours())}h${dois(d.getMinutes())}.webm`;
};

async function escolherArquivo() {
  if (!salvaDireto()) return null;
  return window.showSaveFilePicker({
    suggestedName: nomeArquivo(),
    types: [{ description: 'Vídeo WebM', accept: { 'video/webm': ['.webm'] } }],
  });
}

const avisarSaida = (ev) => { ev.preventDefault(); ev.returnValue = ''; };

/** 🎬 Só a tela de gravação. `fonte` = { engineRef, gmId, gmNome, obterLayout }. */
export async function gravarTelaLive(fonte) {
  if (estado.estado !== 'parado') return;
  try {
    const arquivo = await escolherArquivo();
    const montagem = criarMontagem(fonte);
    const audio = criarMisturaLive();
    voiceCall.setGravando(true);
    await comecar({
      arquivo, modo: 'live',
      video: montagem.track, audio: audio.track,
      aoParar: () => { montagem.parar(); audio.parar(); voiceCall.setGravando(false); },
    });
  } catch (e) {
    voiceCall.setGravando(false);
    if (e?.name !== 'AbortError') mudar({ estado: 'parado', aviso: `Não deu para gravar: ${e.message}` });
  }
}

/** 🖥️ Qualquer tela — passo 1: onde salvar. */
export async function qualquerTelaPasso1() {
  if (estado.estado !== 'parado') return;
  try {
    arquivoEscolhido = await escolherArquivo();
    mudar({ estado: 'escolhendo', modo: 'qualquer', aviso: salvaDireto() ? '' : 'Este navegador não deixa escolher a pasta: o vídeo será baixado no final.' });
  } catch (e) {
    if (e?.name !== 'AbortError') mudar({ aviso: `Não deu para escolher o arquivo: ${e.message}` });
  }
}

/** 🖥️ Qualquer tela — passo 2 (precisa ser outro clique: o navegador exige). */
export async function qualquerTelaPasso2() {
  try {
    const tela = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: { ideal: FPS, max: FPS } },
      audio: { suppressLocalAudioPlayback: false, echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      selfBrowserSurface: 'include',
      systemAudio: 'include',
    });
    const video = tela.getVideoTracks()[0];
    video.contentHint = 'detail';
    // Som da tela escolhida + microfone do Mestre.
    const AC = window.AudioContext || window.webkitAudioContext;
    const ctx = new AC();
    const mistura = ctx.createMediaStreamDestination();
    const somDaTela = tela.getAudioTracks().length > 0;
    if (somDaTela) ctx.createMediaStreamSource(new MediaStream(tela.getAudioTracks())).connect(mistura);
    const mic = voiceCall.localStream;
    if (mic?.getAudioTracks().length) ctx.createMediaStreamSource(new MediaStream(mic.getAudioTracks())).connect(mistura);
    const arquivo = arquivoEscolhido;
    arquivoEscolhido = null;
    await comecar({
      arquivo, modo: 'qualquer', video, audio: mistura.stream.getAudioTracks()[0],
      aviso: somDaTela ? '' : '⚠️ Sem o som da tela: só o seu microfone entra. Marque "Compartilhar áudio" ao escolher.',
      aoParar: () => { tela.getTracks().forEach((t) => t.stop()); ctx.close().catch(() => {}); },
    });
    // "Parar de compartilhar" do navegador também para e salva.
    video.addEventListener('ended', () => { pararGravacao(); });
  } catch (e) {
    mudar({ aviso: e?.name === 'NotAllowedError' ? 'Cancelado: nenhuma tela escolhida.' : `Não deu para gravar: ${e.message}` });
  }
}

export function cancelarEscolha() {
  arquivoEscolhido = null;
  mudar({ estado: 'parado', modo: null, aviso: '' });
}

export async function pararGravacao() {
  if (!atual) return;
  mudar({ estado: 'salvando' });
  await atual.parar();
}

// ---------------------------------------------------------------------------------------------
// Gravador (MediaRecorder → arquivo aos pedaços, ou memória + download)
// ---------------------------------------------------------------------------------------------
async function comecar({ arquivo, modo, video, audio, aviso = '', aoParar }) {
  const final = new MediaStream([video, ...(audio ? [audio] : [])]);
  const mimeType = TIPOS.find((t) => window.MediaRecorder.isTypeSupported(t)) || '';
  const rec = new window.MediaRecorder(final, { mimeType, videoBitsPerSecond: VIDEO_BPS, audioBitsPerSecond: AUDIO_BPS });

  const escrita = arquivo ? await arquivo.createWritable() : null;
  const pedacos = [];
  let fila = Promise.resolve();
  let erro = '';
  rec.ondataavailable = (ev) => {
    if (!ev.data?.size) return;
    if (escrita) fila = fila.then(() => escrita.write(ev.data)).catch((e) => { erro = `Falha ao salvar no arquivo: ${e.message}`; });
    else pedacos.push(ev.data);
  };

  let terminou = false;
  const fim = new Promise((resolve) => {
    rec.onstop = async () => {
      try { aoParar?.(); } catch { /* já parado */ }
      if (escrita) {
        await fila;
        try { await escrita.close(); } catch (e) { erro = erro || `Falha ao fechar o arquivo: ${e.message}`; }
      } else if (pedacos.length) {
        const url = URL.createObjectURL(new Blob(pedacos, { type: 'video/webm' }));
        const a = document.createElement('a');
        a.href = url; a.download = nomeArquivo();
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      }
      terminou = true;
      atual = null;
      window.removeEventListener('beforeunload', avisarSaida);
      mudar({ estado: 'parado', modo: null, inicio: 0, aviso: erro || (escrita ? '✅ Vídeo salvo no arquivo escolhido.' : '✅ Vídeo baixado.') });
      if (!erro) setTimeout(() => { if (estado.estado === 'parado') mudar({ aviso: '' }); }, 8000);
      resolve();
    };
  });

  atual = {
    parar: async () => {
      if (terminou) return;
      if (rec.state !== 'inactive') rec.stop();
      await fim;
    },
  };
  window.addEventListener('beforeunload', avisarSaida);
  rec.start(1000); // um pedaço por segundo
  mudar({ estado: 'gravando', modo, inicio: Date.now(), aviso });
}

// ---------------------------------------------------------------------------------------------
// 🎬 Montagem do vídeo da tela de gravação (canvas 1920×1080)
// ---------------------------------------------------------------------------------------------

/** Relógio que não fica lento quando o Mestre troca de aba (os relógios normais ficam). */
function criarRelogio(ms, fn) {
  try {
    const url = URL.createObjectURL(new Blob(['let t;onmessage=(e)=>{clearInterval(t);if(e.data)t=setInterval(()=>postMessage(0),e.data)}'], { type: 'text/javascript' }));
    const w = new Worker(url);
    w.onmessage = fn;
    w.postMessage(ms);
    return () => { w.postMessage(0); w.terminate(); URL.revokeObjectURL(url); };
  } catch {
    const t = setInterval(fn, ms);
    return () => clearInterval(t);
  }
}

function criarMontagem({ engineRef, gmId, gmNome = 'Mestre', obterLayout }) {
  const tela = document.createElement('canvas');
  tela.width = W;
  tela.height = H;
  const c = tela.getContext('2d');

  // Vídeos (câmeras e mapa) tocando escondidos para poder desenhar.
  const caixaVideos = document.createElement('div');
  caixaVideos.style.cssText = 'position:fixed;left:0;top:0;width:2px;height:2px;opacity:0;pointer-events:none;overflow:hidden';
  document.body.appendChild(caixaVideos);
  const videos = new Map(); // stream.id -> <video>
  const videoDe = (stream) => {
    if (!stream) return null;
    let v = videos.get(stream.id);
    if (!v) {
      v = document.createElement('video');
      v.muted = true; v.playsInline = true; v.autoplay = true;
      v.srcObject = stream;
      caixaVideos.appendChild(v);
      v.play().catch(() => {});
      videos.set(stream.id, v);
    }
    return v.readyState >= 2 && v.videoWidth ? v : null;
  };

  // Mapa: o mesmo canvas da mesa, como vídeo (funciona com o Mestre em qualquer tela).
  let mapaStream = null;
  const mapa = () => {
    const canvasMapa = engineRef.current?.app?.canvas;
    if (!canvasMapa) return null;
    if (!mapaStream || mapaStream.canvas !== canvasMapa) {
      mapaStream = { canvas: canvasMapa, stream: canvasMapa.captureStream(FPS) };
    }
    return videoDe(mapaStream.stream);
  };

  // Retratos e machucados (imagens guardadas).
  const imagens = new Map();
  const imagem = (url) => {
    let r = imagens.get(url);
    if (!r) {
      const img = new Image();
      img.crossOrigin = 'anonymous'; // imagem sem permissão não é desenhada (não estraga o vídeo)
      r = { img, ok: false };
      img.onload = () => { r.ok = true; };
      img.src = url;
      imagens.set(url, r);
    }
    return r.ok ? r.img : null;
  };
  const svg = (texto) => imagem(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(texto)}`);

  const caixa = (r) => ({ x: (r.x / 100) * W, y: (r.y / 100) * H, w: (r.w / 100) * W, h: (r.h / 100) * H });
  const arredondado = (x, y, w, h, raio) => { c.beginPath(); c.roundRect(x, y, w, h, raio); };
  const cobrir = (fonte, x, y, w, h) => { // igual ao object-cover
    const fw = fonte.videoWidth || fonte.naturalWidth || fonte.width;
    const fh = fonte.videoHeight || fonte.naturalHeight || fonte.height;
    if (!fw || !fh) return;
    const esc = Math.max(w / fw, h / fh);
    const sw = w / esc; const sh = h / esc;
    c.drawImage(fonte, (fw - sw) / 2, (fh - sh) / 2, sw, sh, x, y, w, h);
  };
  const texto = (t, x, y, tamanho, cor = '#fafafa', fonte = '"Shippori Mincho B1", serif', peso = 800) => {
    c.font = `${peso} ${tamanho}px ${fonte}`;
    c.fillStyle = cor;
    c.shadowColor = 'rgba(0,0,0,0.9)'; c.shadowBlur = 6; c.shadowOffsetY = 2;
    c.fillText(t, x, y);
    c.shadowColor = 'transparent'; c.shadowBlur = 0; c.shadowOffsetY = 0;
  };
  const quadro = (b, borda) => {
    arredondado(b.x, b.y, b.w, b.h, 10);
    c.fillStyle = '#18181b'; c.fill();
    c.save(); c.clip();
    return () => { c.restore(); arredondado(b.x, b.y, b.w, b.h, 10); c.lineWidth = 4; c.strokeStyle = borda; c.stroke(); };
  };

  const retrato = (p, x, y, d) => {
    const etapa = etapaMachucado(p.vida, p.vidaMax);
    const v = VISUAL_ETAPA[etapa];
    const cinza = etapa === 4 ? 'grayscale(1) contrast(1.1) ' : '';
    c.save();
    c.beginPath(); c.arc(x + d / 2, y + d / 2, d / 2, 0, Math.PI * 2); c.clip();
    c.fillStyle = '#27272a'; c.fillRect(x, y, d, d);
    const img = imagem(p.retrato);
    c.filter = `${cinza}${v.filtro === 'none' ? '' : v.filtro}`.trim() || 'none';
    if (img) cobrir(img, x, y, d, d);
    c.filter = 'none';
    if (v.vermelho) {
      const g = c.createRadialGradient(x + d / 2, y + d / 2, d * 0.2, x + d / 2, y + d / 2, d / 2);
      g.addColorStop(0, 'rgba(127,29,29,0)'); g.addColorStop(1, `rgba(127,29,29,${v.vermelho})`);
      c.fillStyle = g; c.fillRect(x, y, d, d);
    }
    if (etapa > 0) {
      const m = svg(svgMachucados(etapa, p.id));
      c.filter = cinza.trim() || 'none';
      if (m) c.drawImage(m, x, y, d, d);
      c.filter = 'none';
    }
    c.restore();
    c.beginPath(); c.arc(x + d / 2, y + d / 2, d / 2 - 1.5, 0, Math.PI * 2);
    c.lineWidth = 3; c.strokeStyle = v.aro; c.stroke();
    if (etapa >= 2) { const r = svg(svgRachaduras(etapa)); if (r) c.drawImage(r, x, y, d, d); }
  };

  const barra = (x, y, w, valor, max, cor, rotulo) => {
    const pct = Math.max(0, Math.min(1, valor / max));
    c.font = '700 15px system-ui, sans-serif'; c.fillStyle = '#e4e4e7';
    c.fillText(rotulo, x, y + 11);
    const bx = x + 24; const bw = w - 24 - 80;
    arredondado(bx, y, bw, 12, 6); c.fillStyle = '#27272a'; c.fill();
    if (pct > 0) { arredondado(bx, y, Math.max(12, bw * pct), 12, 6); c.fillStyle = cor; c.fill(); }
    c.fillStyle = '#e4e4e7'; c.textAlign = 'right'; c.fillText(`${valor}/${max}`, x + w, y + 11); c.textAlign = 'left';
  };

  const desenhar = () => {
    const estadoVoz = voiceCall.getState();
    const falando = Object.fromEntries((estadoVoz.participants || []).map((p) => [p.id, p]));
    const camDe = (pessoa) => {
      if (!pessoa) return null;
      if (pessoa === voiceCall.playerId) return estadoVoz.cameraOn ? estadoVoz.camStream : null;
      return falando[pessoa]?.camera ? (estadoVoz.videos || []).find((v) => v.id === pessoa)?.stream || null : null;
    };

    c.fillStyle = '#09090b'; c.fillRect(0, 0, W, H);
    // Arrumação do Mestre (muda no meio da gravação se ele mexer).
    const L = obterLayout?.() || LAYOUT_LIVE_PADRAO;

    // Câmera do Mestre
    const bm = caixa(L.mestre);
    let fecha = quadro(bm, falando[gmId]?.speaking ? '#34d399' : '#27272a');
    const vm = videoDe(camDe(gmId));
    if (vm) cobrir(vm, bm.x, bm.y, bm.w, bm.h);
    else { c.textAlign = 'center'; texto('Câmera do Mestre desligada', bm.x + bm.w / 2, bm.y + bm.h / 2, 22, '#71717a', 'system-ui, sans-serif', 500); c.textAlign = 'left'; }
    texto(gmNome, bm.x + 16, bm.y + bm.h - 16, 40);
    fecha();

    // Mesa
    const bmapa = caixa(L.mapa);
    fecha = quadro(bmapa, '#27272a');
    const vmapa = mapa();
    if (vmapa) cobrir(vmapa, bmapa.x, bmapa.y, bmapa.w, bmapa.h);
    fecha();

    // Personagens
    const bp = caixa(L.personagens);
    const lista = personagensDaLive(engineRef.current, gmId);
    const cols = colunasLive(lista.length, L.personagens);
    const linhas = Math.max(1, Math.ceil(lista.length / cols));
    const gap = 8;
    const cw = (bp.w - gap * (cols - 1)) / cols;
    const ch = (bp.h - gap * (linhas - 1)) / linhas;
    lista.forEach((p, i) => {
      const x = bp.x + (i % cols) * (cw + gap);
      const y = bp.y + Math.floor(i / cols) * (ch + gap);
      const b = { x, y, w: cw, h: ch };
      const f = quadro(b, falando[p.dono]?.speaking ? '#34d399' : '#27272a');
      const v = videoDe(camDe(p.dono));
      if (v) cobrir(v, x, y, cw, ch);
      else {
        const img = imagem(p.retrato);
        if (img) { c.globalAlpha = 0.25; c.filter = 'blur(6px)'; cobrir(img, x, y, cw, ch); c.filter = 'none'; c.globalAlpha = 1; }
      }
      // Faixa escura embaixo + retrato + nome + barras
      const fh = 150;
      const g = c.createLinearGradient(0, y + ch - fh, 0, y + ch);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.5, 'rgba(0,0,0,0.5)'); g.addColorStop(1, 'rgba(0,0,0,0.9)');
      c.fillStyle = g; c.fillRect(x, y + ch - fh, cw, fh);
      const d = 80;
      retrato(p, x + 10, y + ch - d - 10, d);
      const tx = x + 10 + d + 10; const tw = cw - (tx - x) - 12;
      c.save(); c.beginPath(); c.rect(tx, y, tw, ch); c.clip();
      texto(p.nome, tx, y + ch - 52, 30);
      c.restore();
      barra(tx, y + ch - 42, tw, p.vida, p.vidaMax, '#dc2626', '❤');
      barra(tx, y + ch - 22, tw, p.chakra, p.chakraMax, '#0ea5e9', '🔷');
      f();
    });
    if (!lista.length) { c.textAlign = 'center'; texto('Nenhum personagem de jogador nesta mesa.', bp.x + bp.w / 2, bp.y + bp.h / 2, 22, '#71717a', 'system-ui, sans-serif', 500); c.textAlign = 'left'; }

    // Vídeos de quem saiu da chamada: para de tocar.
    const vivos = new Set([mapaStream?.stream?.id, estadoVoz.camStream?.id, ...(estadoVoz.videos || []).map((v) => v.stream?.id)]);
    videos.forEach((v, id) => { if (!vivos.has(id)) { v.srcObject = null; v.remove(); videos.delete(id); } });
  };

  document.fonts?.load?.('800 40px "Shippori Mincho B1"').catch(() => {});
  desenhar();
  const track = tela.captureStream(FPS).getVideoTracks()[0];
  const pararRelogio = criarRelogio(1000 / FPS, () => { try { desenhar(); } catch (e) { console.warn('Gravação: erro ao desenhar', e); } });

  return {
    track,
    parar: () => {
      pararRelogio();
      track.stop();
      mapaStream?.stream.getTracks().forEach((t) => t.stop());
      videos.forEach((v) => { v.srcObject = null; });
      caixaVideos.remove();
    },
  };
}

// ---------------------------------------------------------------------------------------------
// 🎬 Som da tela de gravação: vozes de todos + microfone do Mestre + música + efeitos
// ---------------------------------------------------------------------------------------------
function criarMisturaLive() {
  const AC = window.AudioContext || window.webkitAudioContext;
  const ctx = new AC();
  const mistura = ctx.createMediaStreamDestination();
  const ligados = new Map(); // id -> nó (para não ligar duas vezes)

  const ligar = (id, stream, ganho = 1) => {
    if (!stream || ligados.has(id) || !stream.getAudioTracks().length) return;
    try {
      const fonte = ctx.createMediaStreamSource(stream);
      const g = ctx.createGain();
      g.gain.value = ganho;
      fonte.connect(g).connect(mistura);
      ligados.set(id, { fonte, g, stream });
    } catch (e) { console.warn('Gravação: som não ligado', e); }
  };
  const desligar = (id) => {
    const n = ligados.get(id);
    if (!n) return;
    try { n.fonte.disconnect(); n.g.disconnect(); } catch { /* já desligado */ }
    ligados.delete(id);
  };

  let musicaEl = null;
  const conferir = () => {
    // Microfone do Mestre (já com o efeito de voz).
    const mic = voiceCall.localStream;
    if (mic && !ligados.has(`mic:${mic.id}`)) {
      [...ligados.keys()].filter((k) => k.startsWith('mic:')).forEach(desligar);
      ligar(`mic:${mic.id}`, mic);
    }
    // Vozes dos outros (quem entra no meio também entra no vídeo).
    const vozes = new Set();
    voiceCall.peers.forEach((peer, id) => {
      const s = peer.audioEl?.srcObject;
      if (!s) return;
      const chave = `voz:${id}:${s.id}`;
      vozes.add(chave);
      ligar(chave, s);
    });
    [...ligados.keys()].filter((k) => k.startsWith('voz:') && !vozes.has(k)).forEach(desligar);
    // Música da mesa (troca de faixa = elemento novo).
    const el = elementoMusica();
    if (el !== musicaEl) {
      [...ligados.keys()].filter((k) => k.startsWith('musica')).forEach(desligar);
      musicaEl = el;
    }
    if (el && !ligados.has('musica') && typeof el.captureStream === 'function') {
      try { ligar('musica', el.captureStream(), 0.5); } catch { /* música de outro site sem permissão */ }
    }
    // Efeitos de combate.
    if (!ligados.has('sfx')) ligar('sfx', streamSfxGravacao());
  };
  conferir();
  const pararRelogio = criarRelogio(1000, conferir);

  return {
    track: mistura.stream.getAudioTracks()[0],
    parar: () => { pararRelogio(); ligados.forEach((_, id) => desligar(id)); ctx.close().catch(() => {}); },
  };
}
