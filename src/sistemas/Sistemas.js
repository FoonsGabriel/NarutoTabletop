// =====================================================================
// Sistemas de RPG do Sessão Zero (PLANEJAMENTO-IA seção 11 — N1).
//
// Cada sistema tem a sua pasta em src/sistemas/<id>/ e uma "porta de entrada"
// (Index.js) com o que o resto do site precisa saber dele.
// Mesas antigas (sem o campo `sistema`) são do Shinobi no Sho.
// =====================================================================

export const SISTEMA_PADRAO = 'shinobi';

export const SISTEMAS = [
  {
    id: 'shinobi',
    nome: 'Naruto: Shinobi no Sho',
    resumo: 'Ninjas, clãs, jutsus e chakra.',
    disponivel: true,
  },
  {
    id: 'tormenta20',
    nome: 'Tormenta20',
    resumo: 'Fantasia medieval em Arton.',
    disponivel: false, // "em breve" (N3, mais para frente)
  },
  // Ordem Paranormal: futuro — ainda não aparece.
];

export const acharSistema = (id) => SISTEMAS.find((s) => s.id === id) || null;

/** Sistema de uma mesa (mesas antigas não têm o campo: são do Shinobi). */
export const sistemaDaMesa = (mesa) => mesa?.sistema || SISTEMA_PADRAO;
