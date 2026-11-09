// =====================================================================
// Armas, armaduras e defesas — Naruto "Shinobi no Sho", Livro Básico 4.1b
// Tabelas de Armas e de Armaduras (págs. 137–139) e regras de combate
// (págs. 256–258 e 264). Conteúdo sob licença CC BY-NC-SA 2.5 / OGL —
// crédito: Diego "Fesant" Silva / Projeto D8.
//
// Escala do mapa: 1 bloco = 2 m (diagonal também conta 1 bloco).
// =====================================================================

export const METROS_POR_BLOCO = 2;

export const GRUPOS_DE_ARMA = {
  desarmado: 'Desarmado',
  leve: 'Leves',
  mediana: 'Medianas',
  longa: 'Longas',
  pesada: 'Pesadas',
  arremesso: 'Arremesso',
  disparo: 'Disparo',
  explosivo: 'Explosivos',
};

/**
 * ataque:  'cc' (golpear, Combate Corporal) | 'cd' (Combate à Distância) | 'cc_cd' (os dois)
 * dano:    dano de arma (somado à metade de FOR ou DES). Em armas "par" ou "dupla"
 *          (ex.: Tonfa +1/+1, Bastão +2/+2) é o valor de cada lado.
 * alcance: metros, para ataques à distância (null = só corpo a corpo)
 * critico: menor resultado do 2d8 que já é crítico (15 = padrão 15-16)
 * unidades: armas simples de arremesso só causam o dano de arma lançando
 *          essa quantidade de uma vez (ex.: Shuriken (3)), pág. 264
 * danoFixo: explosivos — dano próprio, não usa a metade de atributo
 */
const w = (nome, categoria, grupo, preco, dano, extra = {}) => ({
  id: slug(nome),
  nome,
  categoria,          // 'simples' | 'marcial'
  grupo,
  preco,
  dano,
  ataque: ['arremesso', 'disparo', 'explosivo'].includes(grupo) ? 'cd' : 'cc',
  alcance: null,
  critico: 15,
  tipo: '',
  ...extra,
});

