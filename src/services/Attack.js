// =====================================================================
// Ataque — Naruto "Shinobi no Sho", Livro Básico 4.1b
//   Acerto: 2d8 + precisão (págs. 255–256)
//     Esquiva  → o atacante precisa tirar 9 + ESQ do alvo (sem teste do alvo)
//     Bloquear → teste resistido contra 2d8 + CC do alvo
//     Antecipar→ teste resistido contra 2d8 + LM do alvo
//     Empate no resistido: vence a maior precisão; persistindo, rola de novo.
//   Grau de dano pelo resultado SÓ DOS DADOS do atacante (pág. 258):
//     2-3 falha crítica · 4-8 ×1 · 9-11 ×2 · 12-14 ×3 · 15-16 ×4 (crítico)
//   Crítico: o alvo não tem direito à defesa e fica sangrando (−2 Vit por turno, pág. 278).
//   Capangas causam no máximo Grau 3 (pág. 281).
//   Armadura: a absorção funciona como Vitalidade extra e acaba primeiro (pág. 136).
// =====================================================================

import { bonusDefesa, condicoesDe, findCondicao, limitesDoTurno, penalidadeAtaque, penalidadeDefesa } from '../data/Condicoes';
import { rollDice } from './Rolls';
import { attackModes, damageGrade, defenses as computeDefenses, findArmor, resolveWeapon } from '../data/Armas';
import { findAptitude } from '../data/Aptidoes';
import { canBlockAttacker, sizeAttackBonus, sizeInfo, sizeOf } from '../data/Tamanhos';
import { METROS_POR_BLOCO } from '../data/Armas';

// Distribuição do 2d8: soma → quantas das 64 combinações dão essa soma.
const DIST = (() => {
  const counts = {};
  for (let a = 1; a <= 8; a += 1) for (let b = 1; b <= 8; b += 1) counts[a + b] = (counts[a + b] || 0) + 1;
  return Object.entries(counts).map(([sum, n]) => ({ sum: Number(sum), p: n / 64 }));
})();

const COMBAT_KEYS = [['cc', 'forca'], ['cd', 'destreza'], ['esq', 'agilidade'], ['lm', 'percepcao']];

// ---------------------------------------------------------------------
// Perfil de combate de qualquer ficha (jogador, inimigo, criatura, capanga)
// ---------------------------------------------------------------------

/**
 * Dureza de corpo (pág. 274): não acumula — vale a maior (aptidões ou modos ativos);
 * bônus explícitos (Senjutsu: Dureza +1) somam por cima.
 */
function durezaDeCorpo(character, modes, aptIds) {
  const vigor = Number(character?.attributes?.attributes?.vigor ?? character?.attributes?.npc?.atributos?.vigor ?? 0);
  const fontes = [0];
  if (aptIds.includes('resiliencia')) fontes.push(Math.floor(vigor / 4)); // Akimichi (pág. 151)
  if (aptIds.includes('predador_aquatico')) fontes.push(vigor >= 12 ? 3 : vigor >= 8 ? 2 : 1); // Hoshigaki (Hijutsus pág. 8)
  if (aptIds.includes('armadura_ossea')) fontes.push(vigor >= 14 ? 3 : vigor >= 10 ? 2 : 1); // Kaguya (Hijutsus pág. 15)
  modes.forEach((m) => fontes.push(Number(m.durezaCorpo || 0)));
  fontes.push(Number(findArmor(character?.attributes?.equipment?.armor)?.durezaCorpo || 0)); // Armadura Samurai
  return Math.max(...fontes) + modes.reduce((acc, m) => acc + Number(m.durezaBonus || 0), 0);
}

