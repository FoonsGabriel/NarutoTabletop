// =====================================================================
// Catálogo de Poderes — Naruto "Shinobi no Sho", Livro Básico 4.1b
// Capítulo "Poderes" (págs. 84–122). Conteúdo sob licença CC BY-NC-SA 2.5
// / Open Game License — crédito: Diego "Fesant" Silva / Projeto D8.
//
// Esta é a 1ª versão: só os PODERES COMUNS (compráveis por qualquer
// personagem). Poderes de clã/hijutsu e os efeitos/técnicas de cada
// nível entram nas próximas etapas.
// =====================================================================
import { PODERES_CLAS, PODERES_HIJUTSU } from './Clas.js';

/**
 * tipo:
 *  - 'geral'    → Ninpou (arte ninja não-elemental)
 *  - 'elemento' → ninjutsu elemental básico (regra de Afinidade Elemental)
 *  - 'tecnica'  → poderes com técnicas prontas por nível
 *
 * requisitos:
 *  - atributos: valor mínimo do atributo (bônus de precisão NÃO contam, pág. 85)
 *  - aptidoes:  aptidões exigidas (nome como está no livro)
 */
export const PODERES_COMUNS = [
  {
    id: 'ninpou',
    nome: 'Ninpou (Arte Ninja)',
    tipo: 'geral',
    pagina: 91,
    precisaNome: true, // o livro pede um nome próprio, ex.: "Ninpou: Hari Jizou"
    resumo: 'Ninjutsu não-elemental com estilo próprio. A cada nível você escolhe um novo Efeito.',
    requisitos: {},
  },
  {
    id: 'doton',
    nome: 'Doton (Elemento Terra)',
    tipo: 'elemento',
    pagina: 103,
    resumo: 'Elemento mais versátil; criações com +2 de dureza. Alcance curto.',
    requisitos: {},
  },
  {
    id: 'fuuton',
    nome: 'Fuuton (Elemento Vento)',
    tipo: 'elemento',
    pagina: 105,
    resumo: 'Ofensivo, +2 de dano base em todo Efeito. Alcance médio.',
    requisitos: {},
  },
  {
    id: 'katon',
    nome: 'Katon (Elemento Fogo)',
    tipo: 'elemento',
    pagina: 107,
    resumo: 'Maior área de efeito e dano máximo, ao lado do Fuuton.',
    requisitos: {},
  },
  {
    id: 'raiton',
    nome: 'Raiton (Elemento Trovão)',
    tipo: 'elemento',
    pagina: 109,
    resumo: 'Maior alcance, +1 de dano base; menor área de efeito.',
    requisitos: {},
  },
  {
    id: 'suiton',
    nome: 'Suiton (Elemento Água)',
    tipo: 'elemento',
    pagina: 111,
    resumo: 'Segundo elemento mais versátil; mesmo alcance e tamanho do Ninpou.',
    requisitos: {},
  },
  {
    id: 'fuuinjutsu',
    nome: 'Fuuinjutsu (Selamento)',
    tipo: 'tecnica',
    pagina: 114,
    resumo: 'Selos para armazenar objetos, chakra e jutsus, até selamentos avançados.',
    requisitos: { atributos: { inteligencia: 6 } },
  },
  {
    id: 'iryou_ninjutsu',
    nome: 'Iryou Ninjutsu (Ninjutsu Médico)',
    tipo: 'tecnica',
    pagina: 120,
    resumo: 'Cura por toque com concentração; técnicas médicas em níveis altos.',
    requisitos: { atributos: { espirito: 6 }, aptidoes: ['Ninja Médico'] },
  },
  {
    id: 'rasengan',
    nome: 'Rasengan (Explosão Espiral)',
    tipo: 'tecnica',
    pagina: 121,
    resumo: 'Esfera de chakra em ataque de toque; o dano cresce a cada nível.',
    requisitos: { atributos: { espirito: 8 } },
  },
];