export const ARMAS = [
  // ---------- Simples ----------
  w('Ataque Desarmado', 'simples', 'desarmado', '—', 0, { tipo: 'Esmagamento' }),
  w('Espada Curta', 'simples', 'leve', '8 Ryos', 2, { tipo: 'Corte' }),
  w('Tantō', 'simples', 'leve', '10 Ryos', 2, { tipo: 'Corte' }),
  w('Tonfa (par)', 'simples', 'leve', '8 Ryos', 1, { par: true, tipo: 'Esmagamento' }),
  w('Clava', 'simples', 'mediana', '—', 3, { tipo: 'Esmagamento' }),
  w('Lança', 'simples', 'mediana', '2 Ryos', 3, { ataque: 'cc_cd', alcance: 10, tipo: 'Perfuração' }),
  w('Maça', 'simples', 'mediana', '12 Ryos', 3, { tipo: 'Esmagamento' }),
  w('Ninja-tō', 'simples', 'mediana', '20 Ryos', 3, { tipo: 'Corte' }),
  w('Bastão', 'simples', 'longa', '—', 2, { dupla: true, tipo: 'Esmagamento' }),
  w('Pique', 'simples', 'longa', '2 Ryos', 3, { tipo: 'Perfuração' }),
  w('Tacape', 'simples', 'pesada', '—', 4, { tipo: 'Esmagamento' }),
  w('Senbon', 'simples', 'arremesso', '3 Ryos cada', 1, { ataque: 'cc_cd', alcance: 20, unidades: 3, tipo: 'Perfuração' }),
  w('Shuriken', 'simples', 'arremesso', '3 Ryos cada', 1, { alcance: 20, unidades: 3, tipo: 'Perfuração' }),
  w('Kunai', 'simples', 'arremesso', '2 Ryos cada', 1, { ataque: 'cc_cd', alcance: 15, unidades: 3, tipo: 'Perfuração' }),
  w('Arco Curto', 'simples', 'disparo', '30 Ryos', 1, { alcance: 25, tipo: 'Perfuração' }),
  w('Besta Leve', 'simples', 'disparo', '35 Ryos', 2, { alcance: 25, tipo: 'Perfuração' }),
  w('Tarja Explosiva', 'simples', 'explosivo', '10 Ryos cada', 0, { danoFixo: 4, area: 5, critico: null, tipo: 'Fogo' }),
  w('Bomba de Fumaça', 'simples', 'explosivo', '10 Ryos cada', 0, { semDano: true, area: 10, critico: null }),
  w('Bomba Luminosa', 'simples', 'explosivo', '10 Ryos cada', 0, { semDano: true, area: 10, critico: null }),

  // ---------- Marciais (precisam da aptidão Usar Arma, senão −3) ----------
  w('Aian Nakkuru (par)', 'marcial', 'leve', '100 Ryos', 1, { par: true, ataque: 'cc_cd', alcance: 15, tipo: 'Corte' }),
  w('Kousen', 'marcial', 'leve', '2 Ryos', 0, { semDano: true, critico: null, nota: 'Fio de 15 m' }),
  w('Nunchaku', 'marcial', 'leve', '2 Ryos', 2, { tipo: 'Esmagamento' }),
  w('Sai (par)', 'marcial', 'leve', '5 Ryos', 1, { par: true, ataque: 'cc_cd', alcance: 20, tipo: 'Perfuração' }),
  w('Wakizashi', 'marcial', 'leve', '15 Ryos', 2, { tipo: 'Corte' }),
  w('Chicote', 'marcial', 'mediana', '1 Ryo', 0, { tipo: 'Corte' }),
  w('Chokutō', 'marcial', 'mediana', '20 Ryos', 4, { tipo: 'Corte' }),
  w('Cimitarra', 'marcial', 'mediana', '20 Ryos', 2, { critico: 14, tipo: 'Corte' }),
  w('Corrente com Cravos', 'marcial', 'mediana', '25 Ryos', 1, { tipo: 'Perfuração' }),
  w('Espada Longa', 'marcial', 'mediana', '15 Ryos', 4, { tipo: 'Corte' }),
  w('Florete', 'marcial', 'mediana', '20 Ryos', 2, { critico: 14, tipo: 'Perfuração' }),
  w('Katana', 'marcial', 'mediana', '20 Ryos', 3, { tipo: 'Corte' }),
  w('Machado', 'marcial', 'mediana', '10 Ryos', 3, { tipo: 'Corte' }),
  w('Martelo de Guerra', 'marcial', 'mediana', '12 Ryos', 3, { tipo: 'Esmagamento' }),
  w('Foice', 'marcial', 'longa', '18 Ryos', 4, { tipo: 'Corte' }),
  w('Leque Gigante', 'marcial', 'longa', '100 Ryos', 2, { tipo: 'Esmagamento' }),
  w('Espada de Duas Lâminas', 'marcial', 'pesada', '100 Ryos', 2, { dupla: true, tipo: 'Corte' }),
  w('Espada Grande', 'marcial', 'pesada', '20 Ryos', 5, { tipo: 'Corte' }),
  w('Machado Grande', 'marcial', 'pesada', '50 Ryos', 5, { tipo: 'Corte', nota: 'Tabela: +5 (+1)' }),
  w('Fuuma Shuriken: Gigante', 'marcial', 'arremesso', '10 Ryos', 5, { alcance: 20, tipo: 'Perfuração' }),
  w('Fuuma Shuriken: Lâmina Reta', 'marcial', 'arremesso', '15 Ryos', 3, { alcance: 20, tipo: 'Perfuração' }),
  w('Fuuma Shuriken: Kage Fushā', 'marcial', 'arremesso', '20 Ryos', 2, { alcance: 20, critico: 14, tipo: 'Perfuração' }),
  w('Arco Composto/Longo', 'marcial', 'disparo', '100 Ryos', 3, { alcance: 10, alcancePorDes: 2, tipo: 'Perfuração' }),
  w('Besta Pesada', 'marcial', 'disparo', '50 Ryos', 4, { alcance: 35, tipo: 'Perfuração' }),
  // ---------- Armas especiais (Livro de Hijutsus, págs. 82–90): únicas, dureza e absorção infinitas,
  // sem Energizar; sem Usar Arma própria: −3 e nenhuma técnica. Habilidades completas no livro. ----------
  w('Gunbai (especial)', 'marcial', 'longa', 'única', 3, { especial: true, tipo: 'Esmagamento', nota: 'For ou Des 10. Leque-mangual (4 m, CC ou CD); escudo que absorve o chakra de ataques e devolve como explosão de Fuuton.' }),
  w('Hiramekarei (especial)', 'marcial', 'pesada', 'única', 3, { especial: true, par: true, tipo: 'Corte', nota: 'For ou Des 12 e Esp 9. Unida: pesada de duas mãos (+6); separada: par. Guarda chakra e o solta moldado (martelo, espada longa…).' }),
  w('Kabutowari (especial)', 'marcial', 'pesada', 'única', 3, { especial: true, par: true, tipo: 'Esmagamento', nota: 'Força 12 e Ambidestria. Machado + martelo ligados: atravessa defesas; Onda de Choque (círculo de 1 m por Força).' }),
  w('Kiba (especial)', 'marcial', 'mediana', 'única', 2, { especial: true, par: true, tipo: 'Corte', nota: 'Ambidestria e Raiton 5. Só funciona com as duas: efeitos Raiton pelas espadas sem selos; ganha Energizar, Descarga e Meteoros no Raiton.' }),
  w('Kubikiribōchō (especial)', 'marcial', 'pesada', 'única', 6, { especial: true, tipo: 'Corte', nota: 'Força 12. Decapitar: +0,5 no grau de dano (não acumula com Técnica Poderosa). Pode ser danificada, mas se regenera com o sangue de quem corta.' }),
  w('Kusanagi (especial)', 'marcial', 'mediana', 'única', 0, { especial: true, tipo: 'Corte', nota: 'For ou Des 10. Escolha o formato (espada leve ou mediana da tabela) ao ganhar: dano desse modelo, ou dano base Força − 2 / Espírito − 2. Estende, retrai e é controlada por telecinesia.' }),
  w('Nuibari (especial)', 'marcial', 'mediana', 'única', 3, { especial: true, ataque: 'cc_cd', alcance: 15, tipo: 'Perfuração', nota: 'Des 12 e Ataque em Movimento. Ponta de Agulha: estocadas ignoram qualquer dureza (menos a do Jinchuuriki). Lançar (15 m, CC ou CD) e costurar os alvos com o fio.' }),
  w('Samehada (especial)', 'marcial', 'pesada', 'única', 3, { especial: true, tipo: 'Corte', nota: 'Esp 12 e Chakra Expandido. Espada viva que come chakra e fere quem não é aceito por ela.' }),
  w('Shibuki (especial)', 'marcial', 'mediana', 'única', 4, { especial: true, tipo: 'Corte', nota: 'Esp 10. Depois de acertar ou ser bloqueada: explosão de 1 a 10 m (ação de movimento) com as tarjas do pergaminho; quem estiver nela testa Agilidade ou Prontidão.' }),
];