/** Perfil + condições prejudiciais ativas (págs. 275–278). */
export function combatProfile(character) {
  const perfil = perfilBase(character);
  const extras = ataquesDeCla(character, perfil);
  const modes = Array.isArray(character?.active_modes) ? character.active_modes : [];
  const aptIds = [...(character?.attributes?.aptidoes_gratuitas_list || []), ...(character?.attributes?.aptidoes_extra_list || [])].map((a) => a?.id);
  const byakugan = modes.some((m) => m.byakugan);
  const sharingan = modes.some((m) => m.sharingan);
  let defenses = perfil.defenses;
  // Esquiva Perceptiva do Sharingan (pág. 182): a Dif pode usar 9 + LM no lugar da Esquiva.
  if (sharingan && defenses && perfil.combat?.lm != null) {
    const comLM = 9 + Number(perfil.combat.lm || 0);
    if (comLM > defenses.esquiva.dificuldade) defenses = { ...defenses, esquiva: { ...defenses.esquiva, dificuldade: comLM, sharingan: true } };
  }
  // Bônus de dano de modos ativos (Hachimon, Controle de Caloria…) nos golpes corpo a corpo.
  // Bônus de Força dos modos (Jinchuuriki…): dano corporal = Força ÷ 2 (arredondado para cima).
  const forca = Number(character?.attributes?.attributes?.forca ?? character?.attributes?.npc?.atributos?.forca ?? 0);
  const forcaBonus = modes.reduce((acc, m) => acc + Number(m.forcaBonus || 0), 0);
  const danoForca = Math.ceil((forca + forcaBonus) / 2) - Math.ceil(forca / 2);
  const danoBonus = modes.reduce((acc, m) => acc + Number(m.danoBonus || 0), 0) + danoForca;
  // Bônus de precisão de ataque/defesa de modos ativos (Senjutsu…).
  const somaModos = (campo) => modes.reduce((acc, m) => acc + Number(m[campo] || 0), 0);
  const precisaoBonus = somaModos('bonusAtaque');
  const defesaBonus = somaModos('bonusDefesa');
  const attacks = [...(perfil.attacks || []), ...extras]
    .map((a) => (danoBonus && a.modo.tipo === 'cc' && !a.modo.danoFixo && !a.modo.semBonus
      ? { ...a, modo: { ...a.modo, danoBase: a.modo.danoBase + danoBonus, avisos: [...(a.modo.avisos || []), `+${danoBonus} de dano (Força dos modos ativos)`] } }
      : a))
    .map((a) => (precisaoBonus ? { ...a, modo: { ...a.modo, precisao: Number(a.modo.precisao || 0) + precisaoBonus } } : a));
  if (defesaBonus && defenses) {
    defenses = {
      ...defenses,
      esquiva: { ...defenses.esquiva, dificuldade: defenses.esquiva.dificuldade + defesaBonus },
      bloqueio: { ...defenses.bloqueio, precisao: defenses.bloqueio.precisao + defesaBonus },
      antecipar: { ...defenses.antecipar, precisao: defenses.antecipar.precisao + defesaBonus },
    };
  }
  return {
    ...perfil,
    defenses,
    attacks,
    condicoes: condicoesDe(character),
    durezaCorpo: durezaDeCorpo(character, modes, aptIds),
    // Camuflagem própria (Magen: Falsa Posição…): 2 = parcial, 4 = total (pág. 273).
    camuflagem: modes.reduce((max, m) => Math.max(max, Number(m.camuflagem || 0)), 0),
    // Byakugan ativo, ou Nidan Sharingan ativo: não pode ser flanqueado (págs. 158 e 182).
    naoFlanqueia: byakugan || (sharingan && aptIds.includes('nidan_sharingan')),
  };
}

