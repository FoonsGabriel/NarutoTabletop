import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../../services/supabase/client';
import { uploadImage } from '../../../services/Storage';
import { CREATURE_SIZES, CREATURE_SPECIES, allowedSizes } from '../services/Npc';
import { criaturasDe, limitesInvocacao, montarCriatura, nivelKuchiyose, podeEditarInvocacoes } from '../services/Invocacao';

/**
 * Invocações do Kuchiyose (págs. 224–229) dentro da ficha do invocador.
 * O Mestre cria, edita e sobe o NC; o jogador também, se o Mestre liberar.
 */
export default function InvocacoesPanel({ invocador, isGM, playerId, onPermissao }) {
  const nivel = nivelKuchiyose(invocador);
  const limites = limitesInvocacao(nivel);
  const pode = podeEditarInvocacoes(invocador, { isGM, playerId });
  const [lista, setLista] = useState([]);
  const [form, setForm] = useState(null); // { id?, nome, especie, tamanho, nc, figuraUrl }
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState('');

  const carregar = useCallback(async () => {
    if (!invocador?.id) return;
    const { data } = await supabase.from('characters').select('*').eq('room_id', invocador.room_id);
    setLista(criaturasDe(data || [], invocador.id));
  }, [invocador?.id, invocador?.room_id]);

  useEffect(() => { carregar(); }, [carregar]);

  if (!nivel || !invocador?.id) return null;

  const ncMax = isGM ? 20 : limites.uma;
  const novo = () => setForm({ nome: '', especie: 'caes', tamanho: 'medio', nc: Math.max(4, limites.uma), figuraUrl: '' });
  const editar = (c) => setForm({
    id: c.id,
    nome: c.name,
    especie: c.attributes.criatura.especie,
    tamanho: c.attributes.criatura.tamanho,
    nc: c.attributes.criatura.nc,
    figuraUrl: c.attributes.npc?.figure?.url || '',
  });

  const enviarImagem = async (file) => {
    if (!file) return;
    setBusy(true);
    setErro('');
    try {
      const url = await uploadImage(file, 'sprites');
      setForm((f) => ({ ...f, figuraUrl: url }));
    } catch (e) {
      setErro('Erro ao enviar a imagem: ' + e.message);
    }
    setBusy(false);
  };

  const salvar = async () => {
    setBusy(true);
    setErro('');
    const anterior = form.id ? lista.find((c) => c.id === form.id) : null;
    const nc = Math.max(4, Math.min(ncMax, Number(form.nc) || 4));
    const linha = montarCriatura({ nome: form.nome.trim(), nc, especie: form.especie, tamanho: form.tamanho, figuraUrl: form.figuraUrl, invocador, anterior });
    const { error } = anterior
      ? await supabase.from('characters').update({ ...linha, attributes: { ...anterior.attributes, ...linha.attributes } }).eq('id', anterior.id)
      : await supabase.from('characters').insert({ ...linha, active_modes: [], overrides: {} });
    setBusy(false);
    if (error) { setErro('Erro ao salvar: ' + error.message); return; }
    setForm(null);
    carregar();
  };

  const excluir = async (c) => {
    if (!window.confirm(`Apagar a ficha de ${c.name}? Os tokens dela saem do mapa.`)) return;
    await supabase.from('map_tokens').delete().eq('character_id', c.id);
    const { error } = await supabase.from('characters').delete().eq('id', c.id);
    if (error) setErro('Erro ao apagar: ' + error.message);
    carregar();
  };

  const tamanhos = form ? allowedSizes(form.especie, Math.max(4, Number(form.nc) || 4)) : [];

  return (
    <div className="rounded border border-zinc-800 bg-zinc-900 p-3">
      <h3 className="text-sm font-bold text-red-300">🐸 Invocações (Kuchiyose Nv {nivel})</h3>
      <p className="mb-2 text-[11px] text-zinc-500">
        Uma vez por cena: 1 criatura de NC até {limites.uma}, ou 2 de NC até {limites.duas} (pág. 224).
        {!pode && ' Quem cria e edita as fichas é o Mestre.'}
      </p>

      {isGM && (
        <label className="mb-2 flex items-center gap-2 text-[11px] text-zinc-300">
          <input type="checkbox" checked={Boolean(invocador.attributes?.kuchiyose_livre)} onChange={(e) => onPermissao?.(e.target.checked)} />
          Jogador pode criar e editar as invocações
        </label>
      )}

      <div className="space-y-1">
        {lista.map((c) => (
          <div key={c.id} className="flex items-center gap-2 rounded bg-zinc-950 p-1.5">
            <div className="flex h-10 w-9 shrink-0 items-end justify-center overflow-hidden rounded border border-zinc-800 bg-zinc-900">
              {c.attributes.npc?.figure?.url ? <img src={c.attributes.npc.figure.url} alt="" className="max-h-full max-w-full object-contain" /> : <span className="pb-2">🐾</span>}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-bold">{c.name}</p>
              <p className="text-[10px] text-zinc-400">
                {CREATURE_SPECIES[c.attributes.criatura.especie]?.label} · {CREATURE_SIZES[c.attributes.criatura.tamanho]?.label} · NC {c.attributes.criatura.nc} · ❤ {c.hp_current}/{c.hp_max}
                {c.attributes.criatura.nc > limites.uma && <span className="text-amber-300"> · acima do seu limite</span>}
              </p>
            </div>
            {pode && (
              <>
                <button type="button" onClick={() => editar(c)} className="rounded border border-zinc-700 px-2 py-0.5 text-[11px] text-zinc-300 hover:text-white">Editar</button>
                <button type="button" onClick={() => excluir(c)} className="px-1 text-zinc-500 hover:text-red-400" title="Apagar">✕</button>
              </>
            )}
          </div>
        ))}
        {!lista.length && <p className="text-[11px] text-zinc-500">Nenhuma criatura ainda.</p>}
      </div>

      {pode && !form && (
        <button type="button" onClick={novo} className="mt-2 w-full rounded border border-dashed border-zinc-600 py-1 text-xs font-bold text-zinc-300 hover:border-zinc-400">+ Nova criatura</button>
      )}

      {form && (
        <div className="mt-2 space-y-1.5 rounded border border-zinc-700 bg-zinc-950 p-2 text-xs">
          <input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} placeholder="Nome (ex.: Gamakichi)"
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1" />
          <div className="grid grid-cols-3 gap-1">
            <label className="text-[10px] text-zinc-400">Espécie
              <select value={form.especie} onChange={(e) => setForm({ ...form, especie: e.target.value })} className="mt-0.5 w-full rounded border border-zinc-700 bg-zinc-900 px-1 py-1 text-xs text-zinc-100">
                {Object.entries(CREATURE_SPECIES).map(([key, s]) => <option key={key} value={key}>{s.label}</option>)}
              </select>
            </label>
            <label className="text-[10px] text-zinc-400">NC
              <input type="number" min={4} max={ncMax} value={form.nc} onChange={(e) => setForm({ ...form, nc: e.target.value })}
                className="mt-0.5 w-full rounded border border-zinc-700 bg-zinc-900 px-1 py-1 text-xs text-zinc-100" />
            </label>
            <label className="text-[10px] text-zinc-400">Tamanho
              <select value={tamanhos.includes(form.tamanho) ? form.tamanho : ''} onChange={(e) => setForm({ ...form, tamanho: e.target.value })} className="mt-0.5 w-full rounded border border-zinc-700 bg-zinc-900 px-1 py-1 text-xs text-zinc-100">
                {!tamanhos.includes(form.tamanho) && <option value="">Automático</option>}
                {tamanhos.map((key) => <option key={key} value={key}>{CREATURE_SIZES[key].label}</option>)}
              </select>
            </label>
          </div>
          <label className="flex items-center gap-2 text-[10px] text-zinc-400">
            Imagem (png de corpo inteiro):
            <input type="file" accept="image/*" onChange={(e) => enviarImagem(e.target.files?.[0])} className="text-[10px]" />
          </label>
          {form.figuraUrl && <img src={form.figuraUrl} alt="" className="h-16 object-contain" />}
          <p className="text-[10px] text-zinc-500">Atributos, Vitalidade (metade), dano e perícias seguem as regras das págs. 225–229 para a espécie e o NC.</p>
          <div className="flex gap-1">
            <button type="button" onClick={() => setForm(null)} className="flex-1 rounded border border-zinc-700 py-1 font-bold text-zinc-300">Cancelar</button>
            <button type="button" disabled={busy} onClick={salvar} className="flex-1 rounded bg-red-700 py-1 font-black hover:bg-red-600 disabled:opacity-50">{form.id ? 'Salvar' : 'Criar'}</button>
          </div>
        </div>
      )}
      {erro && <p className="mt-1 text-[11px] text-red-400">{erro}</p>}
    </div>
  );
}
