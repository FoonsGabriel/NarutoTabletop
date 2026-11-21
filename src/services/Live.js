/**
 * Peças da tela de gravação (Modo live) usadas em dois lugares: na tela (TelaLive.jsx) e no vídeo
 * montado pela gravação (Gravacao.js), para os dois ficarem iguais.
 */

// Posições em % da tela (esquerda, topo, largura, altura). Padrão: o exemplo mandado pelo Gabriel.
export const LAYOUT_LIVE_PADRAO = {
  mestre: { x: 1, y: 1.5, w: 36, h: 38 },
  mapa: { x: 1, y: 41.5, w: 36, h: 57 },
  personagens: { x: 38, y: 1.5, w: 61, h: 97 },
};


/**
 * Machucados no retrato (Modo live parte 2, decidido pelo Gabriel em 21/11):
 * cortes e sangue por cima + retrato escurecendo/avermelhando + borda rachando.
 * 4 etapas: Vida ≤ 75% · ≤ 50% · ≤ 25% · 0 (preto e branco).
 * Na tela é CSS/SVG parado (nada roda em loop): leve no celular.
 */
export function etapaMachucado(vida, vidaMax) {
  if (vida <= 0) return 4;
  const pct = (vida / Math.max(1, vidaMax)) * 100;
  if (pct <= 25) return 3;
  if (pct <= 50) return 2;
  if (pct <= 75) return 1;
  return 0;
}

// Por etapa: filtro do retrato, força do vermelho nas bordas e cor do aro.
export const VISUAL_ETAPA = [
  { filtro: 'none', vermelho: 0, aro: '#d4d4d8' },
  { filtro: 'brightness(0.95) saturate(0.95)', vermelho: 0.25, aro: '#d4d4d8' },
  { filtro: 'brightness(0.85) sepia(0.25) saturate(1.1)', vermelho: 0.45, aro: '#fca5a5' },
  { filtro: 'brightness(0.7) sepia(0.45) saturate(1.3) hue-rotate(-15deg)', vermelho: 0.65, aro: '#b91c1c' },
  { filtro: 'brightness(0.75)', vermelho: 0.35, aro: '#71717a' },
];

// Cortes (aparecem a partir da etapa indicada). Coordenadas num quadrado 100×100.
export const CORTES = [
  { desde: 1, a: [27, 33], b: [53, 49] },
  { desde: 2, a: [59, 22], b: [74, 43] },
  { desde: 3, a: [29, 67], b: [57, 60] },
];
// Corte em forma de lâmina: fino nas pontas e mais largo no meio.
export const formaCorte = ({ a, b }, largura) => {
  const [mx, my] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
  const t = Math.hypot(dx, dy) || 1;
  const [nx, ny] = [(-dy / t) * largura, (dx / t) * largura];
  return `M${a[0]} ${a[1]} Q${mx + nx} ${my + ny} ${b[0]} ${b[1]} Q${mx - nx} ${my - ny} ${a[0]} ${a[1]}Z`;
};
// Escorridos de sangue (sempre para baixo): x, y inicial, comprimento.
export const ESCORRIDOS = [
  { desde: 1, x: 41, y: 41, h: 6 },
  { desde: 2, x: 47, y: 45, h: 13 },
  { desde: 2, x: 68, y: 36, h: 9 },
  { desde: 3, x: 37, y: 64, h: 14 },
  { desde: 3, x: 52, y: 61, h: 10 },
  { desde: 3, x: 72, y: 42, h: 16 },
];
// Gotas soltas.
export const GOTAS = [
  { desde: 1, x: 58, y: 54, r: 1.4 },
  { desde: 2, x: 33, y: 50, r: 1.8 },
  { desde: 3, x: 63, y: 70, r: 2.2 },
  { desde: 3, x: 24, y: 58, r: 1.5 },
];
// Rachaduras no aro (começam na borda e entram um pouco).
export const RACHADURAS = [
  { desde: 2, pts: '50,0 48,7 52,12 49,18' },
  { desde: 3, pts: '8,72 15,70 18,75 25,73' },
  { desde: 3, pts: '96,35 89,38 90,44 84,46' },
  { desde: 4, pts: '70,96 67,89 71,85 66,79' },
  { desde: 4, pts: '14,18 20,23 19,29 25,32' },
];


/** Cada personagem tem os cortes num ângulo diferente (fixo pelo id), para não ficarem iguais. */
export function viradaCortes(id) {
  const semente = String(id).split('').reduce((s, ch) => s + ch.charCodeAt(0), 0);
  return { giro: (semente % 7) * 12 - 36, espelho: semente % 2 ? -1 : 1 };
}