/** Juuken (Hyuuga) e garras do Shikakyu (Inuzuka): ataques corpo a corpo próprios do clã. */
function ataquesDeCla(character, perfil) {
  const data = character?.attributes || {};
  const powers = Array.isArray(data.powers_list) ? data.powers_list : [];
  const modes = Array.isArray(character?.active_modes) ? character.active_modes : [];
  const attrs = data.attributes || {};
  const cc = Number(perfil.combat?.cc || 0);
  const alcance = Math.max(1, Math.floor(sizeInfo(sizeOf(character)).alcanceCC / METROS_POR_BLOCO));
  const armaPorNivel = (n) => (n >= 6 ? 4 : n >= 5 ? 3 : n >= 4 ? 2 : 1); // págs. 159 e 165
  const lista = [];
  const juuken = powers.find((p) => p.id === 'juuken');
  if (juuken) {
    const ativo = modes.some((m) => m.byakugan);
    lista.push({ key: 'juuken', nome: 'Juuken (Punho Gentil)', arma: { nome: 'Juuken' }, modo: {
      tipo: 'cc', rotulo: 'Golpear (CC)', precisao: cc, critico: 15, alcanceBlocos: alcance,
      danoBase: Math.ceil(Number(attrs.destreza || 0) / 2) + armaPorNivel(Number(juuken.level || 1)),
      avisos: ativo ? [] : ['O Juuken precisa do Byakugan ativo (Jutsus › Ativar Byakugan).'],
    } });
  }
  const shikakyu = powers.find((p) => p.id === 'shikakyu');
  if (shikakyu && modes.some((m) => /^Shikakyu/.test(m.name || ''))) {
    lista.push({ key: 'shikakyu', nome: 'Garras e mordida (Shikakyu)', arma: { nome: 'Garras' }, modo: {
      tipo: 'cc', rotulo: 'Golpear (CC)', precisao: cc, critico: 15, alcanceBlocos: alcance,
      danoBase: Math.ceil(Number(attrs.forca || 0) / 2) + armaPorNivel(Number(shikakyu.level || 1)), avisos: [],
    } });
  }
  // Kyoudo Kyouka (pág. 80): golpe com o chakra concentrado; substitui Força e dano de arma.
  if (modes.some((m) => m.kyoudo)) {
    const apts = [...(data.aptidoes_gratuitas_list || []), ...(data.aptidoes_extra_list || [])].map((a) => a?.id);
    const nivel2 = apts.filter((id) => id === 'kyoudo_kyouka').length >= 2;
    const esp = Number(attrs.espirito || 0);
    const iryou = Number(powers.find((p) => p.id === 'iryou_ninjutsu')?.level || 0);
    const desarmado = (perfil.attacks || []).find((a) => a.key === 'desarmado' || a.arma?.grupo === 'desarmado');
    lista.push({ key: 'kyoudo', nome: 'Kyoudo Kyouka', arma: { nome: 'Kyoudo Kyouka', grupo: 'desarmado' }, modo: {
      tipo: 'cc', rotulo: 'Golpear (CC)', precisao: cc, critico: desarmado?.modo.critico ?? 16, alcanceBlocos: alcance,
      danoBase: (nivel2 ? esp : Math.ceil(esp / 2)) + iryou, semBonus: true, semBloqueio: true, consomeModo: 'kyoudo',
      avisos: [`Não dá para Bloquear. O alvo testa Acrobacia (Dif ${9 + esp}) ou fica caído. O chakra é liberado mesmo se errar.`],
    } });
  }
  return lista;
}

