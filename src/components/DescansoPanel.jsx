import { useState } from 'react';
import { supabase } from '../services/supabase/client';
import { trackedUpdate } from '../services/Undo';

// Efeitos que só valem na cena (somem no fim da cena).
const DA_CENA = (m) => m.kawarimi || m.cena || m.genjutsu || /^(Kinobori|Tadayou|Bunshin|Henge|Ação preparada)/.test(m.name || '') || ['defensiva', 'defensiva_apt', 'defesa_total', 'investida', 'fintado'].includes(m.condicao);

/**
 * 🌙 Descanso e 🎬 fim de cena (Livro Básico, págs. 259–260).
 *  - Noite de descanso (8 h de sono): +10 + 2×Vigor de Vitalidade e +5 + 2×Espírito de Chakra (sem passar do máximo);
 *    sai de fatigado e exausto que não tenham duração própria; pílulas do soldado zeram.
 *  - Fim de cena: libera o Kawarimi e tira o que só valia na cena (Kinobori, Bunshin, posturas…).
 */
export default function DescansoPanel({ roomId }) {
  const [busy, setBusy] = useState(false);
  const [aviso, setAviso] = useState('');

  const personagens = async () => {
    const { data } = await supabase.from('characters').select('*').eq('room_id', roomId);
    return (data || []).filter((c) => !c.is_npc);
  };

  const descansar = async () => {
    if (!window.confirm('Noite de descanso para todos os personagens dos jogadores?')) return;
    setBusy(true);
    const linhas = [];
    for (const c of await personagens()) {
      const attrs = c.attributes?.attributes || {};
      const hpMax = Number(c.hp_max || 0);
      const ckMax = Number(c.chakra_max || 0);
      const hp = Number(c.hp_current ?? hpMax);
      const ck = Number(c.chakra_current ?? ckMax);
      const novoHp = Math.min(hpMax, hp + 10 + 2 * Number(attrs.vigor || 0));
      const novoCk = Math.min(ckMax, ck + 5 + 2 * Number(attrs.espirito || 0));
      const modes = (Array.isArray(c.active_modes) ? c.active_modes : [])
        .filter((m) => !DA_CENA(m))
        .filter((m) => !m.pilulas)
        .filter((m) => !((m.condicao === 'fatigado' || m.condicao === 'exausto') && m.turns == null));
      await trackedUpdate(c.id, { hp_current: novoHp, chakra_current: novoCk, active_modes: modes }, `${c.name}: noite de descanso`);
      linhas.push(`${c.name}: Vit ${hp}→${novoHp}, Chakra ${ck}→${novoCk}`);
    }
    await supabase.from('room_messages').insert({ room_id: roomId, player_name: '🌙 Descanso', message: `Noite de descanso. ${linhas.join(' · ')}`, is_roll: false });
    setAviso(linhas.join(' · ') || 'Nenhum personagem.');
    setBusy(false);
  };

  const fimDeCena = async () => {
    setBusy(true);
    const { data } = await supabase.from('characters').select('id, name, active_modes').eq('room_id', roomId);
    let total = 0;
    for (const c of data || []) {
      const modes = Array.isArray(c.active_modes) ? c.active_modes : [];
      const ficam = modes.filter((m) => !DA_CENA(m));
      if (ficam.length !== modes.length) {
        total += 1;
        await trackedUpdate(c.id, { active_modes: ficam }, `${c.name}: fim de cena`);
      }
    }
    await supabase.from('room_messages').insert({ room_id: roomId, player_name: '🎬 Cena', message: 'Fim de cena: Kawarimi liberado e efeitos da cena encerrados.', is_roll: false });
    setAviso(`Fim de cena: ${total} ficha(s) atualizada(s).`);
    setBusy(false);
  };

  return (
    <section className="space-y-2 rounded-lg border border-zinc-800 bg-zinc-950 p-3">
      <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">🌙 Descanso e cena</p>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" disabled={busy} onClick={descansar} className="rounded border border-indigo-700 bg-indigo-950/50 py-2 text-xs font-bold text-indigo-100 hover:bg-indigo-900/60 disabled:opacity-50">🌙 Noite de descanso</button>
        <button type="button" disabled={busy} onClick={fimDeCena} className="rounded border border-zinc-700 py-2 text-xs font-bold text-zinc-200 hover:border-orange-600 disabled:opacity-50">🎬 Fim de cena</button>
      </div>
      <p className="text-[10px] text-zinc-500">Descanso: +10 + 2×Vigor de Vitalidade e +5 + 2×Espírito de Chakra; tira fatigado/exausto e zera as pílulas (págs. 259–260). Fim de cena: libera o Kawarimi e encerra Kinobori, Bunshin, posturas…</p>
      {aviso && <p className="text-[11px] text-zinc-300">{aviso}</p>}
    </section>
  );
}
