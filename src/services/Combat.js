// Regras de combate compartilhadas (fila de turnos, iniciativa e modos ativos).
import { supabase } from './supabase/client';
import { trackedUpdate } from './Undo';
import { condicoesDe, penalidadeIniciativa } from '../data/Condicoes';

/** Ordem da fila: iniciativa ↓, bônus ↓ (maior precisão), desempate ↓ (pág. 253). */
export function sortCombatants(list) {
  return [...list].sort(
    (a, b) =>
      b.initiative - a.initiative ||
      (b.init_bonus ?? 0) - (a.init_bonus ?? 0) ||
      (b.tiebreak ?? 0) - (a.tiebreak ?? 0)
  );
}

/** Bônus de iniciativa a partir da ficha salva: Agilidade + Prontidão (pág. 253). */
export function initiativeBonus(character) {
  const sheet = character?.attributes || {};
  // NPCs gerados pelo painel do Mestre guardam o bônus pronto (editável).
  if (sheet.npc && sheet.npc.iniciativa != null) return (Number(sheet.npc.iniciativa) || 0) + penalidadeIniciativa(condicoesDe(character));
  // Diligente (pág. 63): +3 nos testes de Iniciativa.
  const aptIds = [...(sheet.aptidoes_gratuitas_list || []), ...(sheet.aptidoes_extra_list || [])].map((item) => item?.id);
  const diligente = aptIds.includes('diligente') ? 3 : 0;
  // Surdo e outras condições (pág. 278) pesam na iniciativa.
  const condicao = penalidadeIniciativa(condicoesDe(character));
  return Number(sheet.attributes?.agilidade || 0) + Number(sheet.skill_totals?.prontidao || 0) + diligente + condicao;
}

/** Dado de desempate, rolado em segredo ao entrar no combate. */
export const rollTiebreak = () => Math.floor(Math.random() * 8) + 1;

// ---------------------------------------------------------------------
// Modos e efeitos ativos (characters.active_modes)
//   { id, name, turns, drain: { chakra, hp } }
//   turns = turnos restantes CONTANDO o atual; null = sem limite
// A contagem segue os turnos de quem tem o efeito (pág. 253): o turno em que
// o modo é ativado já conta como o 1º.
// ---------------------------------------------------------------------

export function normalizeModes(value) {
  return Array.isArray(value) ? value : [];
}

/**
 * Início do turno de um personagem: desconta o dreno e a duração dos modos.
 * Retorna as mensagens do que aconteceu (para mostrar ao Mestre).
 */
export async function applyTurnStartEffects(characterId) {
  if (!characterId) return [];

  const { data: character, error } = await supabase
    .from('characters')
    .select('id, name, hp_current, chakra_current, active_modes, attributes')
    .eq('id', characterId)
    .single();

  if (error || !character) return [];

  let modes = normalizeModes(character.active_modes);
  if (!modes.length) return [];

  // Regeneração (Senju/Uzumaki, pág. 193): cura 1 nível de sangramento por turno, sem teste.
  const regenLog = [];
  const sheet = character.attributes || {};
  const aptidoes = [...(sheet.aptidoes_gratuitas_list || []), ...(sheet.aptidoes_extra_list || [])];
  if (aptidoes.some((a) => a?.id === 'regeneracao')) {
    const index = modes.findIndex((m) => /^sangrando/i.test(m.name || ''));
    if (index >= 0) {
      modes = modes.filter((_, i) => i !== index);
      regenLog.push(`${character.name}: Regeneração curou 1 nível de sangramento.`);
    }
  }

  let hp = Number(character.hp_current || 0);
  let chakra = Number(character.chakra_current || 0);
  const remaining = [];
  const log = [...regenLog];

  modes.forEach((mode) => {
    const turnsLeft = mode.turns == null ? null : Number(mode.turns) - 1;

    if (turnsLeft !== null && turnsLeft <= 0) {
      log.push(`${character.name}: ${mode.name} terminou.`);
      return;
    }

    const drainChakra = Number(mode.drain?.chakra || 0);
    const drainHp = Number(mode.drain?.hp || 0);
    chakra -= drainChakra;
    hp -= drainHp;

    const parts = [];
    if (drainChakra) parts.push(`−${drainChakra} Chakra`);
    if (drainHp) parts.push(`−${drainHp} Vitalidade`);
    const duration = turnsLeft === null ? '' : ` (${turnsLeft} turno${turnsLeft > 1 ? 's' : ''} restante${turnsLeft > 1 ? 's' : ''})`;
    if (parts.length || duration) log.push(`${character.name}: ${mode.name} ${parts.join(', ')}${duration}`.trim());

    remaining.push({ ...mode, turns: turnsLeft });
  });

  const { error: updateError } = await trackedUpdate(character.id, {
    // Dano por turno (sangramento etc.) pode passar de zero: ferimentos e morte, pág. 259.
    hp_current: hp,
    chakra_current: Math.max(0, chakra),
    active_modes: remaining,
  }, `${character.name}: início do turno (modos ativos)`);

  if (updateError) {
    console.error('Erro ao aplicar os modos ativos:', updateError);
    return [`Erro ao aplicar os modos de ${character.name}.`];
  }

  if (chakra < 0) log.push(`⚠ ${character.name} ficou sem Chakra para manter os modos.`);
  return log;
}