function perfilBase(character) {
  const data = character?.attributes || {};
  const npc = data.npc || null;
  const attrs = data.attributes || {};
  const isCapanga = npc?.type === 'capanga';
  const size = sizeOf(character);
  const alcanceCC = sizeInfo(size).alcanceCC;
  const reachBlocks = Math.max(1, Math.floor(alcanceCC / METROS_POR_BLOCO));

  // Capanga: precisão única de ataque e de defesa (3 + NC).
  if (isCapanga) {
    const atk = Number(npc.precisao_ataque || 0);
    const def = Number(npc.precisao_defesa || 0);
    return {
      character,
      size,
      isCapanga,
      maxGrau: 3,
      attributes: attrs,
      combat: { cc: atk, cd: atk, esq: def, lm: def },
      defenses: { esquiva: { dificuldade: 9 + def, penalidade: 0 }, bloqueio: { precisao: def, possivel: true }, antecipar: { precisao: def } },
      attacks: [
        { key: 'capanga-cc', nome: 'Ataque', arma: { nome: 'Ataque' }, modo: { tipo: 'cc', rotulo: 'Golpear (CC)', precisao: atk, danoBase: Number(npc.dano || 0), critico: 15, alcanceBlocos: reachBlocks, avisos: [] } },
        { key: 'capanga-cd', nome: 'Arremesso', arma: { nome: 'Arremesso' }, modo: { tipo: 'cd', rotulo: 'À distância (CD)', precisao: atk, danoBase: Number(npc.dano || 0), critico: 15, alcanceBlocos: 7, avisos: [] } },
      ],
    };
  }

  const base = data.combat_base || { cc: 3, cd: 3, esq: 3, lm: 3 };
  const combat = Object.fromEntries(COMBAT_KEYS.map(([key, attr]) => [key, Number(attrs[attr] || 0) + Number(base[key] ?? 3)]));

  const aptitudes = [...(data.aptidoes_gratuitas_list || []), ...(data.aptidoes_extra_list || [])]
    .filter((item) => item?.id)
    .map((item) => ({ nome: findAptitude(item.id)?.nome, complemento: item.complemento }));
  const equipment = data.equipment || { weapons: [], armor: 'nenhuma' };
  const armor = findArmor(equipment.armor);
  const weaponEntries = [
    { uid: 'desarmado', item: { uid: 'desarmado', id: 'ataque-desarmado' } },
    ...(equipment.weapons || []).map((item) => ({ uid: item.uid, item })),
  ].map((entry) => ({ ...entry, arma: resolveWeapon(entry.item) })).filter((entry) => entry.arma);

  // Criaturas: o dano do livro (Força − 3, mín. 3) substitui o golpe desarmado.
  if (npc?.type === 'criatura' && npc.dano) {
    return {
      character,
      size,
      isCapanga: false,
      maxGrau: 4,
      attributes: attrs,
      combat,
      defenses: computeDefenses({ combat, armor, weapons: [] }),
      attacks: [{ key: 'criatura', nome: 'Ataque natural', arma: { nome: 'Ataque natural' }, modo: { tipo: 'cc', rotulo: 'Golpear (CC)', precisao: combat.cc, danoBase: Math.max(0, Number(npc.dano) + Number(npc.dano_bonus || 0)), critico: 15, alcanceBlocos: reachBlocks, avisos: [] } }],
    };
  }

  const hasHeavy = armor.exigeApt ? aptitudes.some((apt) => apt.nome === armor.exigeApt) : aptitudes.some((apt) => apt.nome === 'Usar Armaduras Pesadas' || apt.nome === 'Armadura Samurai');
  const danoBonus = Number(npc?.dano_bonus || 0); // ajuste do Mestre no Bestiário
  const ctx = { attributes: attrs, combat, aptitudes, alcanceCC };
  const attacks = weaponEntries.flatMap(({ uid, item, arma }) =>
    attackModes(arma, { ...ctx, quantidade: item.quantidade, duasMaos: item.duasMaos })
      .map((modo) => ({ key: `${uid}-${modo.tipo}`, nome: arma.nome, arma, modo: danoBonus && !modo.danoFixo ? { ...modo, danoBase: Math.max(0, modo.danoBase + danoBonus) } : modo })));

  return {
    character,
    size,
    isCapanga: false,
    maxGrau: 4,
    attributes: attrs,
    combat,
    armor,
    defenses: computeDefenses({ combat, armor, hasHeavyArmorAptitude: hasHeavy, weapons: weaponEntries.map((e) => e.arma), aptitudes }),
    attacks,
  };
}

