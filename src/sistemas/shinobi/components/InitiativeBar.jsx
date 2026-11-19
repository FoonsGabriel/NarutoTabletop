import { useEffect, useState } from 'react';
import { sortCombatants } from '../services/Combat';

/**
 * Barra de iniciativa no topo do mapa (durante o combate).
 * Retratos na ordem dos turnos, destaque em quem joga agora; tocar centraliza no token.
 * Leve: só redesenha quando a lista, o turno ou a Vitalidade de alguém mudam.
 */
export default function InitiativeBar({ combatants, combatState, engineRef }) {
  const [, setTick] = useState(0);

  // Vitalidade mudou (dano/cura): atualiza as barrinhas, no máximo uma vez por quadro.
  useEffect(() => {
    let frame = 0;
    const bump = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => { frame = 0; setTick((n) => n + 1); });
    };
    window.addEventListener('vtt:character', bump);
    return () => { window.removeEventListener('vtt:character', bump); cancelAnimationFrame(frame); };
  }, []);

  if (!combatState?.active || !combatants?.length) return null;

  const engine = engineRef.current;
  const ordered = sortCombatants(combatants);
  const currentIndex = ordered.findIndex((c) => c.id === combatState.turn);

  const focus = (combatant) => {
    const token = engine?.tokens[combatant.token_id];
    if (token) engine.centerOn(token.container.x, token.container.y);
  };

  return (
    <div className="pointer-events-none absolute inset-x-0 top-2 z-20 flex justify-center px-14 md:pl-[calc(var(--vtt-left,0px)+3.5rem)] md:pr-[calc(var(--vtt-right,0px)+0.5rem)]">
      <div className="pointer-events-auto flex max-w-full items-center gap-1.5 overflow-x-auto rounded-full border border-zinc-700 bg-zinc-950/85 px-2 py-1 shadow-xl backdrop-blur">
        <span className="titulo-shinobi shrink-0 pr-1 text-sm text-red-400">R{combatState.round || 1}</span>
        {ordered.map((combatant, index) => {
          const character = engine?.characters[combatant.character_id];
          const token = engine?.tokens[combatant.token_id];
          // Imagem + reserva por baixo (se a principal não carregar, aparece a reserva).
          const urls = [token?.sprite?.url || character?.attributes?.figure?.url, token?.sprite?.fallback, token?.data?.image_url].filter(Boolean);
          const url = urls[0] || '';
          const hpMax = Number(character?.hp_max || 0);
          const hp = Number(character?.hp_current ?? hpMax);
          const pct = hpMax ? Math.max(0, Math.min(1, hp / hpMax)) : 1;
          const isNow = index === currentIndex;
          const done = currentIndex >= 0 && index < currentIndex;
          const down = hpMax > 0 && hp <= 0;
          const name = character?.name || combatant.name || '?';
          return (
            <button
              key={combatant.id}
              type="button"
              onClick={() => focus(combatant)}
              title={`${name} · iniciativa ${combatant.initiative}${hpMax ? ` · VIT ${hp}/${hpMax}` : ''}`}
              className={`relative shrink-0 rounded-full transition-transform ${isNow ? 'scale-110' : ''} ${done || down ? 'opacity-45' : ''}`}
            >
              <span
                className={`block h-9 w-9 overflow-hidden rounded-full border-2 bg-zinc-800 bg-cover bg-top md:h-10 md:w-10 ${isNow ? 'border-red-500 shadow-[0_0_10px_rgba(236,106,15,0.8)]' : character?.is_npc ? 'border-zinc-600' : 'border-sky-700'}`}
                style={url ? { backgroundImage: urls.map((u) => `url("${u}")`).join(', '), backgroundSize: '220%', backgroundPosition: '50% 8%' } : undefined}
              >
                {!url && <span className="flex h-full items-center justify-center text-xs font-black text-zinc-300">{name.slice(0, 2).toUpperCase()}</span>}
              </span>
              {hpMax > 0 && (
                <span className="absolute inset-x-1 -bottom-0.5 h-1 overflow-hidden rounded-full bg-black/80">
                  <span className={`block h-full ${pct > 0.5 ? 'bg-emerald-500' : pct > 0.25 ? 'bg-amber-500' : 'bg-red-600'}`} style={{ width: `${pct * 100}%` }} />
                </span>
              )}
              {down && <span className="absolute inset-0 flex items-center justify-center text-base">💀</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