/** Desenho dos machucados (cortes, sangue e gotas) em SVG, para a gravação. */
export function svgMachucados(etapa, id) {
  const { giro, espelho } = viradaCortes(id);
  const cortes = CORTES.filter((c) => etapa >= c.desde).map((c) => (
    `<path d="${formaCorte(c, 4)}" fill="#450a0a" opacity="0.8"/><path d="${formaCorte(c, 2.2)}" fill="#b91c1c"/><path d="${formaCorte(c, 0.7)}" fill="#fecaca" opacity="0.5"/>`
  )).join('');
  const escorridos = ESCORRIDOS.filter((e) => etapa >= e.desde).map((e) => (
    `<path d="M${e.x} ${e.y} v${e.h}" stroke="#991b1b" stroke-width="2.2" stroke-linecap="round" opacity="0.9"/><circle cx="${e.x}" cy="${e.y + e.h + 0.6}" r="1.6" fill="#991b1b"/>`
  )).join('');
  const gotas = GOTAS.filter((g) => etapa >= g.desde).map((g) => `<circle cx="${g.x}" cy="${g.y}" r="${g.r}" fill="#7f1d1d" opacity="0.9"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="200" height="200"><g transform="rotate(${giro} 50 50) translate(50 50) scale(${espelho} 1) translate(-50 -50)">${cortes}</g>${escorridos}${gotas}</svg>`;
}

/** Rachaduras do aro em SVG, para a gravação. */
export function svgRachaduras(etapa) {
  const linhas = RACHADURAS.filter((r) => etapa >= r.desde).map((r) => (
    `<polyline points="${r.pts}" fill="none" stroke="#000" stroke-width="2.4" opacity="0.7" stroke-linejoin="round" stroke-linecap="round"/><polyline points="${r.pts}" fill="none" stroke="#e4e4e7" stroke-width="0.9" stroke-linejoin="round" stroke-linecap="round"/>`
  )).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="200" height="200" overflow="visible">${linhas}</svg>`;
}

/** Personagens dos jogadores na mesa (não NPC, dono que não é o Mestre, sem invocações). */
export function personagensDaLive(engine, gmId) {
  return Object.values(engine?.characters || {})
    .filter((c) => c && !c.is_npc && c.owner_id && c.owner_id !== gmId && !c.attributes?.criatura)
    .map((c) => ({
      id: c.id, dono: c.owner_id, nome: c.name, retrato: c.avatar_url || `https://api.dicebear.com/7.x/adventurer/png?seed=${c.id}`,
      vida: Number(c.hp_current ?? 0), vidaMax: Math.max(1, Number(c.hp_max ?? 1)),
      chakra: Number(c.chakra_current ?? 0), chakraMax: Math.max(1, Number(c.chakra_max ?? 1)),
    }))
    .sort((a, b) => a.nome.localeCompare(b.nome));
}

/**
 * Colunas da grade de personagens (igual na tela e no vídeo): escolhe as que deixam cada cartão
 * mais perto de 4:3 dentro da área (área em % de uma tela 16:9).
 */
export function colunasLive(n, area = LAYOUT_LIVE_PADRAO.personagens) {
  if (n <= 1) return 1;
  let melhor = 1;
  let nota = Infinity;
  for (let c = 1; c <= n; c += 1) {
    const linhas = Math.ceil(n / c);
    const proporcao = ((area.w * 16) / c) / ((area.h * 9) / linhas);
    const n2 = Math.abs(Math.log(proporcao / (4 / 3)));
    if (n2 < nota) { nota = n2; melhor = c; }
  }
  return melhor;
}

/** Modelos prontos (Modo live parte 3). O Mestre escolhe um e ajusta arrastando. */
export const MODELOS_LIVE = [
  { id: 'padrao', nome: 'Padrão', layout: LAYOUT_LIVE_PADRAO },
  {
    id: 'mapa-grande', nome: 'Mapa grande', layout: {
      mapa: { x: 1, y: 1.5, w: 64, h: 97 },
      mestre: { x: 66, y: 1.5, w: 33, h: 33 },
      personagens: { x: 66, y: 36, w: 33, h: 62.5 },
    },
  },
  {
    id: 'mapa-em-cima', nome: 'Mapa em cima', layout: {
      mapa: { x: 1, y: 1.5, w: 98, h: 60 },
      mestre: { x: 1, y: 63, w: 24, h: 35.5 },
      personagens: { x: 26, y: 63, w: 73, h: 35.5 },
    },
  },
  {
    id: 'mestre-destaque', nome: 'Mestre em destaque', layout: {
      mestre: { x: 1, y: 1.5, w: 49, h: 55 },
      mapa: { x: 1, y: 58, w: 49, h: 40.5 },
      personagens: { x: 51, y: 1.5, w: 48, h: 97 },
    },
  },
];

const QUADROS = ['mestre', 'mapa', 'personagens'];
const numero = (v, padrao) => (Number.isFinite(Number(v)) ? Number(v) : padrao);

/** Layout guardado na mesa → layout válido (o que faltar ou vier errado usa o padrão). */
export function lerLayoutLive(salvo) {
  const l = {};
  QUADROS.forEach((q) => {
    const p = LAYOUT_LIVE_PADRAO[q];
    const r = salvo?.[q] || {};
    const w = Math.min(100, Math.max(8, numero(r.w, p.w)));
    const h = Math.min(100, Math.max(8, numero(r.h, p.h)));
    l[q] = {
      x: Math.min(100 - w, Math.max(0, numero(r.x, p.x))),
      y: Math.min(100 - h, Math.max(0, numero(r.y, p.y))),
      w, h,
    };
  });
  return l;
}