// ---------------------------------------------------------------------
// Situação do ataque: tamanho e flanquear
// ---------------------------------------------------------------------

/**
 * Ajusta o ataque e a defesa do alvo pela situação (pág. 263 e 272):
 *  - alvo maior: +1 de precisão a cada 2 categorias de diferença;
 *  - alvo flanqueado (corpo a corpo, aliado do lado oposto): −1 na precisão de defesa;
 *  - não dá para Bloquear inimigos 2 ou mais categorias maiores.
 * Retorna { modo, target, notes } já ajustados para forecast/resolveAttack.
 */
export function applySituation(attacker, modo, target, { flanked = false, bonusAtaque = 0, desprevenido = false, autoCritico = false } = {}) {
  const notes = [];
  const sizeBonus = modo.tipo === 'cc' || modo.tipo === 'cd' ? sizeAttackBonus(attacker.size, target.size) : 0;
  if (sizeBonus) notes.push(`Alvo ${sizeInfo(target.size).label}: +${sizeBonus} de precisão`);
  const flank = flanked && modo.tipo === 'cc' && !target.naoFlanqueia ? 1 : 0;
  if (flank) notes.push('Alvo flanqueado: −1 na defesa dele');
  if (flanked && modo.tipo === 'cc' && target.naoFlanqueia) notes.push('Alvo com Byakugan/Sharingan: não pode ser flanqueado');

  // Condições prejudiciais (págs. 275–278): no máximo −3 num mesmo teste.
  const atkConds = attacker.condicoes || [];
  // Ataque furtivo (pág. 261): o alvo é considerado desprevenido.
  const defConds = desprevenido ? [...(target.condicoes || []), findCondicao('desprevenido')] : (target.condicoes || []);
  const area = modo.area || modo.ataque === 'area';
  const atkPen = penalidadeAtaque(atkConds, modo.tipo);
  if (atkPen) notes.push(`Condições de quem ataca (${atkConds.map((c) => c.nome).join(', ')}): ${atkPen} de precisão`);
  let defMod = penalidadeDefesa(defConds, { tipo: modo.tipo, area }) - flank;
  if (defMod < -3 && !defConds.some((c) => c.regras?.caido && modo.tipo === 'cd' && !area)) defMod = -3;
  const condDef = defMod + flank; // só a parte das condições
  if (condDef) notes.push(`Condições do alvo (${defConds.map((c) => c.nome).join(', ')}): ${condDef > 0 ? '+' : ''}${condDef} na defesa`);
  const penalty = -defMod; // positivo = defesa pior
  const limitesAlvo = limitesDoTurno(defConds);
  // Posturas: Lutar na Defensiva (+2/+3 Esquiva) e Defesa Total (+3 Esquiva e Antecipar).
  // Desprevenido perde os bônus de Esquiva (pág. 277).
  const semBonusEsquiva = defConds.some((c) => c.regras?.desprevenido);
  const bonusEsq = semBonusEsquiva ? 0 : bonusDefesa(defConds, 'esquiva');
  const bonusAnt = bonusDefesa(defConds, 'antecipar');
  if (bonusEsq || bonusAnt) notes.push(`Alvo em postura defensiva: ${bonusEsq ? `+${bonusEsq} Esquiva` : ''}${bonusEsq && bonusAnt ? ', ' : ''}${bonusAnt ? `+${bonusAnt} Antecipar` : ''}`);
  if (bonusAtaque) notes.push(`Manobra: ${bonusAtaque > 0 ? '+' : ''}${bonusAtaque} no ataque`);
  if (autoCritico) notes.push('Golpe de misericórdia: crítico automático');
  const limitesAtacante = limitesDoTurno(atkConds);
  if (limitesAlvo.autoSucesso) notes.push(`Alvo ${limitesAlvo.motivo || 'indefeso'}: o ataque acerta sozinho (só falha crítica erra)`);
  if (target.camuflagem) notes.push(`Alvo com camuflagem ${target.camuflagem >= 4 ? 'total' : 'parcial'}: o ataque erra se tirar ${target.camuflagem} ou menos em 1d8`);
  if (limitesAtacante.falhaAtaque) notes.push(`Quem ataca não enxerga: erra se tirar ${limitesAtacante.falhaAtaque} ou menos em 1d8`);

  const blockAllowed = canBlockAttacker(target.size, attacker.size);
  if (!blockAllowed) notes.push(`Atacante ${sizeInfo(attacker.size).label}: o alvo não pode Bloquear`);

  const d = target.defenses;
  return {
    modo: { ...modo, precisao: Number(modo.precisao || 0) + sizeBonus + atkPen + Number(bonusAtaque || 0), falhaCamuflagem: Math.max(limitesAtacante.falhaAtaque || 0, Number(target.camuflagem || 0)), autoCritico },
    target: {
      ...target,
      autoSucesso: limitesAlvo.autoSucesso,
      defenses: {
        esquiva: { ...d.esquiva, dificuldade: d.esquiva.dificuldade - penalty + bonusEsq },
        bloqueio: { ...d.bloqueio, precisao: d.bloqueio.precisao - penalty, possivel: d.bloqueio.possivel && blockAllowed },
        antecipar: { ...d.antecipar, precisao: d.antecipar.precisao - penalty + bonusAnt },
      },
    },
    notes,
  };
}

