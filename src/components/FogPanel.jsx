import { useEffect, useState } from 'react';
import { getEngine } from '../canvas/Spawn';
import { fogKey } from '../canvas/Fog';
import { patchFog } from '../services/SceneEnv';

/**
 * Névoa de guerra do mapa em uso (aba Ambientação do Mestre).
 * O mapa guarda os blocos descobertos em rooms.scene_env.fog_maps[mapa].
 */
export default function FogPanel({ roomId }) {
  const [, setTick] = useState(0);
  const [tool, setTool] = useState(null); // null | 'reveal' | 'hide'
  const [brush, setBrush] = useState(3);
  const [error, setError] = useState('');

  // Redesenha quando a névoa, a trava ou o mapa mudam.
  useEffect(() => {
    const refresh = () => setTick((n) => n + 1);
    window.addEventListener('vtt:scene-flags', refresh);
    window.addEventListener('vtt:active-map', refresh);
    return () => {
      window.removeEventListener('vtt:scene-flags', refresh);
      window.removeEventListener('vtt:active-map', refresh);
    };
  }, []);

  // Liga/desliga o pincel no mapa.
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('vtt:fog-edit', { detail: { editing: Boolean(tool), mode: tool || 'reveal', brush } }));
  }, [tool, brush]);

  // Ao fechar o painel, o pincel desliga.
  useEffect(() => () => window.dispatchEvent(new CustomEvent('vtt:fog-edit', { detail: { editing: false } })), []);

  const engine = getEngine();
  const fog = engine?.fog;
  const config = fog?.config || {};
  const on = Boolean(config.on);
  const auto = config.auto !== false;
  const vision = Number(config.vision) || 6;
  const revealed = fog?.cells.size || 0;

  const save = async (changes) => {
    const key = fogKey(engine?.activeMapId);
    // Revelar/Cobrir tudo: descarta a gravação automática que estava esperando.
    if (changes.cells && fog) { clearTimeout(fog.saveTimer); fog.pending = false; }
    const { env, error: saveError } = await patchFog(roomId, key, changes);
    setError(saveError ? saveError.message : '');
    if (env) engine?.applyFlags({ fog_maps: env.fog_maps }); // aparece na hora para você
  };

  if (!engine) return null;

  const btn = (active) => `rounded border py-1.5 text-xs font-bold ${active ? 'border-sky-500 bg-sky-600 text-black' : 'border-zinc-700 text-zinc-300 hover:border-sky-600'}`;

  return (
    <section className="space-y-2 rounded-lg border border-zinc-800 bg-zinc-950 p-3">
      <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
        Névoa de guerra {on && `(${revealed} blocos descobertos)`}
      </p>

      <label className="flex items-center gap-2 text-xs text-zinc-300">
        <input type="checkbox" checked={on} onChange={(e) => save({ on: e.target.checked })} />
        Ligada neste mapa
      </label>

      {on && (
        <>
          <div className="flex items-center gap-2 text-xs text-zinc-300">
            <label className="flex flex-1 items-center gap-2">
              <input type="checkbox" checked={auto} onChange={(e) => save({ auto: e.target.checked })} />
              Personagens descobrem ao andar
            </label>
            <label className="flex items-center gap-1 text-[10px] text-zinc-500" title="Quantos blocos em volta do personagem ele enxerga">
              Visão
              <input type="number" min="1" max="30" value={vision} disabled={!auto}
                onChange={(e) => save({ vision: Math.max(1, Math.min(30, Number(e.target.value) || 6)) })}
                className="w-12 rounded border border-zinc-700 bg-zinc-900 px-1 py-0.5 text-xs text-white disabled:opacity-40" />
            </label>
          </div>

          <label className="flex items-center gap-2 text-xs text-zinc-300" title="Árvores, casas, muros e pedras grandes (itens altos que bloqueiam) tapam a visão">
            <input type="checkbox" checked={config.walls !== false} disabled={!auto} onChange={(e) => save({ walls: e.target.checked })} />
            Cenário alto tapa a visão
          </label>

          <div className="grid grid-cols-2 gap-1">
            <button type="button" className={btn(tool === 'reveal')} onClick={() => setTool(tool === 'reveal' ? null : 'reveal')}>👁️ Revelar</button>
            <button type="button" className={btn(tool === 'hide')} onClick={() => setTool(tool === 'hide' ? null : 'hide')}>🌫️ Cobrir</button>
          </div>

          <div className="flex items-center gap-1 text-[10px] text-zinc-500">
            Tamanho do pincel:
            {[1, 3, 5].map((size) => (
              <button key={size} type="button" onClick={() => setBrush(size)}
                className={`rounded border px-2 py-0.5 text-[11px] font-bold ${brush === size ? 'border-sky-500 text-white' : 'border-zinc-700 text-zinc-400'}`}>
                {size}×{size}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-1">
            <button type="button" onClick={() => { if (window.confirm('Revelar o mapa inteiro para os jogadores?')) save({ cells: fog.allCells() }); }}
              className="rounded border border-zinc-700 py-1.5 text-xs font-bold text-zinc-400 hover:border-sky-600 hover:text-white">
              Revelar tudo
            </button>
            <button type="button" onClick={() => { if (window.confirm('Cobrir o mapa inteiro de novo?')) save({ cells: [] }); }}
              className="rounded border border-zinc-700 py-1.5 text-xs font-bold text-zinc-400 hover:border-red-600 hover:text-red-300">
              Cobrir tudo
            </button>
          </div>

          {tool && (
            <p className="text-[11px] text-sky-200">Clique e arraste no mapa para {tool === 'reveal' ? 'revelar' : 'cobrir'}. Clique no botão de novo para parar.</p>
          )}
          <p className="text-[10px] text-zinc-600">
            Você vê a névoa transparente; os jogadores veem preto e não enxergam quem está dentro dela. Cada mapa tem a sua névoa.
          </p>
        </>
      )}
      {error && <p className="text-[11px] text-red-400">Erro ao salvar: {error}</p>}
    </section>
  );
}