/** penalidade: com a aptidão Usar Armaduras Pesadas · penalidadeSem: sem ela (pág. 139). */
export const ARMADURAS = [
  { id: 'nenhuma', nome: 'Sem armadura', tipo: 'leve', absorcao: 0, penalidade: 0, penalidadeSem: 0 },
  { id: 'roupa-comum', nome: 'Roupa Comum', tipo: 'leve', absorcao: 0, penalidade: 0, penalidadeSem: 0 },
  { id: 'manopla', nome: 'Manopla', tipo: 'leve', absorcao: 0, penalidade: 0, penalidadeSem: 0, permiteBloqueio: true },
  { id: 'colete-ninja', nome: 'Colete Ninja', tipo: 'leve', absorcao: 0, penalidade: 0, penalidadeSem: 0 },
  { id: 'colete-ninja-resistente', nome: 'Colete Ninja Resistente', tipo: 'leve', absorcao: 10, penalidade: 0, penalidadeSem: 0 },
  { id: 'armadura-de-batalha', nome: 'Armadura de Batalha', tipo: 'pesada', absorcao: 15, penalidade: 0, penalidadeSem: -2 },
  // Hijutsus pág. 78: sem a aptidão Armadura Samurai, penalidade −5. Dureza de corpo 2 (só contra golpes comuns se a absorção zerar).
  { id: 'armadura-samurai', nome: 'Armadura de Batalha Samurai', tipo: 'pesada', absorcao: 20, penalidade: 0, penalidadeSem: -5, durezaCorpo: 2, exigeApt: 'Armadura Samurai' },
  { id: 'armadura-de-batalha-reforcada', nome: 'Armadura de Batalha Reforçada', tipo: 'pesada', absorcao: 20, penalidade: -2, penalidadeSem: -4 },
];

// ---------------------------------------------------------------------
// Regras
// ---------------------------------------------------------------------

export const findWeapon = (id) => ARMAS.find((arma) => arma.id === id) || null;
export const findArmor = (id) => ARMADURAS.find((armadura) => armadura.id === id) || ARMADURAS[0];

/** Junta o item da ficha com o catálogo (armas personalizadas ficam inteiras na ficha). */
export function resolveWeapon(item) {
  if (!item) return null;
  if (item.custom) return { ...w(item.nome || 'Arma', 'marcial', item.grupo || 'mediana', '—', Number(item.dano) || 0), ...item, id: item.uid };
  const base = findWeapon(item.id);
  return base ? { ...base, uid: item.uid } : null;
}