export const TIPOS_DE_PODER = {
  geral: 'Ninpou',
  elemento: 'Elementos',
  tecnica: 'Técnicas',
  restrito: 'Clã / Hijutsu (restritos)',
};

/**
 * Poderes restritos. requisitos.cla = nome que precisa aparecer no campo
 * "Clã ou Hijutsu" da ficha.
 */
export const PODERES_RESTRITOS = [
  {
    id: 'kikai_ninpou',
    nome: 'Kikai Ninpou (Aburame)',
    tipo: 'restrito',
    pagina: 147,
    resumo: 'Ninpou de insetos: usa Lidar com Animais no lugar do Espírito, drena 1 de chakra por nível usado ao acertar e não pode ser Bloqueado.',
    requisitos: { cla: 'Aburame', aptidoes: ['Kikaichuu (Inseto Parasita Destruidor)'] },
  },
  {
    id: 'hyouton',
    nome: 'Hyouton (Elemento Gelo)',
    tipo: 'restrito',
    pagina: 19,
    resumo: '[Hijutsus] Kekkei genkai do Clã Yuki: regras do Ninpou (todos os efeitos + Imergir), criações com +2 de dureza e +1 na Dif de resistência. Canhão de Fuuton e Suiton no nível do Hyouton. Efeito exclusivo Nv 6: Espelhos Demoníacos.',
    requisitos: { cla: 'Yuki' },
  },
  {
    id: 'nintaijutsu',
    nome: 'Nintaijutsu',
    tipo: 'restrito',
    pagina: 61,
    resumo: '[Hijutsus] Raiton + combate físico: efeitos próprios por nível (Força Bruta, Elbow, Straight, Lariat, Hell Stab, Guillotine Drop, Linger Bomb, Reverse Chop). Dano = nível + ½ Força; Dif = 7 + nível + ½ Força; só toque (CC).',
    requisitos: { cla: 'Nintaijutsu', atributos: { forca: 2 }, aptidoes: ['Velocista', 'Ataque em Movimento'] },
  },
  {
    id: 'kami_ninpou',
    nome: 'Kami Ninpou (Arte Secreta dos Papéis)',
    tipo: 'restrito',
    pagina: 57,
    precisaNome: false,
    resumo: '[Hijutsus] Ninpou de papel: +1 de dano, alcance médio, Arte pode substituir o Espírito. Efeitos: Canhão, Criar Arma, Raio, Flechas, Sopro, Coluna, Lança, Míssil, Ricochete, Correnteza (+ Algemar, Orbe, Barreira e Prisão de Água com Shikigami no Mai). Exclusivos: Anjo de Papel (Nv 5), Julgamento (Nv 6), Emissário Divino (Nv 10).',
    requisitos: { cla: ['Kamijutsu', 'Kami'] },
  },
  {
    id: 'versatilidade',
    nome: 'Versatilidade',
    tipo: 'restrito',
    pagina: 241,
    resumo: 'Como Ninpou, mas com dois poderes versáteis (Ninpou, Suiton, Katon, Doton, Fuuton ou Raiton). Nv 1: efeito de nível 1 nos dois; a partir do Nv 2 cada nível vai para um deles (no máximo 2 seguidos no mesmo). Usa o nível da Versatilidade como nível do poder e não conta na afinidade elemental. Fuuinjutsu versátil: combine com o Mestre.',
    requisitos: { cla: 'Tensai' },
  },
  {
    id: 'hibon_ninpou',
    nome: 'Hibon Ninpou (Arte Ninja Única)',
    tipo: 'restrito',
    pagina: 212,
    precisaNome: true,
    resumo: 'Ninpou exclusivo da família: mesmos parâmetros do Ninpou + 2 bonificações (+1 de dano, que pode ser escolhido 2×; +2 de dureza; +1 na Dif de resistência). Todos os efeitos de Ninpou + os exclusivos de um elemento básico (combine com o Mestre).',
    requisitos: { cla: 'Hibon' },
  },
  {
    id: 'dokujutsu',
    nome: 'Dokujutsu (Arte dos Venenos)',
    tipo: 'restrito',
    pagina: 201,
    resumo: 'Ninpou de venenos: Inteligência no lugar do Espírito, alcance médio. Aplica venenos junto dos efeitos (resistência 8 + Venefício). Veneno Melhorado: +2 em Venefício para fabricar, +1 na Dif, 1 turno a menos e venenos de Nível V.',
    requisitos: { cla: 'Dokujutsu', aptidoes: ['Químico'] },
  },
  {
    id: 'mokuton',
    nome: 'Mokuton (Elemento Madeira)',
    tipo: 'restrito',
    pagina: 175,
    resumo: 'Kekkei genkai Senju: regras do Ninpou, +1 de dano base e +1 na Dif de resistência, todos os efeitos + Imergir. Ganha Canhão de Doton e Suiton no nível do Mokuton.',
    requisitos: { cla: ['Senju', 'Mokuton'] },
    elementosPermitidos: ['doton', 'suiton'],
  },
  {
    id: 'jiton_satetsu',
    nome: 'Jiton: Satetsu (Areia de Ferro)',
    tipo: 'restrito',
    pagina: 53,
    livro: 'Hijutsus 4.1b',
    resumo: 'Versão do Sabaku Hijutsu com areia de ferro: alcance médio, tamanho 2 m por Espírito, +2 de dureza. Areia Especial obrigatória. Ganha Canhão de Fuuton e Doton no nível do Jiton.',
    requisitos: { cla: 'Jiton' },
    elementosPermitidos: ['doton', 'fuuton'],
  },
  {
    id: 'jiton_sakin',
    nome: 'Jiton: Sakin (Poeira de Ouro)',
    tipo: 'restrito',
    pagina: 53,
    livro: 'Hijutsus 4.1b',
    resumo: 'Versão do Sabaku Hijutsu com pó de ouro (vantagem contra Sabaku). Areia Especial obrigatória. Ganha Canhão de Fuuton e Doton no nível do Jiton.',
    requisitos: { cla: 'Jiton' },
    elementosPermitidos: ['doton', 'fuuton'],
  },
];

