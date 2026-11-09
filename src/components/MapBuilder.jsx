import { useEffect, useState } from 'react';
import { supabase } from '../services/supabase/client';
import { uploadImage } from '../services/Storage';

const EMPTY_LAYOUT = { cols: 2, rows: 2, tileSize: 2048, overlap: 64, tiles: {} };
const selectClass = 'w-full rounded border border-zinc-700 bg-zinc-900 px-1 py-1 text-sm text-white';

/**
 * Montador de mapa por pedaços (rooms.map_layout).
 * Cada mudança é salva na hora e aparece para todos na mesa.
 */
export default function MapBuilder({ roomId }) {
  const [layout, setLayout] = useState(undefined); // undefined = carregando · null = desligado
  const [gridSize, setGridSize] = useState(64);
  const [busyKey, setBusyKey] = useState(null);

  useEffect(() => {
    supabase.from('rooms').select('map_layout, grid_size').eq('id', roomId).single()
      .then(({ data, error }) => {
        if (error) console.error('Erro ao carregar o mapa por pedaços:', error);
        setLayout(data?.map_layout || null);
        setGridSize(data?.grid_size || 64);
      });
  }, [roomId]);

  const save = async (next) => {
    setLayout(next);
    const { error } = await supabase.from('rooms').update({ map_layout: next }).eq('id', roomId);
    if (error) alert('Erro ao salvar o mapa: ' + error.message);
  };

  const setOption = (field, value) => {
    const next = { ...layout, [field]: Number(value) };
    // Tirar colunas/linhas remove os pedaços que ficaram de fora.
    next.tiles = Object.fromEntries(
      Object.entries(next.tiles || {}).filter(([key]) => {
        const [col, row] = key.split(',').map(Number);
        return col < next.cols && row < next.rows;
      })
    );
    save(next);
  };

  const uploadTile = async (key, file) => {
    setBusyKey(key);
    try {
      const url = await uploadImage(file, 'maps');
      await save({ ...layout, tiles: { ...layout.tiles, [key]: url } });
    } catch (error) {
      alert('Erro ao enviar o pedaço: ' + error.message);
    }
    setBusyKey(null);
  };

  /** Vários arquivos de uma vez: preenchem os espaços vazios em ordem (pelo nome do arquivo). */
  const uploadMany = async (fileList) => {
    const files = [...fileList].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    const emptyKeys = [];
    for (let row = 0; row < layout.rows; row += 1) {
      for (let col = 0; col < layout.cols; col += 1) {
        if (!layout.tiles[`${col},${row}`]) emptyKeys.push(`${col},${row}`);
      }
    }

    setBusyKey('many');
    let tiles = { ...layout.tiles };
    try {
      for (let i = 0; i < Math.min(files.length, emptyKeys.length); i += 1) {
        tiles = { ...tiles, [emptyKeys[i]]: await uploadImage(files[i], 'maps') };
      }
      await save({ ...layout, tiles });
    } catch (error) {
      alert('Erro ao enviar os pedaços: ' + error.message);
    }
    setBusyKey(null);
  };

  const removeTile = (key) => {
    const tiles = { ...layout.tiles };
    delete tiles[key];
    save({ ...layout, tiles });
  };

  if (layout === undefined) return null;

  if (!layout) {
    return (
      <section className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
        <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Mapa por pedaços</p>
        <p className="mb-2 text-[11px] text-zinc-500">Monte um mapa grande juntando várias imagens, como um quebra-cabeça.</p>
        <button onClick={() => save(EMPTY_LAYOUT)} className="w-full rounded bg-zinc-800 py-2 text-xs font-bold hover:bg-zinc-700">
          Começar mapa por pedaços
        </button>
      </section>
    );
  }

  const step = layout.tileSize - layout.overlap;
  const width = layout.cols * step + layout.overlap;
  const cellsPerTile = Math.floor(layout.tileSize / gridSize);
  const filled = Object.keys(layout.tiles || {}).length;

  return (
    <section className="space-y-2 rounded-lg border border-zinc-800 bg-zinc-950 p-3">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Mapa por pedaços</p>
        <span className="text-[10px] text-zinc-500">{filled}/{layout.cols * layout.rows} pedaços</span>
      </div>

      <div className="grid grid-cols-4 gap-1">
        <label className="text-[10px] text-zinc-500">Colunas
          <select value={layout.cols} onChange={(e) => setOption('cols', e.target.value)} className={selectClass}>
            {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <label className="text-[10px] text-zinc-500">Linhas
          <select value={layout.rows} onChange={(e) => setOption('rows', e.target.value)} className={selectClass}>
            {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <label className="text-[10px] text-zinc-500">Pedaço (px)
          <select value={layout.tileSize} onChange={(e) => setOption('tileSize', e.target.value)} className={selectClass}>
            {[1024, 2048, 3072, 4096].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <label className="text-[10px] text-zinc-500">Emenda
          <select value={layout.overlap} onChange={(e) => setOption('overlap', e.target.value)} className={selectClass}>
            {[0, 32, 64, 128, 256].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
      </div>

      {/* Grade dos pedaços: clique para enviar/trocar */}
      <div className="grid gap-0.5" style={{ gridTemplateColumns: `repeat(${layout.cols}, minmax(0, 1fr))` }}>
        {Array.from({ length: layout.rows }).map((_, row) =>
          Array.from({ length: layout.cols }).map((__, col) => {
            const key = `${col},${row}`;
            const url = layout.tiles[key];
            return (
              <div key={key} className="group relative aspect-square overflow-hidden rounded border border-zinc-800 bg-zinc-900">
                {url && <img src={url} alt="" className="h-full w-full object-cover" />}
                <label className="absolute inset-0 flex cursor-pointer items-center justify-center text-[10px] font-bold text-zinc-400 hover:bg-black/50 hover:text-white">
                  {busyKey === key ? '…' : url ? <span className="opacity-0 group-hover:opacity-100">trocar</span> : `${col + 1},${row + 1}`}
                  <input type="file" accept="image/*" className="hidden" disabled={Boolean(busyKey)}
                    onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ''; if (file) uploadTile(key, file); }} />
                </label>
                {url && (
                  <button type="button" onClick={() => removeTile(key)} title="Remover pedaço"
                    className="absolute right-0.5 top-0.5 hidden rounded bg-black/70 px-1 text-[10px] text-red-300 group-hover:block">✕</button>
                )}
              </div>
            );
          })
        )}
      </div>

      <label className="block cursor-pointer rounded border border-dashed border-zinc-700 py-1.5 text-center text-xs font-bold text-zinc-400 hover:border-red-600 hover:text-white">
        {busyKey === 'many' ? 'Enviando…' : '+ Enviar vários (preenche em ordem pelo nome)'}
        <input type="file" accept="image/*" multiple className="hidden" disabled={Boolean(busyKey)}
          onChange={(e) => { const files = e.target.files; if (files?.length) uploadMany(files); e.target.value = ''; }} />
      </label>

      <p className="text-[10px] leading-snug text-zinc-600">
        Cada pedaço tem {cellsPerTile}×{cellsPerTile} células · mapa total ≈ {Math.floor(width / gridSize)} células de largura.
        Nomeie os arquivos em ordem (ex.: 01, 02, 03…) para usar o envio múltiplo.
      </p>

      <button type="button" onClick={() => { if (window.confirm('Desativar o mapa por pedaços? A mesa volta para o mapa de imagem única.')) save(null); }}
        className="w-full text-[10px] text-zinc-600 hover:text-red-300">
        Desativar mapa por pedaços
      </button>
    </section>
  );
}