// Música da mesa: o Mestre escolhe, todo mundo ouve no mesmo ponto da faixa.
//
// O estado fica em rooms.scene_env.musica (quem entra depois já cai na música certa):
//   { url, nome, playing, startedAt, loop }
//   startedAt = Date.now() de quando o Mestre deu play (cada aparelho calcula onde está a faixa).
//
// Volume e mudo valem só neste aparelho (localStorage).

const VOLUME_KEY = 'vtt_musica_volume';
const MUDO_KEY = 'vtt_musica_mudo';
const FADE_MS = 900;

let audio = null;
let atual = null;           // último estado recebido (scene_env.musica)
let bloqueado = false;      // navegador não deixou tocar sem um toque na tela
let fadeTimer = null;
const ouvintes = new Set();

const ler = (key, fallback) => {
  try { return window.localStorage.getItem(key) ?? fallback; } catch { return fallback; }
};
const gravar = (key, value) => {
  try { window.localStorage.setItem(key, String(value)); } catch { /* sem localStorage */ }
};

let volume = Math.min(1, Math.max(0, Number(ler(VOLUME_KEY, '0.4')) || 0));
let mudo = ler(MUDO_KEY, '0') === '1';

const alvoVolume = () => (mudo ? 0 : volume);

function avisar() {
  const estado = musicaAtual();
  ouvintes.forEach((cb) => cb(estado));
}

/** O que está tocando (para os botões da tela). */
export function musicaAtual() {
  return {
    nome: atual?.playing ? atual.nome : null,
    url: atual?.playing ? atual.url : null,
    loop: atual?.loop !== false,
    tocando: Boolean(atual?.playing),
    bloqueado,
    volume,
    mudo,
  };
}

export function onMusica(cb) {
  ouvintes.add(cb);
  cb(musicaAtual());
  return () => ouvintes.delete(cb);
}

/** Muda o volume aos poucos (sem estalo). */
function fade(alvo, depois) {
  if (!audio) return;
  clearInterval(fadeTimer);
  const el = audio;
  const inicio = el.volume;
  const t0 = performance.now();
  fadeTimer = setInterval(() => {
    const p = Math.min(1, (performance.now() - t0) / FADE_MS);
    el.volume = inicio + (alvo - inicio) * p;
    if (p >= 1) {
      clearInterval(fadeTimer);
      depois?.();
    }
  }, 40);
}

function pararAudio(imediato = false) {
  if (!audio) return;
  const el = audio;
  audio = null;
  clearInterval(fadeTimer);
  if (imediato) {
    el.pause();
    el.src = '';
    return;
  }
  // Some devagar e libera o arquivo.
  const inicio = el.volume;
  const t0 = performance.now();
  const timer = setInterval(() => {
    const p = Math.min(1, (performance.now() - t0) / FADE_MS);
    el.volume = inicio * (1 - p);
    if (p >= 1) {
      clearInterval(timer);
      el.pause();
      el.src = '';
    }
  }, 40);
}

/** Coloca a faixa no ponto certo (todo mundo junto) e toca. */
function sincronizarETocar() {
  if (!audio || !atual?.playing) return;
  const el = audio;
  const duracao = el.duration;
  if (Number.isFinite(duracao) && duracao > 0) {
    const passou = Math.max(0, (Date.now() - Number(atual.startedAt || Date.now())) / 1000);
    if (atual.loop !== false) el.currentTime = passou % duracao;
    else if (passou < duracao) el.currentTime = passou;
    else return; // a música já acabou (sem repetir)
  }
  el.volume = 0;
  el.play()
    .then(() => {
      bloqueado = false;
      fade(alvoVolume());
      avisar();
    })
    .catch(() => {
      // Celular/navegador só deixa tocar som depois de um toque na tela.
      bloqueado = true;
      avisar();
    });
}

/**
 * Recebe o scene_env.musica mais novo (ao entrar na sala e a cada mudança do Mestre).
 */
export function aplicarMusica(musica) {
  const antes = atual;
  atual = musica && musica.url ? musica : null;

  if (!atual?.playing) {
    bloqueado = false;
    pararAudio();
    avisar();
    return;
  }

  const mesmaFaixa = antes?.playing && antes.url === atual.url && antes.startedAt === atual.startedAt && audio;
  if (mesmaFaixa) {
    audio.loop = atual.loop !== false;
    avisar();
    return;
  }

  pararAudio();
  const el = new Audio();
  el.preload = 'auto';
  el.loop = atual.loop !== false;
  el.src = atual.url;
  audio = el;
  if (el.readyState >= 1) sincronizarETocar();
  else el.addEventListener('loadedmetadata', () => { if (audio === el) sincronizarETocar(); }, { once: true });
  el.addEventListener('ended', () => { if (audio === el && !el.loop) { atual = { ...atual, playing: false }; avisar(); } });
  avisar();
}

/** Toque do jogador na tela: libera o som bloqueado pelo navegador. */
export function liberarMusica() {
  if (bloqueado) sincronizarETocar();
}

export function setVolumeMusica(valor) {
  volume = Math.min(1, Math.max(0, Number(valor) || 0));
  gravar(VOLUME_KEY, volume);
  if (audio) {
    clearInterval(fadeTimer);
    audio.volume = alvoVolume();
  }
  avisar();
}

export function setMudoMusica(valor) {
  mudo = Boolean(valor);
  gravar(MUDO_KEY, mudo ? '1' : '0');
  if (audio) fade(alvoVolume());
  avisar();
}

/** Saiu da sala: a música para na hora. */
export function encerrarMusica() {
  atual = null;
  bloqueado = false;
  pararAudio(true);
  avisar();
}
