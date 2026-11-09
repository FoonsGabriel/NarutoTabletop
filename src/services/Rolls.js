// Serviço de rolagens: sorteia os dados e monta o registro da tabela room_rolls.

/** Sorteia `count` dados de `sides` lados. Ex.: rollDice(2, 8) → [5, 3] */
export function rollDice(count, sides) {
  const safeCount = Math.max(1, Math.min(Number(count) || 1, 50));
  const safeSides = Math.max(2, Number(sides) || 8);
  return Array.from({ length: safeCount }, () => Math.floor(Math.random() * safeSides) + 1);
}

/** Texto da fórmula. Ex.: "2d8 + 4" */
export function formatFormula(count, sides, modifier = 0) {
  const mod = Number(modifier) || 0;
  if (!mod) return `${count}d${sides}`;
  return `${count}d${sides} ${mod > 0 ? '+' : '−'} ${Math.abs(mod)}`;
}

/** Monta a linha que vai para o banco (room_rolls). */
export function buildRollRow({ roomId, playerId, playerName, label, sides, dice, modifier = 0, isSecret = false }) {
  const mod = Number(modifier) || 0;
  const total = dice.reduce((sum, value) => sum + value, 0) + mod;

  return {
    room_id: roomId,
    player_id: playerId || null,
    player_name: playerName || 'Jogador',
    label: label || null,
    formula: formatFormula(dice.length, sides, mod),
    sides: Number(sides),
    rolls: dice,
    modifier: mod,
    total,
    is_secret: Boolean(isSecret),
  };
}