const half = (value) => Math.ceil(Number(value || 0) / 2);

/** A aptidão Usar Arma foi comprada para esta arma? (o complemento é o nome da arma) */
export function isProficient(arma, aptitudes = []) {
  if (!arma || arma.categoria !== 'marcial' || arma.custom) return true;
  const alvo = normalize(arma.nome);
  return aptitudes.some((apt) => apt.nome === 'Usar Arma' && apt.complemento
    && (alvo.includes(normalize(apt.complemento)) || normalize(apt.complemento).includes(alvo.split(' (')[0])));
}

/** Tem a aptidão (pelo nome)? */
const hasApt = (aptitudes, nome) => aptitudes.some((apt) => apt.nome === nome);

/**
 * Especialista (pág. 63 e 59): +1 de precisão com a categoria escolhida
 * (o complemento é a categoria: "Leves", "Medianas", "Desarmado"...).
 */
export function isSpecialist(arma, aptitudes = []) {
  if (!arma) return false;
  const grupo = normalize(GRUPOS_DE_ARMA[arma.grupo] || arma.grupo || '');
  const raiz = grupo.replace(/s$/, '');
  return aptitudes.some((apt) => apt.nome === 'Especialista' && apt.complemento
    && (normalize(apt.complemento).includes(raiz) || raiz.includes(normalize(apt.complemento).replace(/^armas? /, '').replace(/s$/, ''))));
}

/** Punho de Ferro (pág. 66): dano de arma desarmado pela Força original. */
export function ironFistDamage(forca) {
  const f = Number(forca || 0);
  return f >= 12 ? 4 : f >= 10 ? 3 : f >= 8 ? 2 : 1;
}

/**
 * Modos de ataque possíveis com a arma: golpe corporal e/ou à distância.
 * Cada modo traz precisão, dano base, alcance e avisos — tudo pela regra do livro.
 *
 * opts: { attributes, combat: { cc, cd }, aptitudes, quantidade, duasMaos }
 */
export function attackModes(arma, opts) {
  if (!arma || arma.semDano) return [];
  const { attributes = {}, combat = {}, aptitudes = [], quantidade = null, duasMaos = false, alcanceCC = 1 } = opts || {};
  const proficiente = isProficient(arma, aptitudes);
  const modos = [];

  const avisosBase = [];
  if (!proficiente) avisosBase.push('Sem Usar Arma: −3 de precisão');
  if (arma.nota) avisosBase.push(arma.nota);

  const make = (tipo) => {
    const corpo = tipo === 'cc';
    const avisos = [...avisosBase];
    let danoArma = Number(arma.dano) || 0;
    let bonus = 0;

    // Punho de Ferro: o ataque desarmado ganha dano de arma.
    if (corpo && arma.grupo === 'desarmado' && hasApt(aptitudes, 'Punho de Ferro')) {
      danoArma = ironFistDamage(attributes.forca);
      avisos.push(`Punho de Ferro: +${danoArma} de dano de arma`);
    }

    // Acuidade: CC com Destreza no lugar da Força (desarmado, armas leves e kunai).
    if (corpo && hasApt(aptitudes, 'Acuidade') && (arma.grupo === 'desarmado' || arma.grupo === 'leve' || arma.ataque === 'cc_cd')) {
      const troca = Number(attributes.destreza || 0) - Number(attributes.forca || 0);
      if (troca > 0) {
        bonus += troca;
        avisos.push(`Acuidade: CC com Destreza (+${troca})`);
      }
    }

    // Especialista na categoria da arma: +1.
    if (isSpecialist(arma, aptitudes)) {
      bonus += 1;
      avisos.push('Especialista: +1 de precisão');
    }

    // Arremesso simples: precisa lançar a quantidade da tabela de uma vez (pág. 264).
    if (!corpo && arma.unidades) {
      const qtd = Number(quantidade ?? arma.unidades);
      if (qtd < arma.unidades) {
        danoArma = 0;
        avisos.push(`Lançando menos de ${arma.unidades}: sem dano de arma`);
      }
      if (duasMaos) {
        danoArma *= 2;
        avisos.push(`Duas mãos: ${arma.unidades * 2} lançadas, dano de arma dobrado`);
      }
    }
    if (!corpo) avisos.push('−3 se houver inimigo no seu alcance corpo a corpo');

    const atributo = corpo ? 'forca' : 'destreza';
    const danoBase = arma.danoFixo != null
      ? arma.danoFixo
      : Math.max(0, half(attributes[atributo]) + danoArma);

    // Corpo a corpo: alcance do tamanho (Médio = 1 m, pág. 272); armas longas dobram.
    let alcanceM = corpo ? alcanceCC * (arma.grupo === 'longa' ? 2 : 1) : Number(arma.alcance || 0);
    if (!corpo && arma.alcancePorDes) alcanceM += arma.alcancePorDes * Number(attributes.destreza || 0);

    return {
      tipo,
      rotulo: corpo ? 'Golpear (CC)' : arma.grupo === 'explosivo' ? 'Arremessar (CD)' : 'À distância (CD)',
      precisao: Number(combat[tipo] || 0) - (proficiente ? 0 : 3) + bonus,
      danoBase,
      danoFixo: arma.danoFixo != null,
      formula: arma.danoFixo != null
        ? `dano ${arma.danoFixo} (explosivo)`
        : `${corpo ? 'FOR' : 'DES'} ÷ 2 (${half(attributes[atributo])}) + arma ${danoArma}`,
      alcanceM,
      alcanceBlocos: Math.max(1, Math.floor(alcanceM / METROS_POR_BLOCO)),
      area: arma.area || null,
      critico: arma.critico,
      avisos,
    };
  };

  if (arma.ataque === 'cc' || arma.ataque === 'cc_cd') modos.push(make('cc'));
  if (arma.ataque === 'cd' || arma.ataque === 'cc_cd') modos.push(make('cd'));
  return modos;
}

