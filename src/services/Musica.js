// Música da mesa: o Mestre escolhe, todo mundo ouve no mesmo ponto da faixa.
//
// O estado fica em rooms.scene_env.musica (quem entra depois já cai na música certa):
//   { url, nome, playing, startedAt, loop }
//   startedAt = Date.now() de quando o Mestre deu play (cada aparelho calcula onde está a faixa).
//
// Volume e mudo valem só neste aparelho (localStorage).

import { patchSceneEnv } from './SceneEnv';

const VOLUME_KEY = 'vtt_musica_volume';
const MUDO_KEY = 'vtt_musica_mudo';
const FADE_MS = 900;

let audio = null;
let atual = null;           // último estado recebido (scene_env.musica)
let bloqueado = false;      // navegador não deixou tocar sem um toque na tela
let fadeTimer = null;
let progressTimer = null;
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
  ouvintes.forEach((cb) => {
    try { cb(estado); } catch (err) { console.error('Erro em ouvinte de musica:', err); }
  });
}

/** O que está tocando (para os botões da tela e barra de tempo). */
export function musicaAtual() {
  const curTime = audio && Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
  const dur = audio && Number.isFinite(audio.duration) ? audio.duration : 0;
  return {
    nome: atual?.playing ? (atual.nome || 'Música') : null,
    url: atual?.playing ? atual.url : null,
    loop: atual?.loop !== false,
    tocando: Boolean(atual?.playing),
    bloqueado,
    volume,
    mudo,
    currentTime: curTime,
    duration: dur,
    progresso: dur > 0 ? Math.min(1, Math.max(0, curTime / dur)) : 0,
    startedAt: atual?.startedAt ?? null,
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
  clearInterval(progressTimer);
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

function startProgressLoop() {
  clearInterval(progressTimer);
  progressTimer = setInterval(() => {
    if (audio && atual?.playing) {
      avisar();
    }
  }, 450);
}

/** Coloca a faixa no ponto certo (todo mundo junto) e toca. */
function sincronizarETocar() {
  if (!audio || !atual?.playing) return;
  const el = audio;
  const duracao = el.duration;
  if (Number.isFinite(duracao) && duracao > 0) {
    const passou = Math.max(0, (Date.now() - Number(atual.startedAt || Date.now())) / 1000);
    if (atual.loop !== false) {
      el.currentTime = passou % duracao;
    } else if (passou < duracao) {
      el.currentTime = passou;
    } else {
      return; // a música já acabou (sem repetir)
    }
  }

  el.volume = alvoVolume();
  el.play()
    .then(() => {
      bloqueado = false;
      startProgressLoop();
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
 * Se musica for undefined (ex.: atualização de outros dados da sala), não mexe!
 */
export function aplicarMusica(musica) {
  if (musica === undefined) return; // Nenhuma mudança de música enviada

  const antes = atual;
  atual = musica && musica.url ? musica : null;

  // Se o mestre pausou / não está tocando
  if (!atual || !atual.playing) {
    bloqueado = false;
    pararAudio();
    avisar();
    return;
  }

  // Se é a mesma URL e já temos o elemento de áudio
  if (audio && antes?.url === atual.url) {
    audio.loop = atual.loop !== false;

    // Verifica se houve seek significativo (> 2s de diferença do esperado)
    if (Number.isFinite(audio.duration) && audio.duration > 0 && atual.startedAt) {
      const dur = audio.duration;
      const esperado = atual.loop !== false
        ? Math.max(0, (Date.now() - Number(atual.startedAt)) / 1000) % dur
        : Math.max(0, (Date.now() - Number(atual.startedAt)) / 1000);

      if (Math.abs(audio.currentTime - esperado) > 2.5) {
        audio.currentTime = esperado;
      }
    }

    if (audio.paused && !bloqueado) {
      audio.play().catch(() => { bloqueado = true; avisar(); });
    }
    avisar();
    return;
  }

  // Nova faixa ou inicialização
  pararAudio(true);
  const el = new Audio();
  el.preload = 'auto';
  el.loop = atual.loop !== false;
  el.src = atual.url;
  audio = el;

  el.addEventListener('timeupdate', avisar);
  el.addEventListener('loadedmetadata', () => {
    if (audio === el) {
      sincronizarETocar();
    }
  }, { once: true });

  el.addEventListener('ended', () => {
    if (audio === el && !el.loop) {
      atual = { ...atual, playing: false };
      avisar();
    }
  });

  if (el.readyState >= 1) {
    sincronizarETocar();
  }
  avisar();
}

/**
 * Pula a música para um ponto específico (em segundos) e sincroniza para todos.
 */
export async function seekMusica(roomId, segundos) {
  const tempo = Math.max(0, Number(segundos) || 0);
  if (audio && Number.isFinite(audio.duration)) {
    audio.currentTime = Math.min(tempo, audio.duration);
  }

  if (atual?.playing) {
    const startedAt = Date.now() - tempo * 1000;
    const nextMusica = { ...atual, startedAt };
    atual = nextMusica;
    avisar();
    if (roomId) {
      await patchSceneEnv(roomId, () => ({ musica: nextMusica }));
    }
  }
}

/** Toque do jogador na tela: libera o som bloqueado pelo navegador. */
export function liberarMusica() {
  if (bloqueado && audio) {
    audio.play()
      .then(() => {
        bloqueado = false;
        startProgressLoop();
        avisar();
      })
      .catch(() => {
        bloqueado = true;
      });
  }
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
  if (audio) {
    audio.volume = alvoVolume();
  }
  avisar();
}

/** Saiu da sala: a música para na hora. */
export function encerrarMusica() {
  atual = null;
  bloqueado = false;
  pararAudio(true);
  avisar();
}
