import { useEffect, useState } from 'react';
import { supabase } from '../services/supabase/client';
import { getEngine } from '../canvas/Spawn';
import { fogKey } from '../canvas/Fog';
import { uid } from '../services/Uid';

/**
 * Cenas prontas (rooms.scene_env.scenes): uma "foto" do mapa em uso com
 * clima, hora do dia, luzes, terreno difícil, névoa, itens de cenário e NPCs posicionados.
 * Carregar a cena troca para o mapa dela e coloca tudo de volta.
 */
const AMBIENTE = ['weather', 'intensity', 'time', 'windDir'];

export default function ScenesPanel({ roomId }) {
  const [scenes, setScenes] = useState([]);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const load = async () => {
    const { data } = await supabase.from('rooms').select('scene_env').eq('id', roomId).single();
    setScenes(Array.isArray(data?.scene_env?.scenes) ? data.scene_env.scenes : []);
  };
  useEffect(() => { load(); }, [roomId]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Grava a lista de cenas lendo a sala de novo (não apaga o que outro painel salvou). */
  const saveList = async (list) => {
    const { data: fresh } = await supabase.from('rooms').select('scene_env').eq('id', roomId).single();
    const { error: saveError } = await supabase.from('rooms').update({ scene_env: { ...(fresh?.scene_env || {}), scenes: list } }).eq('id', roomId);
    if (saveError) { setError(saveError.message); return false; }
    setScenes(list);
    return true;
  };

  const saveCurrent = async () => {
    const engine = getEngine();
    if (!engine) return;
    const name = window.prompt('Nome da cena (ex.: Emboscada na Floresta da Morte):');
    if (!name?.trim()) return;
    setBusy('salvar');
    setError('');
    const { data: fresh } = await supabase.from('rooms').select('scene_env').eq('id', roomId).single();
    const env = fresh?.scene_env || {};
    const mapId = engine.activeMapId || null;
    const npcIds = new Set(Object.values(engine.characters).filter((c) => c.is_npc).map((c) => c.id));
    const tokens = Object.values(engine.tokenRows)
      .filter((row) => engine.onActiveMap(row) && (row.sprite?.mode === 'prop' || npcIds.has(row.character_id)))
      .map((row) => ({ name: row.name, x: row.x, y: row.y, sprite: row.sprite, character_id: row.character_id || null, image_url: row.image_url || null }));
    const scene = {
      id: uid(),
      name: name.trim(),
      mapId,
      mapName: (env.saved_maps || []).find((m) => m.id === mapId)?.name || 'Mapa atual',
      ambiente: Object.fromEntries(AMBIENTE.filter((k) => k in env).map((k) => [k, env[k]])),
      lights: (env.lights || []).filter((l) => (l.mapId || null) === mapId || (!l.mapId && !mapId)),
      terrain: (env.terrain_maps || {})[mapId] ?? (mapId ? [] : env.terrain || []),
      fog: (env.fog_maps || {})[fogKey(mapId)] || null,
      tokens,
      createdAt: Date.now(),
    };
    await saveList([...scenes, scene]);
    setBusy('');
  };

  const loadScene = async (scene) => {
    const engine = getEngine();
    if (!engine) return;
    if (!window.confirm(`Carregar "${scene.name}"? Os itens de cenário e os NPCs que estão agora no mapa "${scene.mapName}" serão trocados pelos da cena. Personagens dos jogadores não mudam.`)) return;
    setBusy(scene.id);
    setError('');
    const { data: fresh } = await supabase.from('rooms').select('scene_env, map_url, map_layout').eq('id', roomId).single();
    const env = { ...(fresh?.scene_env || {}) };
    const map = (env.saved_maps || []).find((m) => m.id === scene.mapId);
    const mapId = scene.mapId || null;

    // 1) Ambiente, luzes, terreno e névoa deste mapa.
    Object.assign(env, scene.ambiente || {});
    env.lights = [...(env.lights || []).filter((l) => (l.mapId || null) !== mapId), ...(scene.lights || [])];
    if (mapId) env.terrain_maps = { ...(env.terrain_maps || {}), [mapId]: scene.terrain || [] };
    else env.terrain = scene.terrain || [];
    if (scene.fog) env.fog_maps = { ...(env.fog_maps || {}), [fogKey(mapId)]: scene.fog };
    if (mapId) env.active_map_id = mapId;

    const patch = { scene_env: env };
    if (map) {
      patch.map_url = map.map_url || null;
      patch.map_layout = Object.keys(map.map_layout?.tiles || {}).length ? map.map_layout : null;
    }
    const { error: roomError } = await supabase.from('rooms').update(patch).eq('id', roomId);
    if (roomError) { setError(roomError.message); setBusy(''); return; }

    // 2) Tira os itens e NPCs atuais desse mapa e coloca os da cena.
    const { data: rows } = await supabase.from('map_tokens').select('id, sprite, character_id').eq('room_id', roomId);
    const { data: chars } = await supabase.from('characters').select('id, is_npc').eq('room_id', roomId);
    const npc = new Set((chars || []).filter((c) => c.is_npc).map((c) => c.id));
    const exists = new Set((chars || []).map((c) => c.id));
    const old = (rows || []).filter((r) => (r.sprite?.mapId || null) === mapId && (r.sprite?.mode === 'prop' || npc.has(r.character_id)));
    if (old.length) await supabase.from('map_tokens').delete().in('id', old.map((r) => r.id));
    old.forEach((r) => engine.removeToken?.(r.id));

    const insert = (scene.tokens || [])
      .filter((t) => !t.character_id || exists.has(t.character_id)) // NPC apagado depois: fica de fora
      .map((t) => ({ room_id: roomId, name: t.name, x: t.x, y: t.y, character_id: t.character_id, image_url: t.image_url, sprite: { ...(t.sprite || {}), ...(mapId ? { mapId } : {}) } }));
    if (insert.length) {
      const { error: insertError } = await supabase.from('map_tokens').insert(insert);
      if (insertError) setError(insertError.message);
    }
    setBusy('');
  };

  const rename = async (scene) => {
    const name = window.prompt('Nome da cena:', scene.name);
    if (!name?.trim()) return;
    await saveList(scenes.map((s) => (s.id === scene.id ? { ...s, name: name.trim() } : s)));
  };

  const remove = async (scene) => {
    if (!window.confirm(`Apagar a cena "${scene.name}"? (o mapa não muda)`)) return;
    await saveList(scenes.filter((s) => s.id !== scene.id));
  };

  return (
    <section className="space-y-2 rounded-lg border border-zinc-800 bg-zinc-950 p-3">
      <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Cenas prontas</p>
      {scenes.length === 0 && <p className="text-[11px] text-zinc-500">Monte o mapa (clima, luzes, névoa, itens, NPCs) e salve como cena para carregar depois com um clique.</p>}
      <ul className="space-y-1">
        {scenes.map((scene) => (
          <li key={scene.id} className="flex items-center gap-1 rounded border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-xs">
            <div className="min-w-0 flex-1">
              <p className="truncate font-bold text-zinc-100">{scene.name}</p>
              <p className="truncate text-[10px] text-zinc-500">{scene.mapName} · {(scene.tokens || []).length} itens/NPCs · {(scene.lights || []).length} luzes</p>
            </div>
            <button type="button" disabled={Boolean(busy)} onClick={() => loadScene(scene)} className="rounded bg-red-600 px-2 py-1 font-bold text-white disabled:opacity-50">
              {busy === scene.id ? '…' : 'Carregar'}
            </button>
            <button type="button" onClick={() => rename(scene)} className="px-1 text-zinc-400 hover:text-white" title="Renomear">✎</button>
            <button type="button" onClick={() => remove(scene)} className="px-1 text-zinc-500 hover:text-red-300" title="Apagar">✕</button>
          </li>
        ))}
      </ul>
      <button type="button" disabled={Boolean(busy)} onClick={saveCurrent} className="w-full rounded border border-zinc-700 py-1.5 text-xs font-bold text-zinc-200 hover:border-red-600 disabled:opacity-50">
        {busy === 'salvar' ? 'Salvando…' : '💾 Salvar o mapa atual como cena'}
      </button>
      {error && <p className="text-[11px] text-red-400">Erro: {error}</p>}
    </section>
  );
}
