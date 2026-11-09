import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../services/supabase/client';
import { uploadImage } from '../services/Storage';
import { uid } from '../services/Uid';

/**
 * Biblioteca de mapas da sala (rooms.scene_env.saved_maps).
 *   [{ id, name, map_url, map_layout }]
 *
 * O mapa ativo é o que está em rooms.map_url / rooms.map_layout
 * (mapa por pedaços tem prioridade sobre a imagem única, por isso trocar
 * sempre grava os dois campos juntos).
 */
export default function MapLibrary({ roomId }) {
  const [room, setRoom] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loose, setLoose] = useState([]); // itens/NPCs antigos sem mapa definido
  const [looseTarget, setLooseTarget] = useState('');

  // Itens de cenário e NPCs colocados antes da biblioteca existir não têm mapa:
  // aparecem em todos. O Mestre diz a qual mapa eles pertencem.
  const loadLoose = useCallback(async () => {
    const [{ data: tokens }, { data: chars }] = await Promise.all([
      supabase.from('map_tokens').select('id, name, sprite, character_id').eq('room_id', roomId),
      supabase.from('characters').select('id, is_npc').eq('room_id', roomId),
    ]);
    const npc = new Set((chars || []).filter((c) => c.is_npc).map((c) => c.id));
    setLoose((tokens || []).filter((t) => !t.sprite?.mapId && (t.sprite?.mode === 'prop' || !t.character_id || npc.has(t.character_id))));
  }, [roomId]);

  const load = useCallback(async () => {
    const { data } = await supabase.from('rooms').select('map_url, map_layout, scene_env').eq('id', roomId).single();
    if (data) setRoom(data);
  }, [roomId]);

  useEffect(() => {
    load();
    loadLoose();
    const channel = supabase.channel(`map_library_${roomId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` }, (payload) => {
        setRoom((current) => ({ ...(current || {}), map_url: payload.new.map_url, map_layout: payload.new.map_layout, scene_env: payload.new.scene_env }));
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'map_tokens', filter: `room_id=eq.${roomId}` }, () => loadLoose())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [roomId, load, loadLoose]);

  if (!room) return <p className="text-xs text-zinc-500">Carregando mapas…</p>;

  const saved = Array.isArray(room.scene_env?.saved_maps) ? room.scene_env.saved_maps : [];
  const hasTiles = (map) => Object.keys(map?.map_layout?.tiles || {}).length > 0;
  const sameMap = (a, b) => (hasTiles(a) || hasTiles(b)
    ? JSON.stringify(a?.map_layout?.tiles || {}) === JSON.stringify(b?.map_layout?.tiles || {})
    : (a?.map_url || '') === (b?.map_url || ''));
  const active = { map_url: room.map_url, map_layout: room.map_layout };
  const activeId = room.scene_env?.active_map_id || null;
  const activeSaved = saved.find((m) => m.id === activeId) || saved.find((m) => sameMap(m, active));
  const activeIsEmpty = !room.map_url && !hasTiles(active);
  // Luzes e terreno antigos (de antes de cada mapa ter os seus).
  const looseLights = (room.scene_env?.lights || []).filter((l) => !l.mapId);
  const looseTerrain = (room.scene_env?.terrain || []).length;
  const looseCount = loose.length + looseLights.length + (looseTerrain ? 1 : 0);

  /** Grava o mapa ativo e a lista, sempre lendo a sala de novo (não apaga mudanças de outros painéis). */
  const save = async ({ next, list }) => {
    setBusy(true);
    setError('');
    const { data: fresh } = await supabase.from('rooms').select('scene_env').eq('id', roomId).single();
    const sceneEnv = { ...(fresh?.scene_env || {}), saved_maps: list };
    const patch = { scene_env: sceneEnv };
    if (next) {
      patch.map_url = next.map_url || null;
      patch.map_layout = hasTiles(next) ? next.map_layout : null;
      sceneEnv.active_map_id = next.id; // itens e NPCs deste mapa aparecem; os dos outros somem
    }
    const { error: updateError } = await supabase.from('rooms').update(patch).eq('id', roomId);
    if (updateError) setError(updateError.message);
    else setRoom((current) => ({ ...current, ...patch }));
    setBusy(false);
  };

  /** Coloca o mapa atual na lista (se ainda não estiver), para não se perder na troca. */
  const withCurrent = (list) => {
    if (activeIsEmpty) return list;
    // O mapa em uso já está na lista: atualiza a cópia (ex.: pedaços mudados no montador).
    if (activeSaved) {
      return list.map((m) => (m.id === activeSaved.id ? { ...m, map_url: active.map_url || null, map_layout: hasTiles(active) ? active.map_layout : null } : m));
    }
    const name = hasTiles(active) ? 'Mapa por pedaços (anterior)' : 'Mapa anterior';
    return [...list, { id: uid(), name, map_url: active.map_url || null, map_layout: hasTiles(active) ? active.map_layout : null }];
  };

  const handleUpload = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setBusy(true);
    try {
      const url = await uploadImage(file, 'maps');
      const entry = { id: uid(), name: file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' '), map_url: url, map_layout: null };
      await save({ next: entry, list: [...withCurrent(saved), entry] });
    } catch (uploadError) {
      setError(uploadError.message);
      setBusy(false);
    }
  };

  const use = (map) => save({ next: map, list: withCurrent(saved) });

  const rename = (map) => {
    const name = window.prompt('Nome do mapa:', map.name);
    if (!name?.trim()) return;
    save({ list: saved.map((m) => (m.id === map.id ? { ...m, name: name.trim() } : m)) });
  };

  const remove = (map) => {
    if (!window.confirm(`Tirar "${map.name}" da lista? (o mapa ativo não muda)`)) return;
    save({ list: saved.filter((m) => m.id !== map.id) });
  };

  const saveCurrent = () => {
    const name = window.prompt('Nome para guardar o mapa atual:', hasTiles(active) ? 'Konoha' : 'Mapa');
    if (!name?.trim()) return;
    const entry = { id: uid(), name: name.trim(), map_url: active.map_url || null, map_layout: hasTiles(active) ? active.map_layout : null };
    save({ next: entry, list: [...saved, entry] });
  };

  const assignLoose = async () => {
    const target = looseTarget || saved[0]?.id;
    if (!target || !looseCount) return;
    setBusy(true);
    const results = await Promise.all(loose.map((t) => supabase.from('map_tokens').update({ sprite: { ...(t.sprite || {}), mapId: target } }).eq('id', t.id)));
    const failed = results.find((r) => r.error);
    if (failed) setError(failed.error.message);

    // Luzes e terreno antigos vão para o mapa escolhido; e salas antigas ganham o "mapa em uso".
    const { data: fresh } = await supabase.from('rooms').select('scene_env').eq('id', roomId).single();
    const env = { ...(fresh?.scene_env || {}) };
    env.lights = (env.lights || []).map((l) => (l.mapId ? l : { ...l, mapId: target }));
    if ((env.terrain || []).length) {
      const maps = { ...(env.terrain_maps || {}) };
      maps[target] = [...new Set([...(maps[target] || []), ...env.terrain])];
      env.terrain_maps = maps;
      env.terrain = [];
    }
    if (!env.active_map_id && activeSaved) env.active_map_id = activeSaved.id;
    const { error: envError } = await supabase.from('rooms').update({ scene_env: env }).eq('id', roomId);
    if (envError) setError(envError.message);
    else setRoom((current) => ({ ...current, scene_env: env }));

    await loadLoose();
    setBusy(false);
  };

  return (
    <section className="space-y-2 rounded-lg border border-zinc-800 bg-zinc-950 p-3">
      <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Mapas da campanha ({saved.length})</p>

      <ul className="space-y-1">
        {saved.map((map) => {
          const isActive = activeSaved?.id === map.id;
          return (
            <li key={map.id} className={`flex items-center gap-2 rounded border px-2 py-1.5 text-xs ${isActive ? 'border-emerald-700 bg-emerald-950/30' : 'border-zinc-800'}`}>
              <span className="shrink-0">{hasTiles(map) ? '🧩' : '🗺️'}</span>
              <button type="button" onClick={() => rename(map)} title="Renomear" className="min-w-0 flex-1 truncate text-left font-bold hover:underline">{map.name}</button>
              {isActive
                ? <span className="shrink-0 text-[10px] font-bold text-emerald-300">em uso</span>
                : <button type="button" disabled={busy} onClick={() => use(map)} className="shrink-0 rounded bg-red-700 px-2 py-0.5 text-[11px] font-bold hover:bg-red-600 disabled:opacity-40">Usar</button>}
              {!isActive && <button type="button" onClick={() => remove(map)} title="Tirar da lista" className="shrink-0 px-1 text-zinc-500 hover:text-red-400">✕</button>}
            </li>
          );
        })}
        {!activeSaved && !activeIsEmpty && (
          <li className="flex items-center gap-2 rounded border border-emerald-700 bg-emerald-950/30 px-2 py-1.5 text-xs">
            <span>{hasTiles(active) ? '🧩' : '🗺️'}</span>
            <span className="min-w-0 flex-1 truncate font-bold">Mapa atual (não guardado)</span>
            <button type="button" disabled={busy} onClick={saveCurrent} className="shrink-0 rounded border border-emerald-600 px-2 py-0.5 text-[11px] font-bold text-emerald-200 hover:bg-emerald-900/40">Guardar</button>
          </li>
        )}
      </ul>

      {looseCount > 0 && saved.length > 0 && (
        <div className="space-y-1 rounded border border-amber-700 bg-amber-950/30 p-2 text-[11px] text-amber-100">
          <p>
            ⚠ Coisas antigas aparecem em todos os mapas:
            {loose.length > 0 && ` ${loose.length} ${loose.length === 1 ? 'item/NPC' : 'itens/NPCs'}`}
            {looseLights.length > 0 && `${loose.length ? ',' : ''} ${looseLights.length} ${looseLights.length === 1 ? 'luz' : 'luzes'}`}
            {looseTerrain > 0 && `${loose.length || looseLights.length ? ',' : ''} terreno difícil (${looseTerrain} blocos)`}.
            {' '}A qual mapa pertencem?
          </p>
          <div className="flex gap-1">
            <select value={looseTarget || saved[0]?.id} onChange={(e) => setLooseTarget(e.target.value)}
              className="min-w-0 flex-1 rounded border border-zinc-700 bg-zinc-900 px-1 py-1 text-xs text-white">
              {saved.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
            <button type="button" disabled={busy} onClick={assignLoose} className="shrink-0 rounded bg-amber-600 px-2 py-1 font-bold text-black hover:bg-amber-500 disabled:opacity-40">Aplicar</button>
          </div>
          <p className="text-[10px] text-amber-200/70">{loose.slice(0, 6).map((t) => t.name || 'Item').join(', ')}{loose.length > 6 ? '…' : ''}</p>
        </div>
      )}

      <label className={`block cursor-pointer rounded-lg border border-dashed border-zinc-700 py-2.5 text-center text-xs font-bold text-zinc-300 hover:border-red-600 hover:text-white ${busy ? 'pointer-events-none opacity-50' : ''}`}>
        {busy ? 'Salvando…' : '📁 Novo mapa (imagem única) — vira o mapa em uso'}
        <input type="file" accept="image/*" onChange={handleUpload} className="hidden" disabled={busy} />
      </label>
      {error && <p className="text-[11px] text-red-400">Erro: {error}</p>}
      <p className="text-[10px] text-zinc-600">
        Ao trocar, o mapa anterior fica guardado aqui. Os tokens continuam no lugar (mova-os se precisar).
      </p>
    </section>
  );
}