// Poderes dos clãs do Livro Básico (data/Clas.js).
PODERES_RESTRITOS.push(...PODERES_CLAS, ...PODERES_HIJUTSU);

const NOMES_ATRIBUTOS = {
  forca: 'Força',
  destreza: 'Destreza',
  agilidade: 'Agilidade',
  percepcao: 'Percepção',
  inteligencia: 'Inteligência',
  vigor: 'Vigor',
  espirito: 'Espírito',
};

export const NOMES_DE_ATRIBUTOS = NOMES_ATRIBUTOS;

/** Converte uma linha da tabela room_catalog (criada pelo Mestre) em poder. */
export function powerFromCatalogRow(row) {
  return {
    id: `custom:${row.id}`,
    nome: row.nome,
    tipo: TIPOS_DE_PODER[row.tipo] ? row.tipo : 'geral',
    pagina: null,
    resumo: row.resumo || '',
    requisitos: row.requisitos || {},
    custom: true,
  };
}

/** catalog = poderes do livro + poderes criados pelo Mestre nesta mesa. */
export function findPower(id, catalog = [...PODERES_COMUNS, ...PODERES_RESTRITOS]) {
  return catalog.find((poder) => poder.id === id) ?? null;
}

/** Limite de Poder (pág. 86): metade do NC, arredondado para baixo. */
export function maxPowerLevel(nc) {
  return Math.max(1, Math.floor(Number(nc || 0) / 2));
}

/** Afinidade Elemental (pág. 89): 1 elemento básico; 2 ao alcançar Espírito 10. */
export function maxElements(attributes) {
  return Number(attributes?.espirito || 0) >= 10 ? 2 : 1;
}

