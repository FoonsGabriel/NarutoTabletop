import { useState } from 'react';
import { supabase } from '../services/supabase/client';
import { TAMANHOS, sizeInfo } from '../data/Tamanhos';
import { deslocamentoMetros, METROS_POR_BLOCO } from '../services/Movement';

/**
 * Ajustes do Mestre para um personagem ou NPC (characters.overrides):
 *  - Tamanho (págs. 271–272): muda deslocamento, alcance corpo a corpo e bônus de ataque.
 *  - Deslocamento fixo (em metros), para transformações, montarias, ferimentos etc.
 * "Automático" volta para o que a ficha calcula.
 */
export default function GmAdjust({ character, onClose, onSaved }) {
  const current = character?.overrides || {};
  const [tamanho, setTamanho] = useState(current.tamanho || '');
  const [desloc, setDesloc] = useState(current.deslocamento ? String(current.deslocamento) : '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  if (!character) return null;

  // O que a ficha daria sem os ajustes (para mostrar no "Automático").
  const fichaTamanho = character.attributes?.tamanho || character.attributes?.npc?.size || 'medio';
  const preview = { ...character, overrides: { ...(tamanho ? { tamanho } : {}) } };
  const autoMeters = deslocamentoMetros(preview);
  const blocos = (m) => Math.max(1, Math.floor(m / METROS_POR_BLOCO));
  const meterOptions = Array.from({ length: 25 }, (_, i) => (i + 1) * 2); // 2 m … 50 m

  const save = async () => {
    setSaving(true);
    const overrides = { ...current };
    if (tamanho) overrides.tamanho = tamanho; else delete overrides.tamanho;
    if (desloc) overrides.deslocamento = Number(desloc); else delete overrides.deslocamento;
    const { error: saveError } = await supabase.from('characters').update({ overrides }).eq('id', character.id);
    setSaving(false);
    if (saveError) { setError(saveError.message); return; }
    onSaved?.({ ...character, overrides });
    onClose();
  };

  const selectClass = 'w-full rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3" onClick={onClose}>
      <div className="w-full max-w-sm space-y-3 rounded-xl border border-zinc-700 bg-zinc-900 p-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <p className="titulo-shinobi text-xl">⚙️ Ajustes do Mestre</p>
          <button type="button" onClick={onClose} className="px-1 text-zinc-400 hover:text-white">✕</button>
        </div>
        <p className="text-sm font-bold text-zinc-200">{character.name}</p>

        <label className="block text-xs font-semibold text-zinc-400">
          Tamanho
          <select value={tamanho} onChange={(e) => setTamanho(e.target.value)} className={`${selectClass} mt-1`}>
            <option value="">Automático (da ficha: {sizeInfo(fichaTamanho).label})</option>
            {Object.entries(TAMANHOS).map(([key, info]) => (
              <option key={key} value={key}>
                {info.label} — deslocamento {info.deslocamento >= 0 ? '+' : ''}{info.deslocamento} m · alcance CC {info.alcanceCC} bl
              </option>
            ))}
          </select>
        </label>

        <label className="block text-xs font-semibold text-zinc-400">
          Deslocamento
          <select value={desloc} onChange={(e) => setDesloc(e.target.value)} className={`${selectClass} mt-1`}>
            <option value="">Automático ({Math.round(autoMeters * 10) / 10} m = {blocos(autoMeters)} blocos)</option>
            {meterOptions.map((m) => <option key={m} value={m}>{m} m = {blocos(m)} blocos</option>)}
          </select>
        </label>

        <p className="text-[11px] text-zinc-500">
          Tamanho (págs. 271–272): soma ou tira metros do deslocamento, aumenta o alcance corpo a corpo e quem ataca alvo maior ganha +1 a cada 2 categorias. Deslocamento fixo serve para transformações, montarias ou efeitos.
        </p>
        {error && <p className="text-xs text-red-400">Erro: {error}</p>}

        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={onClose} className="rounded border border-zinc-700 py-2 text-sm font-bold text-zinc-300">Cancelar</button>
          <button type="button" onClick={save} disabled={saving} className="rounded bg-red-600 py-2 text-sm font-black text-white disabled:opacity-50">{saving ? 'Salvando…' : 'Salvar'}</button>
        </div>
      </div>
    </div>
  );
}
