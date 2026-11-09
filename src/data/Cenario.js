// =====================================================================
// Catálogo de itens de cenário (Konoha e arredores).
//
// As imagens ficam em public/props/ com o nome indicado em `arquivo`
// (PNG com fundo transparente, a base do objeto encostando no fim da imagem).
// Enquanto a imagem não existir, o item aparece como "falta imagem" no painel
// (a Fogueira não precisa: a lenha é desenhada pelo próprio sistema).
//
// fx:    efeito animado por partículas (canvas/PropFx.js)
//        fogo | tocha | brasa | fumaca | vagalumes | folhas | sakura | agua | nenhum
// luz:   { raio (células), cor } — aparece ao entardecer, à noite e com chuva
// anim:  sway (balança com o vento) | flicker (tremula) | none
// bloqueia: impede a passagem no movimento (padrão: sim)
// =====================================================================

const P = (arquivo) => `/props/${arquivo}.png`;

export const CATEGORIAS_CENARIO = [
  { key: 'natureza', label: '🌳 Natureza' },
  { key: 'vila', label: '🏮 Vila' },
  { key: 'luz', label: '🔥 Fogo e luz' },
  { key: 'treino', label: '🎯 Treino' },
  { key: 'efeitos', label: '✨ Só efeito' },
];

export const CENARIO = [
  // ---------------- Natureza ----------------
  { key: 'arvore', categoria: 'natureza', nome: 'Árvore', arquivo: 'Arvore-Grande', reserva: '/props/arvore.png', altura: 3.4, anim: 'sway', fx: 'folhas' },
  { key: 'pinheiro', categoria: 'natureza', nome: 'Pinheiro', arquivo: 'Pinheiro', altura: 3.8, anim: 'sway' },
  { key: 'sakura', categoria: 'natureza', nome: 'Cerejeira', arquivo: 'Cerejeira', altura: 3.2, anim: 'sway', fx: 'sakura' },
  { key: 'arbusto', categoria: 'natureza', nome: 'Arbusto', arquivo: 'Arbusto', altura: 1.1, anim: 'sway', bloqueia: false },
  { key: 'bambu', categoria: 'natureza', nome: 'Bambuzal', arquivo: 'Bambu', altura: 3, anim: 'sway' },
  { key: 'pedra', categoria: 'natureza', nome: 'Pedra grande', arquivo: 'Pedra-Grande', altura: 1.4 },
  { key: 'pedras', categoria: 'natureza', nome: 'Pedrinhas', arquivo: 'Pedras-Pequenas', altura: 0.6, bloqueia: false },
  { key: 'toco', categoria: 'natureza', nome: 'Toco', arquivo: 'Toco', altura: 0.8 },
  { key: 'tronco_caido', categoria: 'natureza', nome: 'Tronco caído', arquivo: 'Tronco-Caido', altura: 0.9 },
  { key: 'grama', categoria: 'natureza', nome: 'Mato alto', arquivo: 'Mato-Alto', altura: 0.9, anim: 'sway', bloqueia: false },

  // ---------------- Vila ----------------
  { key: 'lanterna_papel', categoria: 'vila', nome: 'Lanterna de papel', arquivo: 'Lanterna-Papel', altura: 2.2, anim: 'sway', luz: { raio: 3.5, cor: '#ffb066' } },
  { key: 'lanterna_pedra', categoria: 'vila', nome: 'Lanterna de pedra', arquivo: 'Lanterna-Pedra', altura: 1.6, fx: 'brasa', luz: { raio: 3, cor: '#ffc47a' } },
  { key: 'poste', categoria: 'vila', nome: 'Poste de madeira', arquivo: 'Poste-Madeira', altura: 3, luz: { raio: 4.5, cor: '#ffd27a' } },
  { key: 'banco', categoria: 'vila', nome: 'Banco', arquivo: 'Banco', altura: 0.9 },
  { key: 'caixotes', categoria: 'vila', nome: 'Caixotes', arquivo: 'Caixotes', altura: 1.2 },
  { key: 'barril', categoria: 'vila', nome: 'Barril', arquivo: 'Barril', altura: 1 },
  { key: 'barraca', categoria: 'vila', nome: 'Barraca de ramen', arquivo: 'Barraca-Ramen', altura: 3, fx: 'fumaca', luz: { raio: 4, cor: '#ffcf8a' } },
  { key: 'carroca', categoria: 'vila', nome: 'Carroça', arquivo: 'Carroca', altura: 1.6 },
  { key: 'placa', categoria: 'vila', nome: 'Placa', arquivo: 'Placa', altura: 1.5 },
  { key: 'cerca', categoria: 'vila', nome: 'Cerca', arquivo: 'Cerca', altura: 1.1 },
  { key: 'poco', categoria: 'vila', nome: 'Poço', arquivo: 'Poco', altura: 1.6 },
  { key: 'torii', categoria: 'vila', nome: 'Portão torii', arquivo: 'Torii', altura: 4.5, bloqueia: false },
  { key: 'chamine', categoria: 'vila', nome: 'Chaminé (fumaça)', arquivo: 'Chamine', altura: 2.4, fx: 'fumaca' },

  // ---------------- Fogo e luz ----------------
  { key: 'fogueira', categoria: 'luz', nome: 'Fogueira', builtin: 'fogueira', arquivo: 'Fogueira', altura: 1.1, fx: 'fogo', luz: { raio: 5, cor: '#ff9a40' } },
  { key: 'tocha', categoria: 'luz', nome: 'Tocha', arquivo: 'Tocha', altura: 2, fx: 'tocha', luz: { raio: 3.5, cor: '#ffa64d' } },
  { key: 'braseiro', categoria: 'luz', nome: 'Braseiro', arquivo: 'Braseiro', altura: 1.2, fx: 'fogo', luz: { raio: 4, cor: '#ff8c3a' } },

  // ---------------- Treino ----------------
  { key: 'tronco_treino', categoria: 'treino', nome: 'Tronco de treino', arquivo: 'Tronco-Treino', altura: 1.8 },
  { key: 'alvo', categoria: 'treino', nome: 'Alvo de kunai', arquivo: 'Alvo-Kunai', altura: 1.7 },
  { key: 'espantalho', categoria: 'treino', nome: 'Espantalho', arquivo: 'Espantalho', altura: 2, anim: 'sway' },

  // ---------------- Só efeito (sem imagem) ----------------
  { key: 'fx_fogo', categoria: 'efeitos', nome: 'Chamas soltas', builtin: 'vazio', altura: 1, fx: 'fogo', luz: { raio: 4, cor: '#ff9a40' }, bloqueia: false },
  { key: 'fx_fumaca', categoria: 'efeitos', nome: 'Fumaça', builtin: 'vazio', altura: 1, fx: 'fumaca', bloqueia: false },
  { key: 'fx_vagalumes', categoria: 'efeitos', nome: 'Vagalumes', builtin: 'vazio', altura: 1, fx: 'vagalumes', bloqueia: false },
  { key: 'fx_agua', categoria: 'efeitos', nome: 'Respingos (fonte, cachoeira)', builtin: 'vazio', altura: 1, fx: 'agua', bloqueia: false },
  { key: 'fx_folhas', categoria: 'efeitos', nome: 'Folhas no vento', builtin: 'vazio', altura: 2.5, fx: 'folhas', bloqueia: false },
];

