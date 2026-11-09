import { useMemo, useState } from 'react';

const ROLLS_PER_PLAYER = 15;

/**
 * Histórico de rolagens agrupado por jogador.
 * - Jogador vê só rolagens públicas.
 * - Mestre vê tudo; as secretas aparecem com 🔒 e um botão "Revelar".
 */
export default function DiceHistory({ rolls, isGM, onReveal }) {
  const [expandedPlayer, setExpandedPlayer] = useState(null);

  // Agrupa por jogador; o grupo de quem rolou por último vem primeiro.
  const groups = useMemo(() => {
    const visible = rolls.filter((roll) => isGM || !roll.is_secret);
    const byPlayer = new Map();

    visible.forEach((roll) => {
      const key = roll.player_id || roll.player_name;
      if (!byPlayer.has(key)) byPlayer.set(key, { key, name: roll.player_name, rolls: [] });
      byPlayer.get(key).rolls.push(roll);
    });

    return [...byPlayer.values()]
      .map((group) => ({
        ...group,
        // Numeração na ordem em que rolou (#1 = primeira), exibida da mais nova para a mais antiga.
        rolls: group.rolls
          .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
          .map((roll, index) => ({ ...roll, order: index + 1 }))
          .reverse(),
      }))
      .sort((a, b) => new Date(b.rolls[0].created_at) - new Date(a.rolls[0].created_at));
  }, [rolls, isGM]);

  if (!groups.length) {
    return <p className="rounded border border-dashed border-zinc-800 p-4 text-center text-xs text-zinc-500">Nenhuma rolagem ainda.</p>;
  }

  return (
    <div className="space-y-3">
      {groups.map((group) => {
        const showAll = expandedPlayer === group.key;
        const list = showAll ? group.rolls : group.rolls.slice(0, ROLLS_PER_PLAYER);
        const last = group.rolls[0];

        return (
          <section key={group.key} className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950">
            <header className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900 px-3 py-2">
              <span className="truncate text-sm font-black text-red-400">{group.name}</span>
              <span className="shrink-0 text-[11px] text-zinc-500">
                último: <b className="text-base tabular-nums text-white">{last.total}</b>
              </span>
            </header>

            <ul className="divide-y divide-zinc-900">
              {list.map((roll) => <RollRow key={roll.id} roll={roll} isGM={isGM} onReveal={onReveal} />)}
            </ul>

            {group.rolls.length > ROLLS_PER_PLAYER && (
              <button
                type="button"
                onClick={() => setExpandedPlayer(showAll ? null : group.key)}
                className="w-full border-t border-zinc-900 py-1.5 text-[11px] font-bold text-zinc-500 hover:text-white"
              >
                {showAll ? 'Mostrar menos' : `Ver todas (${group.rolls.length})`}
              </button>
            )}
          </section>
        );
      })}
    </div>
  );
}

function RollRow({ roll, isGM, onReveal }) {
  const dice = Array.isArray(roll.rolls) ? roll.rolls : [];
  const time = roll.created_at
    ? new Date(roll.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : '';

  return (
    <li className={`px-3 py-2 ${roll.is_secret ? 'bg-amber-950/20' : ''}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-xs font-bold text-zinc-200">
            <span className="mr-1 text-zinc-600">#{roll.order}</span>
            {roll.is_secret && <span title="Rolagem secreta">🔒 </span>}
            {roll.label || 'Rolagem'}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-1">
            {dice.map((value, index) => (
              <span
                key={index}
                className={`flex h-6 min-w-6 items-center justify-center rounded px-1 text-xs font-black tabular-nums ${
                  value === roll.sides
                    ? 'bg-amber-600 text-amber-50'
                    : value === 1
                      ? 'bg-zinc-800 text-zinc-500'
                      : 'bg-red-900 text-white'
                }`}
                title={`d${roll.sides}`}
              >
                {value}
              </span>
            ))}
            {Number(roll.modifier) !== 0 && (
              <span className="text-xs font-bold text-zinc-400">
                {roll.modifier > 0 ? `+${roll.modifier}` : `−${Math.abs(roll.modifier)}`}
              </span>
            )}
            <span className="text-[10px] text-zinc-600">d{roll.sides} · {time}</span>
          </div>
        </div>

        <span className="shrink-0 text-2xl font-black tabular-nums text-white">{roll.total}</span>
      </div>

      {isGM && roll.is_secret && (
        <button
          type="button"
          onClick={() => onReveal(roll.id)}
          className="mt-1 rounded border border-amber-800 px-2 py-0.5 text-[10px] font-bold text-amber-300 hover:border-amber-500"
        >
          👁 Revelar para os jogadores
        </button>
      )}
    </li>
  );
}