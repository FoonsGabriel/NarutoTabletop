// =====================================================================
// Tamanho das Criaturas — Naruto "Shinobi no Sho", Livro Básico 4.1b, págs. 271–272
//
//  - Deslocamento: soma (ou subtrai) metros; nunca reduz a menos de 1 m.
//  - Alcance CC: o alcance corpo a corpo cresce com o tamanho (armas longas dobram).
//  - Ataque: quem ataca um alvo MAIOR recebe +1 em CC e CD a cada 2 categorias de diferença.
//  - Não é possível Bloquear ataques de inimigos 2 ou mais categorias maiores.
//  - Força e Vigor já vêm somados na ficha das criaturas (Npc.js).
// =====================================================================

export const TAMANHOS = {
  minusculo: { label: 'Minúsculo', ordem: 0, deslocamento: -12, alcanceCC: 1 },
  diminuto: { label: 'Diminuto', ordem: 1, deslocamento: -9, alcanceCC: 1 },
  miudo: { label: 'Miúdo', ordem: 2, deslocamento: -6, alcanceCC: 1 },
  pequeno: { label: 'Pequeno', ordem: 3, deslocamento: -3, alcanceCC: 1 },
  medio: { label: 'Médio', ordem: 4, deslocamento: 0, alcanceCC: 1 },
  grande: { label: 'Grande', ordem: 5, deslocamento: 3, alcanceCC: 2 },
  enorme: { label: 'Enorme', ordem: 6, deslocamento: 6, alcanceCC: 3 },
  imenso: { label: 'Imenso', ordem: 7, deslocamento: 9, alcanceCC: 4 },
  colossal: { label: 'Colossal', ordem: 8, deslocamento: 12, alcanceCC: 5 },
  incrivel: { label: 'Incrível', ordem: 9, deslocamento: 15, alcanceCC: 6 },
};

/** Tamanho da ficha: o Mestre pode fixar em overrides.tamanho; criaturas usam npc.size. */
export function sizeOf(character) {
  const key = character?.overrides?.tamanho || character?.attributes?.tamanho || character?.attributes?.npc?.size || 'medio';
  return TAMANHOS[key] ? key : 'medio';
}

export const sizeInfo = (key) => TAMANHOS[key] || TAMANHOS.medio;

/** Bônus de precisão de quem ataca um alvo maior (+1 a cada 2 categorias). */
export function sizeAttackBonus(attackerKey, targetKey) {
  const diff = sizeInfo(targetKey).ordem - sizeInfo(attackerKey).ordem;
  return diff > 0 ? Math.floor(diff / 2) : 0;
}

/** O alvo pode Bloquear? Não contra inimigos 2 ou mais categorias maiores. */
export function canBlockAttacker(defenderKey, attackerKey) {
  return sizeInfo(attackerKey).ordem - sizeInfo(defenderKey).ordem < 2;
}