/** Custo (pág. 85): cada nível custa 1 ponto, então o custo total = nível. */
export function powersCost(list) {
  return (list || []).reduce((total, item) => total + Number(item.level || 0), 0);
}

/** Texto curto dos pré-requisitos, para mostrar na ficha. */
export function describeRequirements(poder) {
  const partes = [];
  Object.entries(poder?.requisitos?.atributos || {}).forEach(([key, valor]) => {
    partes.push(`${NOMES_ATRIBUTOS[key] || key} ${valor}`);
  });
  (poder?.requisitos?.aptidoes || []).forEach((nome) => partes.push(`aptidão ${nome}`));
  if (poder?.requisitos?.cla) partes.push(`${[].concat(poder.requisitos.cla).join(' ou ')} em Clã ou Hijutsu`);
  return partes.join(' · ');
}

const normalize = (text) =>
  String(text || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

/**
 * Valida UM poder da ficha. Retorna a lista de problemas (vazia = ok).
 * aptitudes: nomes de todas as aptidões do personagem (gratuitas + adicionais).
 */
export function validatePower(item, context) {
  const { nc, attributes, aptitudes } = context;
  const problemas = [];
  const poder = findPower(item.id, context.catalog);

  if (!poder) return ['Escolha um poder.'];

  const limite = maxPowerLevel(nc);
  if (Number(item.level) > limite) {
    problemas.push(`${poder.nome}: nível máximo no NC ${nc} é ${limite}.`);
  }

  Object.entries(poder.requisitos.atributos || {}).forEach(([key, minimo]) => {
    if (Number(attributes?.[key] || 0) < minimo) {
      problemas.push(`${poder.nome}: requer ${NOMES_ATRIBUTOS[key] || key} ${minimo}.`);
    }
  });

  const minhasAptidoes = (aptitudes || []).map(normalize);
  (poder.requisitos.aptidoes || []).forEach((nome) => {
    if (!minhasAptidoes.includes(normalize(nome))) {
      problemas.push(`${poder.nome}: requer a aptidão ${nome}.`);
    }
  });

  const clas = [].concat(poder.requisitos.cla || []);
  if (!context.regrasLivres && clas.length && !clas.some((c) => normalize(context.clan).includes(normalize(c)))) {
    problemas.push(`${poder.nome}: restrito — escolha "${clas.join('" ou "')}" na aba Identidade (Clã ou Hijutsu).`);
  }

  if (poder.precisaNome && !String(item.name || '').trim()) {
    problemas.push(`${poder.nome}: dê um nome ao seu Ninpou (ex.: Ninpou: Hari Jizou).`);
  }

  return problemas;
}

/** Valida a lista inteira (inclui regras entre poderes, como a afinidade elemental). */
export function validatePowerList(list, context) {
  const problemas = [];

  (list || []).forEach((item) => problemas.push(...validatePower(item, context)));

  // Kekkei genkai de elemento limitam os outros elementos (ex.: Mokuton só com Doton e Suiton).
  if (!context.regrasLivres) {
    (list || []).forEach((item) => {
      const poder = findPower(item.id, context.catalog);
      if (!poder?.elementosPermitidos) return;
      (list || []).forEach((other) => {
        const outro = findPower(other.id, context.catalog);
        if (outro?.tipo === 'elemento' && !poder.elementosPermitidos.includes(outro.id)) {
          problemas.push(`${poder.nome}: não pode aprender ${outro.nome} (só ${poder.elementosPermitidos.join(' e ')}).`);
        }
      });
    });
  }

  const elementos = (list || []).filter((item) => findPower(item.id, context.catalog)?.tipo === 'elemento');
  const limite = maxElements(context.attributes);
  if (elementos.length > limite) {
    problemas.push(
      limite === 1
        ? 'Afinidade elemental: só é possível ter 1 elemento básico (o 2º libera com Espírito 10).'
        : `Afinidade elemental: no máximo ${limite} elementos básicos.`
    );
  }

  return problemas;
}
