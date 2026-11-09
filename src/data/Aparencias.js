// =====================================================================
// Aparências padrão (corpo inteiro) para quem ainda não tem imagem própria.
// As imagens ficam em public/sprites/. Se uma não existir, o token tenta a
// imagem genérica do tipo e, por último, a bolinha antiga.
//
// Tipos de PdM do Livro Básico (págs. 280–281): Capanga e Inimigo (Taijutsu,
// Ninjutsu ou Genjutsu). Criaturas do Kuchiyose (págs. 225–229): Águias, Cães,
// Cobras, Lesmas, Macacos e Sapos.
// =====================================================================

const BASE = '/sprites';

// Altura padrão no mapa (em blocos): criança (genin) 1.8 · adulto 2.6.
export const ALTURA_CRIANCA = 1.8;
export const ALTURA_ADULTO = 2.6;

export const APARENCIAS_PADRAO = {
  jogador: { url: `${BASE}/Genin-Padrao.png`, heightCells: ALTURA_CRIANCA },
  capanga: { url: `${BASE}/Capanga-Padrao.png`, fallback: `${BASE}/Inimigo-Padrao.png`, heightCells: ALTURA_ADULTO },
  inimigo: {
    taijutsu: { url: `${BASE}/Inimigo-Taijutsu.png`, fallback: `${BASE}/Inimigo-Padrao.png`, heightCells: ALTURA_ADULTO, facing: 'left' },
    ninjutsu: { url: `${BASE}/Inimigo-Ninjutsu.png`, fallback: `${BASE}/Inimigo-Padrao.png`, heightCells: ALTURA_ADULTO, facing: 'left' },
    genjutsu: { url: `${BASE}/Inimigo-Genjutsu.png`, fallback: `${BASE}/Inimigo-Padrao.png`, heightCells: ALTURA_ADULTO, facing: 'left' },
  },
  // Ninjas de vila (Inimigo ou Capanga com a vila marcada).
  vila: {
    konoha: { label: 'Konohagakure', url: `${BASE}/Inimigo-Konohagakure.png` },
    suna: { label: 'Sunagakure', url: `${BASE}/Inimigo-Sunagakure.png` },
    kiri: { label: 'Kirigakure', url: `${BASE}/Inimigo-Kirigakure.png` },
    kumo: { label: 'Kumogakure', url: `${BASE}/Inimigo-Kumogakure.png` },
    iwa: { label: 'Iwagakure', url: `${BASE}/Inimigo-Iwagakure.png` },
  },
  criatura: {
    aguias: `${BASE}/Criatura-Aguia.png`,
    caes: `${BASE}/Criatura-Cao.png`,
    cobras: `${BASE}/Criatura-Cobra.png`,
    lesmas: `${BASE}/Criatura-Lesma.png`,
    macacos: `${BASE}/Criatura-Macaco.png`,
    sapos: `${BASE}/Criatura-Sapo.png`,
    tubaroes: `${BASE}/Criatura-Tubarao.png`,
    baku: `${BASE}/Criatura-Baku.png`,
    doninhas: `${BASE}/Criatura-Doninha.png`,
    mariscos: `${BASE}/Criatura-Marisco.png`,
    salamandras: `${BASE}/Criatura-Salamandra.png`,
    tartarugas: `${BASE}/Criatura-Tartaruga.png`,
  },
};

/** `sprite` para um token novo: a aparência da ficha, ou a padrão do tipo. */
export function figureFor(character) {
  const npc = character?.attributes?.npc;
  const own = npc?.figure?.url ? npc.figure : character?.attributes?.figure?.url ? character.attributes.figure : null;
  if (own) return { mode: 'figure', ...own };

  if (!npc) return { mode: 'figure', ...APARENCIAS_PADRAO.jogador };
  const vila = APARENCIAS_PADRAO.vila[npc.vila];
  if (vila && (npc.type === 'inimigo' || npc.type === 'capanga')) {
    return { mode: 'figure', url: vila.url, fallback: `${BASE}/Inimigo-Padrao.png`, heightCells: ALTURA_ADULTO, facing: 'left' };
  }
  if (npc.type === 'capanga') return { mode: 'figure', ...APARENCIAS_PADRAO.capanga };
  if (npc.type === 'criatura') {
    return {
      mode: 'figure',
      url: APARENCIAS_PADRAO.criatura[npc.species] || `${BASE}/Inimigo-Padrao.png`,
      fallback: `${BASE}/Inimigo-Padrao.png`,
      heightCells: Number(npc.figure_height) || 1.8,
    };
  }
  const byStyle = APARENCIAS_PADRAO.inimigo[npc.style] || APARENCIAS_PADRAO.inimigo.taijutsu;
  return { mode: 'figure', ...byStyle };
}