// ---------------------------------------------------------------------
// Previsão (chance de acertar, crítico, grau e dano)
// ---------------------------------------------------------------------

/**
 * defense: 'esquiva' | 'bloqueio' | 'antecipar'
 * Retorna probabilidades exatas pelas 64 combinações do 2d8.
 */
export function forecast({ modo, maxGrau = 4, target, defense = 'esquiva' }) {
  const prec = Number(modo.precisao || 0);
  const crit = Number(modo.critico || 15);
  const def = target.defenses;
  const defPrec = defense === 'bloqueio' ? def.bloqueio.precisao : def.antecipar.precisao;

  // Chance de vencer o teste resistido com o atacante tirando `a` nos dados.
  const winResisted = (a) => {
    let win = 0;
    let tie = 0;
    DIST.forEach(({ sum: d, p }) => {
      const at = a + prec;
      const dt = d + defPrec;
      if (at > dt || (at === dt && prec > defPrec)) win += p;
      else if (at === dt && prec === defPrec) tie += p;
    });
    return win + tie * 0.5; // empate total: rola de novo (≈ metade para cada um)
  };

  let hit = 0;
  let critChance = 0;
  const grades = { 1: 0, 2: 0, 3: 0, 4: 0 };
  if (modo.autoCritico) {
    const g = damageGrade(16, { critico: crit, maxGrau });
    grades[g.grau] = 1;
    const danoBase = Number(modo.danoBase || 0);
    const damageOf = (grau) => (modo.danoFixo ? danoBase : danoBase * grau);
    return { hit: 1, crit: 1, fumble: 0, grades, damageOf, expected: damageOf(g.grau), likelyGrade: g.grau, likelyDamage: damageOf(g.grau) };
  }
  DIST.forEach(({ sum: a, p }) => {
    if (a <= 3) return; // falha crítica
    const g = damageGrade(a, { critico: crit, maxGrau });
    let pHit;
    if (g.critico) {
      pHit = 1; // crítico: sem defesa
      critChance += p;
    } else if (target.autoSucesso) {
      pHit = 1; // alvo indefeso
    } else if (defense === 'esquiva') {
      pHit = a + prec >= def.esquiva.dificuldade ? 1 : 0;
    } else {
      pHit = winResisted(a);
    }
    if (!g.critico && modo.falhaCamuflagem) pHit *= 1 - Number(modo.falhaCamuflagem) / 8; // não enxerga o alvo
    hit += p * pHit;
    grades[g.grau] += p * pHit;
  });

  const danoBase = Number(modo.danoBase || 0);
  const damageOf = (grau) => (modo.danoFixo ? danoBase : danoBase * grau);
  const expected = Object.entries(grades).reduce((sum, [g, p]) => sum + p * damageOf(Number(g)), 0);
  const likelyGrade = Number(Object.entries(grades).sort((x, y) => y[1] - x[1])[0]?.[0] || 1);

  return {
    hit,
    crit: critChance,
    fumble: 1 / 64 + 2 / 64, // 2 ou 3 nos dados
    grades,
    damageOf,
    expected,
    likelyGrade,
    likelyDamage: damageOf(likelyGrade),
  };
}

