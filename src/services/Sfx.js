/**
 * Sons do combate, gerados na hora pelo navegador (Web Audio): nenhum arquivo
 * para baixar, leve no celular. Cada som usa poucos nós e some sozinho.
 *
 *   playAttackSound({ element, shape, weapon, hit })  — chamado pela animação
 *   setMuted(true/false) · isMuted()                  — botão 🔊 (vale só neste aparelho)
 */
const KEY = 'vtt_mute';
let ctx = null;
let master = null;
let noise = null;
let muted = (() => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } })();
// Volume dos efeitos (0 a 1), só neste aparelho.
let volume = (() => {
  try { const v = Number(localStorage.getItem('vtt_sfx_volume')); return Number.isFinite(v) && localStorage.getItem('vtt_sfx_volume') !== null ? Math.min(1, Math.max(0, v)) : 0.5; } catch { return 0.5; }
})();
const listeners = new Set();

export const isMuted = () => muted;
export function setMuted(value) {
  muted = Boolean(value);
  try { localStorage.setItem(KEY, muted ? '1' : '0'); } catch { /* sem armazenamento */ }
  if (master) master.gain.value = muted ? 0 : volume;
  listeners.forEach((fn) => fn(muted));
}
export const getSfxVolume = () => volume;
export function setSfxVolume(value) {
  volume = Math.min(1, Math.max(0, Number(value) || 0));
  try { localStorage.setItem('vtt_sfx_volume', String(volume)); } catch { /* sem armazenamento */ }
  if (master) master.gain.value = muted ? 0 : volume;
  listeners.forEach((fn) => fn(muted));
}
export function onMuteChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** O navegador só libera som depois do primeiro toque/clique na página. */
function audio() {
  if (muted) return null;
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = volume;
    master.connect(ctx.destination);
    // 1 s de ruído branco, reaproveitado por todos os sons.
    noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

// Libera o áudio no primeiro toque (exigência dos navegadores, principalmente no celular).
if (typeof window !== 'undefined') {
  const unlock = () => { if (!muted) audio(); window.removeEventListener('pointerdown', unlock); };
  window.addEventListener('pointerdown', unlock);
}

/** Envelope: sobe rápido e cai até sumir. */
function env(gainNode, t, peak, attack, decay) {
  gainNode.gain.setValueAtTime(0.0001, t);
  gainNode.gain.exponentialRampToValueAtTime(peak, t + attack);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
}

/** Ruído filtrado (vento, corte, explosão). */
function noiseHit(t, { type = 'bandpass', freq = 1000, freqEnd = null, q = 1, peak = 0.6, attack = 0.005, decay = 0.2 }) {
  const c = ctx;
  const src = c.createBufferSource();
  src.buffer = noise;
  const filter = c.createBiquadFilter();
  filter.type = type;
  filter.Q.value = q;
  filter.frequency.setValueAtTime(freq, t);
  if (freqEnd) filter.frequency.exponentialRampToValueAtTime(freqEnd, t + attack + decay);
  const g = c.createGain();
  env(g, t, peak, attack, decay);
  src.connect(filter).connect(g).connect(master);
  src.start(t, Math.random() * 0.5);
  src.stop(t + attack + decay + 0.05);
}

/** Tom (soco, chime, zumbido do Rasengan). */
function tone(t, { type = 'sine', freq = 200, freqEnd = null, peak = 0.5, attack = 0.005, decay = 0.15, vibrato = 0 }) {
  const c = ctx;
  const osc = c.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (freqEnd) osc.frequency.exponentialRampToValueAtTime(freqEnd, t + attack + decay);
  if (vibrato) {
    const lfo = c.createOscillator();
    const depth = c.createGain();
    lfo.frequency.value = vibrato;
    depth.gain.value = freq * 0.08;
    lfo.connect(depth).connect(osc.frequency);
    lfo.start(t);
    lfo.stop(t + attack + decay + 0.05);
  }
  const g = c.createGain();
  env(g, t, peak, attack, decay);
  osc.connect(g).connect(master);
  osc.start(t);
  osc.stop(t + attack + decay + 0.05);
}

// ---------------- Sons prontos ----------------

const SONS = {
  whoosh: (t, k = 1) => noiseHit(t, { type: 'bandpass', freq: 400 * k, freqEnd: 2200 * k, q: 1.2, peak: 0.35, attack: 0.04, decay: 0.16 }),
  soco: (t) => { tone(t, { freq: 140, freqEnd: 45, peak: 0.8, decay: 0.14 }); noiseHit(t, { type: 'lowpass', freq: 900, peak: 0.35, decay: 0.06 }); },
  corte: (t) => { noiseHit(t, { type: 'highpass', freq: 2500, freqEnd: 6000, peak: 0.4, attack: 0.01, decay: 0.12 }); tone(t + 0.02, { type: 'triangle', freq: 2400, freqEnd: 1800, peak: 0.12, decay: 0.25 }); },
  metal: (t) => { tone(t, { type: 'square', freq: 1800, freqEnd: 1200, peak: 0.08, decay: 0.08 }); noiseHit(t, { type: 'highpass', freq: 3000, peak: 0.25, decay: 0.05 }); },
  pancada: (t) => { tone(t, { freq: 90, freqEnd: 35, peak: 0.95, decay: 0.25 }); noiseHit(t, { type: 'lowpass', freq: 500, peak: 0.5, decay: 0.3 }); },
  explosao: (t) => { noiseHit(t, { type: 'lowpass', freq: 1200, freqEnd: 120, peak: 0.9, attack: 0.01, decay: 0.8 }); tone(t, { freq: 70, freqEnd: 30, peak: 0.7, decay: 0.5 }); },
  fogo: (t) => { noiseHit(t, { type: 'bandpass', freq: 600, freqEnd: 300, q: 0.7, peak: 0.6, attack: 0.05, decay: 0.55 }); tone(t, { freq: 80, freqEnd: 50, peak: 0.3, decay: 0.4 }); },
  raio: (t) => { for (let i = 0; i < 5; i += 1) noiseHit(t + i * 0.035 + Math.random() * 0.02, { type: 'highpass', freq: 3000 + Math.random() * 2000, peak: 0.45, decay: 0.03 }); tone(t, { type: 'sawtooth', freq: 120, peak: 0.12, decay: 0.2 }); },
  agua: (t) => { noiseHit(t, { type: 'lowpass', freq: 1800, freqEnd: 400, peak: 0.45, attack: 0.03, decay: 0.4 }); tone(t + 0.05, { freq: 500, freqEnd: 900, peak: 0.12, decay: 0.08 }); tone(t + 0.15, { freq: 420, freqEnd: 760, peak: 0.1, decay: 0.08 }); },
  vento: (t) => noiseHit(t, { type: 'bandpass', freq: 300, freqEnd: 1800, q: 2, peak: 0.5, attack: 0.08, decay: 0.45 }),
  terra: (t) => { tone(t, { freq: 60, freqEnd: 30, peak: 0.8, attack: 0.03, decay: 0.45 }); noiseHit(t, { type: 'lowpass', freq: 300, peak: 0.6, attack: 0.04, decay: 0.5 }); },
  insetos: (t) => { for (let i = 0; i < 3; i += 1) tone(t + i * 0.06, { type: 'sawtooth', freq: 180 + i * 40, peak: 0.06, attack: 0.05, decay: 0.5, vibrato: 30 + i * 7 }); },
  rasengan: (t) => { tone(t, { type: 'sawtooth', freq: 220, freqEnd: 660, peak: 0.15, attack: 0.1, decay: 0.35, vibrato: 18 }); noiseHit(t, { type: 'bandpass', freq: 800, freqEnd: 2400, q: 3, peak: 0.3, attack: 0.1, decay: 0.35 }); },
  chakra: (t) => tone(t, { type: 'triangle', freq: 330, freqEnd: 660, peak: 0.2, attack: 0.03, decay: 0.3, vibrato: 6 }),
  cura: (t) => [523, 659, 784].forEach((f, i) => tone(t + i * 0.08, { freq: f, peak: 0.18, decay: 0.4 })),
};

// Som do "movimento" e do "impacto" por elemento de jutsu.
const ELEMENTO = {
  katon: ['fogo', 'explosao'], fuuton: ['vento', 'corte'], raiton: ['raio', 'raio'], suiton: ['agua', 'agua'],
  doton: ['terra', 'pancada'], mokuton: ['terra', 'pancada'], kikai_ninpou: ['insetos', 'insetos'], kikaichuu: ['insetos', 'insetos'],
  jiton_satetsu: ['terra', 'metal'], jiton_sakin: ['terra', 'metal'], rasengan: ['rasengan', 'explosao'], chakra: ['chakra', 'soco'],
};

// Quando a animação chega no alvo (mesmos tempos do TurnMenu).
const CHEGA = { golpe: 0.2, corte: 0.15, estocada: 0.12, pancada: 0.3, arremesso: 0.35, flecha: 0.3, explosao: 0.45, enxame: 0.7, raio: 0.1 };

/** Toca o som de um ataque (todo mundo ouve, porque a animação passa para todos). */
export function playAttackSound({ element = 'chakra', shape = 'projetil', weapon = '', hit = [] } = {}) {
  if (!audio()) return;
  const t = ctx.currentTime + 0.01;
  const acertou = hit.some((h) => h !== false);
  const chega = t + (CHEGA[shape] ?? 0.4);

  if (element === 'arma' || weapon === 'rasengan') {
    if (weapon === 'rasengan') { SONS.rasengan(t); if (acertou) SONS.explosao(chega); else SONS.whoosh(chega, 0.8); return; }
    if (shape === 'golpe') { SONS.whoosh(t, 0.8); if (acertou) [0, 0.095, 0.19].forEach((d) => SONS.soco(chega + d)); else SONS.whoosh(chega, 1.3); return; }
    if (shape === 'corte') { SONS.whoosh(t, 1.2); if (acertou) SONS.corte(chega); else SONS.whoosh(chega, 1.5); return; }
    if (shape === 'estocada') { SONS.whoosh(t, 1.5); if (acertou) SONS.metal(chega); else SONS.whoosh(chega, 1.6); return; }
    if (shape === 'pancada') { SONS.whoosh(t, 0.6); if (acertou) SONS.pancada(chega); else SONS.terra(chega); return; }
    if (shape === 'explosao') { SONS.whoosh(t, 1.4); SONS.explosao(chega); return; }
    // Arremesso / flecha: assobio e o "tec" de cravar.
    SONS.whoosh(t, weapon === 'shuriken' || weapon === 'fuuma' ? 1.8 : 1.4);
    if (acertou) SONS.metal(chega); else SONS.whoosh(chega, 1.7);
    return;
  }

  const [ida, volta] = ELEMENTO[element] || ELEMENTO.chakra;
  SONS[ida](t);
  if (acertou) SONS[volta](chega);
}

/** Som avulso (cura, etc.). */
export function playSound(name) {
  if (!audio() || !SONS[name]) return;
  SONS[name](ctx.currentTime + 0.01);
}
