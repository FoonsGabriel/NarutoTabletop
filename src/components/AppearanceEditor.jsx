import { useState } from 'react';
import { uploadImage } from '../services/Storage';
import { EFEITOS_CENARIO } from '../data/Cenario';
import { ALTURA_ADULTO, ALTURA_CRIANCA } from '../data/Aparencias';

const inputClass = 'w-full rounded border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-sm text-white focus:border-red-500 focus:outline-none';

/**
 * Editor da aparência no mapa (campo `sprite` de map_tokens).
 * - Personagem: imagem de corpo inteiro (PNG transparente), altura em células, lado que olha.
 * - Item de cenário (isProp): imagem, altura e animação (vento / fogo).
 */
export default function AppearanceEditor({ value, onChange, isProp = false }) {
  const sprite = value || {};
  const [uploading, setUploading] = useState(false);
  const defaultHeight = isProp ? 2 : 1.8;
  const height = Number(sprite.heightCells) || defaultHeight;

  const update = (patch) => {
    const next = { ...sprite, ...patch };
    next.mode = isProp ? 'prop' : next.url ? 'figure' : undefined;
    if (!next.mode) delete next.mode;
    onChange(next);
  };

  const handleFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setUploading(true);
    try {
      const url = await uploadImage(file, isProp ? 'props' : 'sprites');
      update({ url, heightCells: height, builtin: undefined }); // imagem própria substitui a base desenhada
    } catch (error) {
      alert('Erro ao enviar a imagem: ' + error.message);
    }
    setUploading(false);
  };

  return (
    <div className="space-y-2 rounded border border-zinc-800 bg-zinc-950 p-2">
      <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
        {isProp ? 'Item de cenário' : 'Aparência no mapa'}
      </p>

      <div className="flex items-center gap-2">
        <div className="flex h-16 w-12 shrink-0 items-end justify-center overflow-hidden rounded bg-zinc-800">
          {sprite.url
            ? <img src={sprite.url} alt="" className="max-h-full max-w-full object-contain" />
            : <span className="pb-5 text-[9px] text-zinc-500">sem</span>}
        </div>

        <div className="min-w-0 flex-1 space-y-1">
          <label className="block cursor-pointer rounded border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-center text-xs font-bold hover:border-red-600">
            {uploading ? 'Enviando…' : sprite.url ? 'Trocar imagem' : 'Enviar PNG'}
            <input type="file" accept="image/png,image/webp" onChange={handleFile} className="hidden" disabled={uploading} />
          </label>
          {!isProp && sprite.url && (
            <button type="button" onClick={() => update({ url: undefined })} className="w-full text-[10px] text-zinc-500 hover:text-red-300">
              Voltar ao token redondo
            </button>
          )}
        </div>
      </div>

      {(sprite.url || isProp) && (
        <>
          <label className="block text-[11px] text-zinc-400">
            Altura no mapa: <b className="text-white">{height.toFixed(1)}</b> células
            <input
              type="range"
              min="0.6"
              max="5"
              step="0.1"
              value={height}
              onChange={(e) => update({ heightCells: Number(e.target.value) })}
              className="w-full accent-red-600"
            />
          </label>
          {!isProp && (
            <div className="flex gap-1">
              {[['Criança', ALTURA_CRIANCA], ['Adulto', ALTURA_ADULTO], ['Grandalhão', 3.2]].map(([label, h]) => (
                <button key={label} type="button" onClick={() => update({ heightCells: h })}
                  className={`flex-1 rounded border px-1 py-1 text-[10px] font-bold ${Math.abs(height - h) < 0.05 ? 'border-orange-500 bg-orange-950/50 text-orange-200' : 'border-zinc-700 text-zinc-400 hover:text-white'}`}>
                  {label} {h}
                </button>
              ))}
            </div>
          )}

          {!isProp ? (
            <select value={sprite.facing || 'right'} onChange={(e) => update({ facing: e.target.value })} className={inputClass}>
              <option value="right">Na imagem, olha para a direita</option>
              <option value="left">Na imagem, olha para a esquerda</option>
            </select>
          ) : (
            <>
              <select value={sprite.anim || 'none'} onChange={(e) => update({ anim: e.target.value })} className={inputClass}>
                <option value="none">Sem animação</option>
                <option value="sway">Balançar com o vento (árvores, bandeiras)</option>
                <option value="flicker">Tremular (fogo, lanternas)</option>
              </select>
              <label className="block text-[11px] text-zinc-400">
                Efeito animado
                <select value={sprite.fx || 'nenhum'} onChange={(e) => update({ fx: e.target.value })} className={inputClass}>
                  {EFEITOS_CENARIO.map((fx) => <option key={fx.key} value={fx.key}>{fx.label}</option>)}
                </select>
              </label>

              <div className="rounded border border-zinc-800 p-2">
                <label className="flex items-center gap-2 text-[11px] text-zinc-300">
                  <input type="checkbox" checked={Boolean(sprite.light && !sprite.light.off)}
                    onChange={(e) => update({ light: e.target.checked ? { radius: sprite.light?.radius || 4, color: sprite.light?.color || '#ffb060' } : { ...(sprite.light || {}), off: true } })} />
                  💡 Emite luz (aparece no entardecer, à noite e com chuva)
                </label>
                {sprite.light && !sprite.light.off && (
                  <div className="mt-1 flex items-center gap-2 text-[11px] text-zinc-400">
                    <input type="color" value={sprite.light.color || '#ffb060'} onChange={(e) => update({ light: { ...sprite.light, color: e.target.value } })}
                      className="h-6 w-8 cursor-pointer rounded border-0 bg-transparent p-0" title="Cor da luz" />
                    Raio
                    <input type="range" min="1" max="12" step="0.5" value={Number(sprite.light.radius) || 4}
                      onChange={(e) => update({ light: { ...sprite.light, radius: Number(e.target.value) } })} className="flex-1 accent-amber-500" />
                    <b className="w-8 text-white">{Number(sprite.light.radius) || 4}</b>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-1 text-[11px] text-zinc-300">
                <label className="flex items-center gap-1.5 rounded border border-zinc-800 px-2 py-1">
                  <input type="checkbox" checked={Boolean(sprite.flip)} onChange={(e) => update({ flip: e.target.checked })} /> ↔️ Espelhar
                </label>
                <label className="flex items-center gap-1.5 rounded border border-zinc-800 px-2 py-1" title="Personagens não atravessam o item no movimento">
                  <input type="checkbox" checked={sprite.blocks !== false} onChange={(e) => update({ blocks: e.target.checked })} /> 🚧 Bloqueia
                </label>
              </div>
            </>
          )}
        </>
      )}

      <p className="text-[10px] text-zinc-600">Use PNG com fundo transparente e os pés encostando na base da imagem.</p>
    </div>
  );
}