// ---------------------------------------------------------------------
// Resolução (rola os dados de verdade)
// ---------------------------------------------------------------------

/**
 * presetDice: dados do ataque já rolados (ataque em área: 1 teste para todos os alvos, pág. 89).
 */
export function resolveAttack({ modo, maxGrau = 4, target, defense = 'esquiva', presetDice = null }) {
  const prec = Number(modo.precisao || 0);
  const crit = Number(modo.critico || 15);
  const def = target.defenses;
  const defPrec = defense === 'bloqueio' ? def.bloqueio.precisao : def.antecipar.precisao;

  let attackDice = presetDice ? [...presetDice] : rollDice(2, 8);
  const defenseRolls = [];
  let sum = attackDice[0] + attackDice[1];
  let g = damageGrade(sum, { critico: crit, maxGrau });
  // Golpe de misericórdia (pág. 263): acerto crítico automático.
  if (modo.autoCritico) g = damageGrade(16, { critico: crit, maxGrau });

  let hit;
  let reason;
  if (g.falhaCritica) {
    hit = false;
    reason = 'Falha crítica!';
  } else if (g.critico) {
    hit = true;
    reason = 'Acerto crítico! O alvo não pode se defender.';
  } else if (target.autoSucesso) {
    hit = true;
    reason = 'Alvo indefeso: o ataque acerta sozinho.';
  } else if (defense === 'esquiva') {
    hit = sum + prec >= def.esquiva.dificuldade;
    reason = hit ? `Acertou: ${sum + prec} ≥ Dif ${def.esquiva.dificuldade} da Esquiva.` : `Esquivou: ${sum + prec} < Dif ${def.esquiva.dificuldade}.`;
  } else {
    // Teste resistido; empate total rola de novo (o grau vem do último rolamento, pág. 258).
    for (let i = 0; i < 6; i += 1) {
      const defenseDice = rollDice(2, 8);
      const at = sum + prec;
      const dt = defenseDice[0] + defenseDice[1] + defPrec;
      defenseRolls.push({ dice: defenseDice, total: dt });
      if (at !== dt || prec !== defPrec) {
        hit = at > dt || (at === dt && prec > defPrec);
        const nome = defense === 'bloqueio' ? 'Bloqueio' : 'Antecipar';
        reason = hit ? `Acertou: ${at} contra ${dt} (${nome}).` : `${defense === 'bloqueio' ? 'Bloqueou' : 'Antecipou'}: ${dt} contra ${at}.`;
        break;
      }
      attackDice = rollDice(2, 8);
      sum = attackDice[0] + attackDice[1];
      g = damageGrade(sum, { critico: crit, maxGrau });
    }
  }

  // Não enxerga o alvo (camuflagem, pág. 273): depois de acertar, 1d8; crítico não erra.
  let camuflagem = null;
  if (hit && !g.critico && modo.falhaCamuflagem) {
    camuflagem = rollDice(1, 8)[0];
    if (camuflagem <= Number(modo.falhaCamuflagem)) {
      hit = false;
      reason = `Errou por não enxergar (tirou ${camuflagem} no d8).`;
    }
  }

  // Dureza de corpo (pág. 274): tira do dano base antes do grau; contra dano fixo vale o dobro.
  const durezaCorpo = Number(target?.durezaCorpo || 0);
  const danoBase = Math.max(0, Number(modo.danoBase || 0) - (modo.danoFixo ? 2 : 1) * durezaCorpo);
  const dano = hit ? (modo.danoFixo ? danoBase : danoBase * g.grau) : 0;
  if (hit && durezaCorpo) reason += ` Dureza de corpo ${durezaCorpo} do alvo.`;
  return {
    camuflagem,
    attackDice,
    attackTotal: sum + prec,
    defenseRolls,
    defenseTotal: defense === 'esquiva' ? def.esquiva.dificuldade : defenseRolls[defenseRolls.length - 1]?.total ?? null,
    hit: Boolean(hit),
    critico: Boolean(hit && g.critico),
    falhaCritica: g.falhaCritica,
    grau: hit ? g.grau : 0,
    dano,
    reason,
  };
}

