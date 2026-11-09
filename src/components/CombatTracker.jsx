import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../services/supabase/client';
import {
  ACTION_TYPES,
  actionsForRound,
  applyTurnStartEffects,
  freeSlots,
  initiativeBonus,
  rollTiebreak,
  slotsFor,
  sortCombatants,
  undoLastAction,
  useAction as registerAction,
} from '../services/Combat';

/**
 * Combate — regras do Livro Básico (págs. 252–254):
 * - Iniciativa = 1d8 + Agilidade + Prontidão, rolada uma vez e usada no combate todo.
 * - Ordem do maior para o menor. Empate: maior precisão primeiro; persistindo, rola-se um dado.
 * - O Mestre rola pelos NPCs (pode rolar uma vez para um grupo de inimigos).
 * - Quem entra no meio da luta rola e age a partir da rodada seguinte.
 */

export default function CombatTracker({ roomId, playerId, isGM = false, onRoll }) {
  const [combatants, setCombatants] = useState([]);
  const [combat, setCombat] = useState({ active: false, round: 0, turn: null, strict: true });
  const [myCharacter, setMyCharacter] = useState(null);
  const [busy, setBusy] = useState(false);
  const [turnLog, setTurnLog] = useState([]); // o que os modos ativos fizeram no último turno (visível ao Mestre)

  // Formulário do Mestre para NPCs/inimigos
  const [npcName, setNpcName] = useState('');
  const [npcBonus, setNpcBonus] = useState(0);

  const ordered = useMemo(() => sortCombatants(combatants), [combatants]);
  const currentIndex = ordered.findIndex((c) => c.id === combat.turn);
  const current = currentIndex >= 0 ? ordered[currentIndex] : null;
  const myEntry = myCharacter ? combatants.find((c) => c.character_id === myCharacter.id) : null;
  const isMyTurn = Boolean(current && myCharacter && current.character_id === myCharacter.id);

  const loadCombatants = useCallback(async () => {
    const { data, error } = await supabase.from('room_combat').select('*').eq('room_id', roomId);
    if (error) console.error('Erro ao carregar combate:', error);
    else setCombatants(data || []);
  }, [roomId]);

  useEffect(() => {
    let active = true;

    supabase
      .from('rooms')
      .select('combat_active, combat_round, combat_turn, combat_strict')
      .eq('id', roomId)
      .single()
      .then(({ data, error }) => {
        if (!active) return;
        if (error) console.error('Erro ao carregar estado do combate:', error);
        else setCombat({ active: data.combat_active, round: data.combat_round, turn: data.combat_turn, strict: data.combat_strict ?? true });
      });

    loadCombatants();

    // Ficha do jogador (para rolar a própria iniciativa).
    if (playerId) {
      supabase
        .from('characters')
        .select('id, name, attributes')
        .eq('room_id', roomId)
        .eq('owner_id', playerId)
        .limit(1)
        .then(({ data }) => {
          if (active) setMyCharacter(data?.[0] ?? null);
        });
    }

    const channel = supabase
      .channel(`combat_${roomId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'room_combat', filter: `room_id=eq.${roomId}` }, () => {
        loadCombatants();
      })
      // Exclusões chegam só com o id (sem room_id), então o filtro por sala as descartaria.
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'room_combat' }, (payload) => {
        setCombatants((list) => list.filter((c) => c.id !== payload.old.id));
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` }, (payload) => {
        const room = payload.new;
        setCombat({ active: room.combat_active, round: room.combat_round, turn: room.combat_turn, strict: room.combat_strict ?? true });
      })
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [roomId, playerId, loadCombatants]);

  const updateRoomCombat = async (patch) => {
    const { error } = await supabase.from('rooms').update(patch).eq('id', roomId);
    if (error) {
      alert('Erro ao atualizar o combate: ' + error.message);
      return false;
    }
    setCombat((currentState) => ({
      active: patch.combat_active ?? currentState.active,
      strict: patch.combat_strict ?? currentState.strict,
      round: patch.combat_round ?? currentState.round,
      turn: 'combat_turn' in patch ? patch.combat_turn : currentState.turn,
    }));
    return true;
  };

  // ---------------- Ações do Mestre ----------------

  const startCombat = async () => {
    setBusy(true);
    await supabase.from('room_combat').delete().eq('room_id', roomId);
    await updateRoomCombat({ combat_active: true, combat_round: 1, combat_turn: null });
    setCombatants([]);
    setBusy(false);
  };

  const endCombat = async () => {
    if (!window.confirm('Encerrar o combate? A fila de turnos será apagada.')) return;
    setBusy(true);
    await supabase.from('room_combat').delete().eq('room_id', roomId);
    await updateRoomCombat({ combat_active: false, combat_round: 0, combat_turn: null });
    setCombatants([]);
    setBusy(false);
  };

  const nextTurn = async () => {
    if (!ordered.length || busy) return;
    setBusy(true);

    // Ainda ninguém agiu: começa pelo primeiro da fila.
    const isStart = currentIndex < 0;
    const isLast = currentIndex === ordered.length - 1;
    const next = isStart ? ordered[0] : ordered[isLast ? 0 : currentIndex + 1];

    const ok = await updateRoomCombat({
      combat_turn: next.id,
      combat_round: !isStart && isLast ? combat.round + 1 : combat.round,
    });

    // Início do turno: modos ativos descontam dreno e duração.
    if (ok) setTurnLog(await applyTurnStartEffects(next.character_id));
    setBusy(false);
  };

  const previousTurn = async () => {
    if (currentIndex < 0) return;
    const isFirst = currentIndex === 0;
    if (isFirst && combat.round <= 1) return;
    await updateRoomCombat({
      combat_turn: ordered[isFirst ? ordered.length - 1 : currentIndex - 1].id,
      combat_round: isFirst ? combat.round - 1 : combat.round,
    });
  };

  const addNpc = async (event) => {
    event.preventDefault();
    const name = npcName.trim();
    if (!name || busy) return;

    setBusy(true);
    const bonus = Number(npcBonus || 0);
    const roll = await onRoll?.({ label: `Iniciativa · ${name}`, count: 1, sides: 8, modifier: bonus });

    if (roll) {
      const { error } = await supabase.from('room_combat').insert({
        room_id: roomId,
        character_name: name,
        initiative: roll.total,
        init_bonus: bonus,
        tiebreak: rollTiebreak(),
        is_npc: true,
        added_by: playerId,
      });
      if (error) alert('Erro ao adicionar ao combate: ' + error.message);
      else setNpcName('');
    }
    setBusy(false);
  };

  // ---------- Mestre: colocar no combate quem já está no mapa ----------
  const [mapList, setMapList] = useState(null); // null = lista fechada

  const loadMapList = async () => {
    const [{ data: tokens }, { data: characters }] = await Promise.all([
      supabase.from('map_tokens').select('*').eq('room_id', roomId),
      supabase.from('characters').select('*').eq('room_id', roomId),
    ]);
    const byId = Object.fromEntries((characters || []).map((c) => [c.id, c]));
    const inCombat = (token) => combatants.some((c) => c.token_id === token.id || (token.character_id && c.character_id === token.character_id));
    setMapList((tokens || [])
      .filter((token) => token.sprite?.mode !== 'prop' && token.character_id && byId[token.character_id] && !inCombat(token))
      .map((token) => ({ token, character: byId[token.character_id] })));
  };

  const addFromMap = async (entries) => {
    if (busy || !entries.length) return;
    setBusy(true);
    for (const { token, character } of entries) {
      const bonus = initiativeBonus(character);
      const roll = await onRoll?.({ label: `Iniciativa · ${character.name}`, count: 1, sides: 8, modifier: bonus });
      if (!roll) continue;
      const { error } = await supabase.from('room_combat').insert({
        room_id: roomId,
        token_id: token.id,
        character_id: character.id,
        character_name: character.name,
        initiative: roll.total,
        init_bonus: bonus,
        tiebreak: rollTiebreak(),
        is_npc: Boolean(character.is_npc),
        added_by: playerId,
      });
      if (error) alert(`Erro ao colocar ${character.name} no combate: ${error.code === '23505' ? 'já está no combate.' : error.message}`);
    }
    setBusy(false);
    setMapList(null);
  };

  const editInitiative = async (combatant, value) => {
    const initiative = Number(value);
    if (!Number.isFinite(initiative) || initiative === combatant.initiative) return;
    const { error } = await supabase.from('room_combat').update({ initiative }).eq('id', combatant.id);
    if (error) alert('Erro ao alterar iniciativa: ' + error.message);
  };

  const removeCombatant = async (combatant) => {
    // Se era a vez dele, passa a vez antes de remover.
    if (combatant.id === combat.turn) {
      const next = ordered[(currentIndex + 1) % ordered.length];
      await updateRoomCombat({ combat_turn: next && next.id !== combatant.id ? next.id : null });
    }
    const { error } = await supabase.from('room_combat').delete().eq('id', combatant.id);
    if (error) alert('Erro ao remover: ' + error.message);
  };

  // ---------------- Ações da rodada ----------------

  const saveActions = async (combatant, nextState) => {
    // Atualiza na tela na hora e salva no banco (o Realtime avisa os outros).
    setCombatants((list) => list.map((c) => (c.id === combatant.id ? { ...c, actions: nextState } : c)));
    const { error } = await supabase.from('room_combat').update({ actions: nextState }).eq('id', combatant.id);
    if (error) alert('Erro ao registrar ação: ' + error.message);
  };

  const toggleStrict = () => updateRoomCombat({ combat_strict: !combat.strict });

  // ---------------- Ação do jogador ----------------

  const rollMyInitiative = async () => {
    if (!myCharacter || myEntry || busy) return;

    setBusy(true);
    const bonus = initiativeBonus(myCharacter);
    const roll = await onRoll?.({ label: 'Iniciativa', count: 1, sides: 8, modifier: bonus });

    if (roll) {
      const { error } = await supabase.from('room_combat').insert({
        room_id: roomId,
        character_id: myCharacter.id,
        character_name: myCharacter.name,
        initiative: roll.total,
        init_bonus: bonus,
        tiebreak: rollTiebreak(),
        is_npc: false,
        added_by: playerId,
      });
      if (error) alert('Erro ao entrar no combate: ' + error.message);
    }
    setBusy(false);
  };

  // ---------------- Tela ----------------

  if (!combat.active) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-zinc-900 p-6 text-center text-white">
        <p className="text-4xl">⚔️</p>
        <p className="text-sm text-zinc-400">Nenhum combate em andamento.</p>
        {isGM ? (
          <button onClick={startCombat} disabled={busy} className="rounded-lg bg-red-600 px-5 py-2.5 text-sm font-black hover:bg-red-700 disabled:opacity-50">
            Iniciar combate
          </button>
        ) : (
          <p className="text-xs text-zinc-500">Quando o Mestre iniciar, você rola sua iniciativa aqui.</p>
        )}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-zinc-900 text-white">
      {/* Cabeçalho */}
      <div className="space-y-2 border-b border-zinc-800 p-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-red-400">Combate</p>
            <p className="text-lg font-black">Rodada {combat.round}</p>
          </div>
          {current && (
            <div className="text-right">
              <p className="text-[10px] uppercase text-zinc-500">Vez de</p>
              <p className="max-w-36 truncate text-sm font-black text-amber-300">{current.character_name}</p>
            </div>
          )}
        </div>

        {isMyTurn && <div className="animate-pulse rounded border border-amber-600 bg-amber-950/50 p-2 text-center text-sm font-black text-amber-200">⚡ É a sua vez!</div>}

        {isGM && (
          <button
            onClick={toggleStrict}
            title="Regras do livro: a ação gasta trava. Narrativo: os botões ficam sempre liberados."
            className={`w-full rounded border px-2 py-1.5 text-[11px] font-bold ${combat.strict ? 'border-zinc-700 text-zinc-300' : 'border-violet-800 bg-violet-950/40 text-violet-200'}`}
          >
            {combat.strict ? '📖 Ações: regras do livro' : '🎭 Ações: modo narrativo'} <span className="font-normal text-zinc-500">(clique para trocar)</span>
          </button>
        )}

        {isGM && (
          <div className="grid grid-cols-3 gap-1">
            <button onClick={previousTurn} disabled={currentIndex < 0} className="rounded border border-zinc-700 py-2 text-xs font-bold text-zinc-300 hover:border-zinc-500 disabled:opacity-40">◀ Voltar</button>
            <button onClick={nextTurn} disabled={!ordered.length} className="col-span-2 rounded bg-red-600 py-2 text-xs font-black hover:bg-red-700 disabled:opacity-40">
              {currentIndex < 0 ? '▶ Começar rodada' : 'Próximo turno ▶'}
            </button>
          </div>
        )}

        {!isGM && myCharacter && !myEntry && (
          <button onClick={rollMyInitiative} disabled={busy} className="w-full rounded-lg bg-red-600 py-2.5 text-sm font-black hover:bg-red-700 disabled:opacity-50">
            🎲 Rolar iniciativa (1d8 + {initiativeBonus(myCharacter)})
          </button>
        )}
        {!isGM && !myCharacter && <p className="text-xs text-zinc-500">Crie sua ficha para entrar no combate.</p>}
      </div>

      {/* Ações da rodada: o Mestre controla quem está na vez; o jogador, o próprio personagem */}
      {isGM && current && (
        <ActionPanel combatant={current} round={combat.round} strict={combat.strict} enabled isGM onSave={saveActions} />
      )}
      {!isGM && myEntry && (
        <ActionPanel combatant={myEntry} round={combat.round} strict={combat.strict} enabled={!combat.strict || isMyTurn} onSave={saveActions} />
      )}

      {/* O que os modos ativos fizeram no início do turno (só o Mestre vê) */}
      {isGM && turnLog.length > 0 && (
        <div className="space-y-0.5 border-b border-zinc-800 bg-sky-950/30 px-3 py-2">
          {turnLog.map((line) => <p key={line} className="text-[11px] text-sky-200">⏳ {line}</p>)}
        </div>
      )}

      {/* Fila de turnos */}
      <div className="flex-1 space-y-1.5 overflow-y-auto p-3">
        {ordered.length === 0 && <p className="text-center text-xs text-zinc-500">Aguardando as rolagens de iniciativa…</p>}

        {ordered.map((combatant, index) => {
          const isCurrent = combatant.id === combat.turn;
          const isMine = myCharacter && combatant.character_id === myCharacter.id;
          const hideValue = combatant.is_npc && !isGM; // jogadores não veem a iniciativa dos NPCs

          return (
            <div
              key={combatant.id}
              className={`flex items-center gap-2 rounded-lg border p-2 text-sm transition-colors ${
                isCurrent ? 'border-amber-500 bg-amber-950/40' : isMine ? 'border-red-900 bg-red-950/30' : 'border-zinc-800 bg-zinc-950'
              }`}
            >
              <span className={`w-6 text-center text-xs font-black ${isCurrent ? 'text-amber-300' : 'text-zinc-500'}`}>{isCurrent ? '▶' : `${index + 1}º`}</span>

              <div className="min-w-0 flex-1">
                <p className="truncate font-bold text-zinc-100">
                  {combatant.character_name}
                  {combatant.is_npc && <span className="ml-1 rounded bg-zinc-800 px-1 text-[9px] font-bold text-zinc-400">NPC</span>}
                </p>
                {!hideValue && <p className="text-[10px] text-zinc-500">precisão +{combatant.init_bonus ?? 0}</p>}
              </div>

              {isGM ? (
                <input
                  type="number"
                  defaultValue={combatant.initiative}
                  key={`${combatant.id}-${combatant.initiative}`}
                  onBlur={(e) => editInitiative(combatant, e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                  title="Iniciativa (o Mestre pode alterar)"
                  className="w-14 rounded border border-zinc-700 bg-zinc-900 px-1 py-1 text-center text-base font-black tabular-nums text-white focus:border-red-500 focus:outline-none"
                />
              ) : (
                <span className="w-10 text-center text-lg font-black tabular-nums">{hideValue ? '?' : combatant.initiative}</span>
              )}

              {isGM && (
                <button onClick={() => removeCombatant(combatant)} title="Remover do combate" className="px-1 text-xs text-zinc-600 hover:text-red-400">✕</button>
              )}
            </div>
          );
        })}
      </div>

      {/* Mestre: adicionar NPC/inimigo e encerrar */}
      {isGM && (
        <div className="space-y-2 border-t border-zinc-800 p-3">
          {mapList === null ? (
            <button type="button" onClick={loadMapList} disabled={busy}
              className="w-full rounded bg-red-700 py-2 text-xs font-bold text-white hover:bg-red-600 disabled:opacity-50">
              ＋ Colocar no combate quem está no mapa
            </button>
          ) : (
            <div className="space-y-1 rounded border border-zinc-800 bg-zinc-950 p-2">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">No mapa e fora do combate</p>
                <button type="button" onClick={() => setMapList(null)} className="text-xs text-zinc-500 hover:text-white">✕</button>
              </div>
              {mapList.length === 0 && <p className="text-[11px] text-zinc-500">Todo mundo do mapa já está no combate.</p>}
              {mapList.some((e) => e.character.is_npc) && (
                <button type="button" disabled={busy} onClick={() => addFromMap(mapList.filter((e) => e.character.is_npc))}
                  className="w-full rounded border border-red-800 py-1.5 text-[11px] font-bold text-red-200 hover:bg-red-950/50 disabled:opacity-50">
                  Todos os NPCs ({mapList.filter((e) => e.character.is_npc).length})
                </button>
              )}
              {mapList.map((entry) => (
                <button key={entry.token.id} type="button" disabled={busy} onClick={() => addFromMap([entry])}
                  className="flex w-full items-center justify-between rounded px-2 py-1 text-left text-xs hover:bg-zinc-800 disabled:opacity-50">
                  <span className="truncate">{entry.character.name} <span className="text-[10px] text-zinc-500">{entry.character.is_npc ? 'NPC' : 'jogador'}</span></span>
                  <span className="text-zinc-400">＋ 1d8+{initiativeBonus(entry.character)}</span>
                </button>
              ))}
            </div>
          )}

          <form onSubmit={addNpc} className="flex gap-1">
            <input value={npcName} onChange={(e) => setNpcName(e.target.value)} placeholder="NPC / grupo de inimigos" className="min-w-0 flex-1 rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm focus:border-red-500 focus:outline-none" />
            <input type="number" value={npcBonus} onChange={(e) => setNpcBonus(e.target.value)} title="Bônus (Agilidade + Prontidão)" className="w-14 rounded border border-zinc-700 bg-zinc-950 px-1 py-1.5 text-center text-sm focus:border-red-500 focus:outline-none" />
            <button type="submit" disabled={busy || !npcName.trim()} className="rounded bg-zinc-700 px-3 text-sm font-bold hover:bg-zinc-600 disabled:opacity-40">🎲</button>
          </form>
          <p className="text-[10px] text-zinc-600">Rola 1d8 + bônus. Um único teste pode valer para um grupo inteiro de inimigos.</p>
          <button onClick={endCombat} disabled={busy} className="w-full rounded border border-red-900 py-1.5 text-xs font-bold text-red-400 hover:bg-red-950/50 disabled:opacity-50">Encerrar combate</button>
        </div>
      )}
    </div>
  );
}

/**
 * Painel de ações da rodada (pág. 255).
 * strict = regras do livro (ação gasta trava). Narrativo = sempre clicável, só registra.
 */
function ActionPanel({ combatant, round, strict, enabled, isGM = false, onSave }) {
  const state = actionsForRound(combatant.actions, round);
  const free = freeSlots(state);

  const describe = (entry) => {
    // Movimento feito no mapa mostra quantos blocos andou (1 bloco = 2 m).
    const label = `${ACTION_TYPES[entry.type]?.label || entry.type}${entry.blocks ? ` ${entry.blocks} bl.` : ''}`;
    const paidWith = entry.slots?.[0];
    if (entry.type === 'completa' || entry.type === 'livre' || !paidWith || paidWith === entry.type) return label;
    return `${label} (usando ${ACTION_TYPES[paidWith].label})`;
  };

  return (
    <div className="space-y-2 border-b border-zinc-800 bg-zinc-950/60 px-3 py-2">
      <div className="flex items-center justify-between">
        <p className="truncate text-[10px] font-bold uppercase tracking-wider text-zinc-500">
          Ações · <span className="text-zinc-300">{combatant.character_name}</span>
        </p>
        <div className="flex gap-1">
          {['padrao', 'movimento', 'parcial'].map((slot) => (
            <span
              key={slot}
              title={free.includes(slot) ? 'Disponível' : 'Já usada nesta rodada'}
              className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${free.includes(slot) ? 'bg-emerald-900/60 text-emerald-200' : 'bg-zinc-800 text-zinc-600 line-through'}`}
            >
              {ACTION_TYPES[slot].label}
            </span>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-5 gap-1">
        {Object.entries(ACTION_TYPES).map(([type, info]) => {
          const blocked = strict && slotsFor(type, state) === null;
          const timesUsed = state.log.filter((entry) => entry.type === type).length;
          return (
            <button
              key={type}
              type="button"
              disabled={!enabled || blocked}
              title={info.hint}
              onClick={() => {
                const next = registerAction(type, state, strict);
                if (next) onSave(combatant, next);
              }}
              className={`relative rounded border py-1.5 text-[10px] font-bold transition ${
                type === 'livre' ? 'border-zinc-700 text-zinc-300' : 'border-red-900 bg-red-950/40 text-red-100'
              } hover:border-red-500 disabled:cursor-not-allowed disabled:opacity-30`}
            >
              {info.label}
              {timesUsed > 0 && <span className="absolute -right-1 -top-1 rounded-full bg-zinc-700 px-1 text-[8px] text-white">{timesUsed}</span>}
            </button>
          );
        })}
      </div>

      {state.log.length > 0 && (
        <div className="flex items-start justify-between gap-2">
          <p className="text-[10px] leading-snug text-zinc-500">{state.log.map(describe).join(' → ')}</p>
          <div className="flex shrink-0 gap-1">
            <button type="button" disabled={!enabled} onClick={() => onSave(combatant, undoLastAction(state))} className="text-[10px] font-bold text-zinc-400 hover:text-white disabled:opacity-30" title="Desfazer a última ação">↺ Desfazer</button>
            {isGM && <button type="button" onClick={() => onSave(combatant, { round, log: [] })} className="text-[10px] font-bold text-zinc-500 hover:text-red-300" title="Devolver todas as ações desta rodada">Zerar</button>}
          </div>
        </div>
      )}

      {!enabled && <p className="text-[10px] text-zinc-600">Pelas regras, suas ações só podem ser usadas no seu turno.</p>}
    </div>
  );
}