// ---------------------------------------------------------------------
// Ações por rodada (pág. 255)
//   Por rodada: 1 Padrão + 1 Movimento + 1 Parcial   (ou 1 Completa + 1 Parcial)
//   Livres e Reações: ilimitadas.
//   Troca: ação maior vira menor (Padrão → Movimento/Parcial, Movimento → Parcial).
//
// Guardado em room_combat.actions: { round, log: [{ type, slots: [...] }] }
//   type  = ação que o jogador fez
//   slots = qual ação da rodada foi gasta para isso (vazio = livre ou além do limite)
// ---------------------------------------------------------------------

export const ACTION_TYPES = {
  padrao: { label: 'Padrão', hint: 'Atacar, usar técnica ou poder no inimigo' },
  movimento: { label: 'Movimento', hint: 'Deslocar-se, técnica de suporte em si mesmo' },
  parcial: { label: 'Parcial', hint: 'Técnica defensiva, manter efeito sustentado' },
  completa: { label: 'Completa', hint: 'Grande deslocamento ou técnica elaborada (gasta Padrão + Movimento)' },
  livre: { label: 'Livre', hint: 'Falar, ações rápidas. Ilimitadas, mas não repetir a mesma' },
};

const SLOT_RANK = { parcial: 1, movimento: 2, padrao: 3 };
const SLOTS = ['padrao', 'movimento', 'parcial'];

/** Estado de ações da rodada atual (zera sozinho quando a rodada muda). */
export function actionsForRound(actions, round) {
  if (!actions || actions.round !== round) return { round, log: [] };
  return { round, log: Array.isArray(actions.log) ? actions.log : [] };
}

export function usedSlots(state) {
  return state.log.flatMap((entry) => entry.slots || []);
}

export function freeSlots(state) {
  const used = usedSlots(state);
  return SLOTS.filter((slot) => !used.includes(slot));
}

/**
 * Quais ações da rodada pagam uma ação do tipo `type`.
 * Retorna null se não houver ação disponível (pelas regras do livro).
 */
export function slotsFor(type, state) {
  if (type === 'livre') return [];

  const free = freeSlots(state);

  if (type === 'completa') {
    return free.includes('padrao') && free.includes('movimento') ? ['padrao', 'movimento'] : null;
  }

  // Usa a menor ação que ainda sirva (para não desperdiçar a Padrão à toa).
  const candidates = free
    .filter((slot) => SLOT_RANK[slot] >= SLOT_RANK[type])
    .sort((a, b) => SLOT_RANK[a] - SLOT_RANK[b]);

  return candidates.length ? [candidates[0]] : null;
}

/**
 * Condições que tiram ações (págs. 276–278): atordoado/indefeso perdem todas,
 * tonto perde a de Movimento (ainda pode trocar a Padrão). A perda entra no
 * começo do registro da rodada, como uma ação já gasta.
 */
export function perdaPorCondicao(state, limites) {
  if (!limites || state.log.some((entry) => entry.type === 'condicao')) return state;
  const lost = limites.semAcoes ? SLOTS : limites.semMovimento ? ['movimento'] : [];
  const used = usedSlots(state);
  const slots = lost.filter((slot) => !used.includes(slot));
  if (!slots.length) return state;
  return { ...state, log: [{ type: 'condicao', slots, motivo: limites.motivo }, ...state.log] };
}

/** Registra uma ação. strict = regras do livro (bloqueia sem ação disponível). */
export function useAction(type, state, strict) {
  const slots = slotsFor(type, state);
  if (slots === null && strict) return null;
  return { ...state, log: [...state.log, { type, slots: slots || [] }] };
}

export function undoLastAction(state) {
  return { ...state, log: state.log.slice(0, -1) };
}
