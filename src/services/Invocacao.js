// =====================================================================
// Kuchiyose (Livro Básico págs. 224–229)
//  - A criatura é uma ficha do jogador (owner_id do invocador), ligada ao
//    personagem que tem o contrato: attributes.criatura.invocador.
//  - Uma vez por cena, ação padrão, custo 2 × nível:
//      1 criatura de NC até 2 × nível, ou 2 de NC até 2 × nível − 2.
//  - Quem edita: o Mestre, ou o jogador se o Mestre liberar na ficha do invocador
//    (attributes.kuchiyose_livre).
// =====================================================================
import { buildCreature, CREATURE_SIZES } from './Npc';

/** Nível do poder Kuchiyose na ficha (0 = não tem). */
export function nivelKuchiyose(character) {
  const lista = character?.attributes?.powers_list;
  if (!Array.isArray(lista)) return 0;
  return Number(lista.find((p) => p.id === 'kuchiyose')?.level || 0);
}

export const ehCriatura = (character) => Boolean(character?.attributes?.criatura);

/** Criaturas do contrato deste invocador (lista de fichas da sala). */
export const criaturasDe = (characters, invocadorId) =>
  (characters || []).filter((c) => c?.attributes?.criatura?.invocador === invocadorId);

/** Mestre sempre; jogador dono só se o Mestre liberou. */
export const podeEditarInvocacoes = (invocador, { isGM, playerId }) =>
  Boolean(isGM || (invocador && playerId && invocador.owner_id === playerId && invocador.attributes?.kuchiyose_livre));

/** NC máximo para invocar 1 ou 2 criaturas neste nível. */
export const limitesInvocacao = (nivel) => ({ uma: 2 * nivel, duas: Math.max(1, 2 * nivel - 2) });

/**
 * Monta (ou remonta, ao subir de NC) a linha `characters` da criatura.
 * Mantém a proporção de Vitalidade/Chakra atuais quando é uma edição.
 */
export function montarCriatura({ nome, nc, especie, tamanho, figuraUrl, invocador, anterior = null }) {
  const base = buildCreature({ name: nome, nc, species: especie, size: tamanho });
  const npc = base.attributes.npc;
  const altura = CREATURE_SIZES[npc.size]?.heightCells || 1.8;
  const proporcao = (atual, max) => (anterior && Number(max) > 0 ? Math.max(0, Number(atual ?? max)) / Number(max) : 1);
  const hpRatio = proporcao(anterior?.hp_current, anterior?.hp_max);
  const ckRatio = proporcao(anterior?.chakra_current, anterior?.chakra_max);

  return {
    room_id: invocador.room_id,
    owner_id: invocador.owner_id || null,
    is_npc: false,
    name: base.name,
    rank: base.rank,
    level: base.level,
    hp_max: base.hp_max,
    hp_current: Math.round(base.hp_max * hpRatio),
    chakra_max: base.chakra_max,
    chakra_current: Math.round(base.chakra_max * ckRatio),
    avatar_url: figuraUrl || null,
    attributes: {
      ...base.attributes,
      npc: {
        ...npc,
        template: false,
        ...(figuraUrl ? { figure: { url: figuraUrl, heightCells: altura } } : {}),
      },
      criatura: { invocador: invocador.id, especie: npc.species, tamanho: npc.size, nc: base.level },
    },
  };
}