/**
 * Grau de dano pelo resultado SÓ DOS DADOS (2d8), pág. 258.
 * critico: menor valor que já conta como crítico (15 padrão, 14 na Cimitarra).
 * maxGrau: capangas chegam no máximo ao grau 3.
 */
export function damageGrade(diceSum, { critico = 15, maxGrau = 4 } = {}) {
  const soma = Number(diceSum);
  if (soma <= 3) return { grau: 0, falhaCritica: true, critico: false };
  let grau;
  if (critico && soma >= critico) grau = 4;
  else if (soma >= 12) grau = 3;
  else if (soma >= 9) grau = 2;
  else grau = 1;
  const isCrit = grau === 4;
  return { grau: Math.min(grau, maxGrau), falhaCritica: false, critico: isCrit };
}

/** Dano final = dano base × grau (dano fixo entra depois, sem multiplicar). */
export function finalDamage(danoBase, grau, { danoFixo = false } = {}) {
  if (!grau) return 0;
  return danoFixo ? danoBase : danoBase * grau;
}

/**
 * Defesas (pág. 256):
 *  - Esquiva: reação sem teste; o atacante precisa tirar 9 + ESQ (com a penalidade de armadura).
 *  - Bloquear: teste resistido 2d8 + CC; precisa de algo nas mãos que bloqueie (arma ou manopla).
 *  - Antecipar: teste resistido 2d8 + LM.
 */
/**
 * Defesas. Aptidões que somam sozinhas (pág. 64–65):
 *  - Reflexos: +1 de precisão em Esquiva · Intuição: +1 de precisão em Ler Movimento (Antecipar).
 */
export function defenses({ combat = {}, armor, hasHeavyArmorAptitude = false, weapons = [], aptitudes = [] }) {
  const penalidade = armorPenalty(armor, hasHeavyArmorAptitude);
  const podeBloquear = Boolean(armor?.permiteBloqueio)
    || weapons.some((arma) => arma && arma.grupo !== 'desarmado' && !arma.semDano && arma.grupo !== 'explosivo');
  const reflexos = hasApt(aptitudes, 'Reflexos') ? 1 : 0;
  const intuicao = hasApt(aptitudes, 'Intuição') ? 1 : 0;
  const esq = Number(combat.esq || 0) + penalidade + reflexos;
  return {
    esquiva: { valor: esq, dificuldade: 9 + esq, penalidade, bonus: reflexos },
    bloqueio: { precisao: Number(combat.cc || 0), possivel: podeBloquear },
    antecipar: { precisao: Number(combat.lm || 0) + intuicao, bonus: intuicao },
  };
}

export function armorPenalty(armor, hasHeavyArmorAptitude) {
  if (!armor) return 0;
  return armor.tipo === 'pesada' && !hasHeavyArmorAptitude ? armor.penalidadeSem : armor.penalidade;
}

function normalize(text) {
  return String(text || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

function slug(text) {
  return normalize(text).replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}
