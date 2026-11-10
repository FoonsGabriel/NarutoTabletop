import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../services/supabase/client';
import { ARMAS } from '../data/Armas';
import { trackedUpdate } from '../services/Undo';
import { uid } from '../services/Uid';
import DescansoPanel from './DescansoPanel.jsx';

/**
 * Recompensas do fim da sessão (Livro Básico, pág. 31):
 *  - Pontos de EXP diretos em atributo, perícia e poder (podem ser decimais: evolução lenta).
 *  - Regra opcional: EXP de 0 a 100; ao chegar em 100 o NC sobe e dá +6 atributos, +4 perícias, +2 poderes.
 *  - Ryos e itens (armas vão para o equipamento; o resto fica em "Itens recebidos").
 * Tudo vai para o ↩ Desfazer.
 */
const EXP_OPCOES = [0, 5, 10, 15, 20, 25, 30, 50, 100];
const PONTOS = [0, 0.3, 0.5, 1, 2, 3, 4, 5, 6];
const RYOS = [0, 10, 25, 50, 100, 200, 500, 1000, 2000];

export default function RewardsPanel({ roomId }) {
  const [players, setPlayers] = useState([]);
  const [chosen, setChosen] = useState({});
  const [form, setForm] = useState({ exp: 0, atributos: 0, pericias: 0, poderes: 0, ryo: 0, item: '', itemOutro: '', qtd: 1 });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const loadPlayers = useCallback(async () => {
    const { data } = await supabase.from('characters').select('id, name, is_npc, xp, ryo, level').eq('room_id', roomId);
    const list = (data || []).filter((c) => !c.is_npc);
    setPlayers(list);
    setChosen((prev) => {
      const next = { ...prev };
      list.forEach((c) => { if (next[c.id] === undefined) next[c.id] = true; });
      return next;
    });
  }, [roomId]);

  useEffect(() => {
    loadPlayers();

    const channel = supabase
      .channel(`rewards_panel_${roomId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'characters', filter: `room_id=eq.${roomId}` }, () => {
        loadPlayers();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomId, loadPlayers]);

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  const selected = players.filter((p) => chosen[p.id]);
  const arma = ARMAS.find((a) => a.id === form.item);
  const itemNome = form.item === '__outro__' ? form.itemOutro.trim() : arma?.nome || '';
  const nada = !form.exp && !form.atributos && !form.pericias && !form.poderes && !form.ryo && !itemNome;

  const give = async () => {
    if (busy || nada || !selected.length) return;
    setBusy(true);
    setNotice('');
    const linhas = [];
    for (const p of selected) {
      const { data: c, error: fetchErr } = await supabase.from('characters').select('*').eq('id', p.id).single();
      if (fetchErr || !c) continue;

      const attrs = { ...(c.attributes || {}) };
      const ganho = { atributos: 0, pericias: 0, poderes: 0, ...(attrs.exp_ganho || {}) };
      ganho.atributos = Number((ganho.atributos + Number(form.atributos)).toFixed(2));
      ganho.pericias = Number((ganho.pericias + Number(form.pericias)).toFixed(2));
      ganho.poderes = Number((ganho.poderes + Number(form.poderes)).toFixed(2));

      let xp = Number(c.xp || 0) + Number(form.exp);
      let level = Number(c.level || 4);
      let subiu = 0;
      while (xp >= 100) { // regra opcional: 100 de EXP = +1 NC
        xp -= 100;
        level += 1;
        subiu += 1;
        ganho.atributos += 6;
        ganho.pericias += 4;
        ganho.poderes += 2;
      }
      attrs.exp_ganho = ganho;

      if (itemNome) {
        const qtd = Math.max(1, Number(form.qtd) || 1);
        if (arma) {
          const equipment = { weapons: [], armor: 'nenhuma', ...(attrs.equipment || {}) };
          equipment.weapons = [...(equipment.weapons || []), ...Array.from({ length: qtd }, () => ({ uid: uid(), id: arma.id }))];
          attrs.equipment = equipment;
        } else {
          attrs.itens_recebidos = [...(attrs.itens_recebidos || []), { uid: uid(), nome: itemNome, quantidade: qtd }];
        }
      }

      const patch = { attributes: attrs, xp, level, ryo: Number(c.ryo || 0) + Number(form.ryo) };
      const partes = [
        form.exp ? `+${form.exp} EXP` : null,
        subiu ? `subiu para NC ${level}!` : null,
        form.atributos ? `+${form.atributos} atributo` : null,
        form.pericias ? `+${form.pericias} perícia` : null,
        form.poderes ? `+${form.poderes} poder` : null,
        form.ryo ? `+${form.ryo} Ryos` : null,
        itemNome ? `${itemNome}${form.qtd > 1 ? ` ×${form.qtd}` : ''}` : null,
      ].filter(Boolean);

      const { error } = await trackedUpdate(c.id, patch, `Recompensa para ${c.name}: ${partes.join(', ')}`);
      if (error) {
        setNotice('Erro: ' + error.message);
        setBusy(false);
        return;
      }
      linhas.push(`${c.name}: ${partes.join(', ')}`);
    }

    await supabase.from('room_messages').insert({ room_id: roomId, player_name: '🎁 Recompensas', message: linhas.join(' · '), is_roll: false });
    window.dispatchEvent(new CustomEvent('vtt:character-refresh'));
    await loadPlayers();
    setNotice(`Entregue com sucesso para ${linhas.length} personagem(ns)!`);
    setForm({ exp: 0, atributos: 0, pericias: 0, poderes: 0, ryo: 0, item: '', itemOutro: '', qtd: 1 });
    setBusy(false);
  };

  const sel = 'w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm text-white';
  const opt = ({ label, k, values, fmt = (v) => (v ? `+${v}` : '—') }) => (
    <label key={k} className="text-[10px] text-zinc-400">{label}
      <select value={form[k]} onChange={(e) => set(k, Number(e.target.value))} className={`${sel} mt-0.5`}>
        {values.map((v) => <option key={v} value={v}>{fmt(v)}</option>)}
      </select>
    </label>
  );

  return (
    <div className="flex-1 space-y-3 overflow-y-auto p-3">
      <DescansoPanel roomId={roomId} />
      <section className="space-y-2 rounded-lg border border-zinc-800 bg-zinc-950 p-3">
        <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Para quem</p>
        {players.length === 0 && <p className="text-xs text-zinc-500">Nenhum personagem de jogador na sala.</p>}
        {players.map((p) => (
          <label key={p.id} className="flex items-center gap-2 text-sm cursor-pointer hover:text-white">
            <input type="checkbox" checked={Boolean(chosen[p.id])} onChange={(e) => setChosen((c) => ({ ...c, [p.id]: e.target.checked }))} />
            <span className="flex-1 font-medium">{p.name}</span>
            <span className="text-[10px] text-zinc-400 font-bold bg-zinc-900 border border-zinc-800 rounded px-1.5 py-0.5">
              NC {p.level || 4} · {p.xp || 0} EXP · {p.ryo || 0} Ryos
            </span>
          </label>
        ))}
      </section>

      <section className="space-y-2 rounded-lg border border-zinc-800 bg-zinc-950 p-3">
        <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Experiência (pág. 31)</p>
        {opt({ label: "EXP da regra opcional (100 = sobe o NC: +6 atributos, +4 perícias, +2 poderes)", k: "exp", values: EXP_OPCOES })}
        <p className="text-[10px] text-zinc-500">Ou dê pontos direto (decimal = evolução lenta):</p>
        <div className="grid grid-cols-3 gap-2">
          {opt({ label: "Atributo", k: "atributos", values: PONTOS })}
          {opt({ label: "Perícia", k: "pericias", values: PONTOS })}
          {opt({ label: "Poder", k: "poderes", values: PONTOS })}
        </div>
      </section>

      <section className="space-y-2 rounded-lg border border-zinc-800 bg-zinc-950 p-3">
        <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Ryos e itens</p>
        {opt({ label: 'Ryos para cada um', k: 'ryo', values: RYOS, fmt: (v) => (v ? `+${v} Ryos` : '—') })}
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <label className="text-[10px] text-zinc-400">Item
            <select value={form.item} onChange={(e) => set('item', e.target.value)} className={`${sel} mt-0.5`}>
              <option value="">— nenhum —</option>
              <optgroup label="Armas (vão para o equipamento)">
                {ARMAS.filter((a) => a.grupo !== 'desarmado' && !a.natural).map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
              </optgroup>
              <option value="__outro__">Outro item… (digitar)</option>
            </select>
          </label>
          <label className="text-[10px] text-zinc-400">Qtd.
            <select value={form.qtd} onChange={(e) => set('qtd', Number(e.target.value))} className={`${sel} mt-0.5`}>
              {[1, 2, 3, 4, 5, 6, 10].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
        </div>
        {form.item === '__outro__' && (
          <input value={form.itemOutro} onChange={(e) => set('itemOutro', e.target.value)} placeholder="Ex.: Pergaminho de Invocação, Pílula de Soldado" className={sel} />
        )}
      </section>

      <button type="button" disabled={busy || nada || !selected.length} onClick={give}
        className="w-full rounded bg-red-600 py-2 text-sm font-black text-white hover:bg-red-500 disabled:opacity-40 shadow-lg">
        {busy ? 'Entregando…' : `🎁 Dar para ${selected.length} personagem(ns)`}
      </button>
      {notice && <p className="text-xs text-emerald-300 font-bold">{notice}</p>}
      <p className="text-[10px] text-zinc-600">Aparece no chat e na ficha (aba Recursos). Errou? Use o ↩ Desfazer.</p>
    </div>
  );
}