export const EFEITOS_CENARIO = [
  { key: 'nenhum', label: 'Nenhum' },
  { key: 'fogo', label: '🔥 Fogo (chamas, brasas e fumaça)' },
  { key: 'tocha', label: '🕯️ Chama pequena (tocha, vela)' },
  { key: 'brasa', label: '✨ Brasa (lanterna de pedra)' },
  { key: 'fumaca', label: '💨 Fumaça (chaminé, barraca)' },
  { key: 'vagalumes', label: '🪲 Vagalumes (à noite)' },
  { key: 'folhas', label: '🍃 Folhas caindo' },
  { key: 'sakura', label: '🌸 Pétalas de cerejeira' },
  { key: 'agua', label: '💧 Respingos de água' },
];

export const urlDoItem = (item) => (item.builtin ? null : P(item.arquivo));

/** `sprite` do token para um item do catálogo. */
export function spriteDoItem(item) {
  return {
    mode: 'prop',
    url: urlDoItem(item),
    ...(item.reserva ? { fallback: item.reserva } : {}),
    ...(item.builtin ? { builtin: item.builtin } : {}),
    heightCells: item.altura,
    anim: item.anim || 'none',
    fx: item.fx || 'nenhum',
    ...(item.luz ? { light: { radius: item.luz.raio, color: item.luz.cor } } : {}),
    blocks: item.bloqueia !== false,
  };
}