// ---------------------------------------------------------------------
// Aplicar dano (absorção da armadura primeiro)
// ---------------------------------------------------------------------

/** Retorna os campos a gravar em characters (hp_current, attributes, active_modes). */
export function damageUpdate(character, dano, { critico = false } = {}) {
  const data = character.attributes || {};
  const equipment = data.equipment || null;
  const armor = equipment ? findArmor(equipment.armor) : null;
  let rest = Math.max(0, Math.round(Number(dano) || 0));
  let absorbed = 0;
  let attributes = data;

  if (armor?.absorcao > 0) {
    const current = Number(equipment.absorcao_atual ?? armor.absorcao);
    absorbed = Math.min(current, rest);
    rest -= absorbed;
    attributes = { ...data, equipment: { ...equipment, absorcao_atual: current - absorbed } };
  }

  const hpBefore = Number(character.hp_current ?? character.hp_max ?? 0);
  const hpAfter = hpBefore - rest; // pode ficar negativo (regra de ferimentos, pág. 258)
  const modes = Array.isArray(character.active_modes) ? [...character.active_modes] : [];
  if (critico && dano > 0) {
    modes.push({ id: newId(), name: 'Sangrando (crítico)', turns: null, drain: { chakra: 0, hp: 2 } });
  }
  // Morrendo (−11 a −20, pág. 259): inconsciente e sangrando, −2 Vit por turno até ser estabilizado.
  if (hpAfter <= -11 && hpAfter > -21 && !modes.some((m) => /^morrendo/i.test(m.name || ''))) {
    modes.push({ id: newId(), name: 'Morrendo (sangrando, até estabilizar)', turns: null, drain: { chakra: 0, hp: 2 } });
  }

  return {
    patch: { hp_current: hpAfter, attributes, active_modes: modes },
    absorbed,
    hpBefore,
    hpAfter,
  };
}

/** Estado da Vitalidade (pág. 258). */
export function vitalityState(hp) {
  if (hp <= -21) return 'morto';
  if (hp <= -11) return 'morrendo (sangrando, −2 Vit por turno)';
  if (hp <= -1) return 'inconsciente';
  if (hp === 0) return 'fora de combate (indefeso)';
  return null;
}

function newId() {
  return typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `m-${Date.now()}-${Math.random()}`;
}

/**
 * Míssil (pág. 101): depois de acertar, rola o ataque de novo `vezes` vezes
 * (o alvo não refaz a defesa). Cada novo acerto: +1 de dano base.
 */
export function extraHits({ modo, defense, defenseTotal, vezes }) {
  const prec = Number(modo.precisao || 0);
  const rolls = [];
  for (let i = 0; i < vezes; i += 1) {
    const dice = rollDice(2, 8);
    const total = dice[0] + dice[1] + prec;
    const hit = defense === 'esquiva' ? total >= defenseTotal : total > defenseTotal;
    rolls.push({ dice, total, hit });
  }
  return rolls;
}
