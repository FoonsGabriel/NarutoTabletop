import { ARQUIVOS_MUSICA } from './MusicasArquivos.js';

/** "Combate - Douten.mp3" → "Combate · Douten" ("_" vira espaço; o hífen colado continua). */
export function nomeDaMusica(arquivo) {
  return String(arquivo || '')
    .split('/')
    .pop()
    .replace(/\.[^.]+$/, '')
    .replace(/_+/g, ' ')
    .replace(/\s+-\s+/g, ' · ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Grupo pelo começo do nome: "Combate · …" ou "Normal · …" (o resto fica em "Outras"). */
function separarGrupo(nome) {
  const match = nome.match(/^(Combate|Normal)\s*·\s*(.+)$/i);
  if (!match) return { grupo: 'Outras', titulo: nome };
  return { grupo: match[1][0].toUpperCase() + match[1].slice(1).toLowerCase(), titulo: match[2] };
}

/** Músicas que já vêm no sistema (pasta src/assets/Musicas), em ordem alfabética. */
export const MUSICAS_PRONTAS = Object.entries(ARQUIVOS_MUSICA)
  .map(([caminho, url]) => {
    const nome = nomeDaMusica(caminho);
    return { id: `pronta:${caminho}`, nome, url, ...separarGrupo(nome) };
  })
  .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

export const GRUPOS_MUSICA = [
  { key: 'Combate', label: '⚔️ Combate' },
  { key: 'Normal', label: '🍃 Normais' },
  { key: 'Outras', label: '🎵 Outras' },
];
