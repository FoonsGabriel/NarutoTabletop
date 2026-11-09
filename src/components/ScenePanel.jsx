import { useEffect, useRef, useState } from 'react';
import { CATEGORIAS_CENARIO, CENARIO, EFEITOS_CENARIO, spriteDoItem, urlDoItem } from '../data/Cenario';
import { supabase } from '../services/supabase/client';
import { uploadImage } from '../services/Storage';
import MapBuilder from './MapBuilder.jsx';
import { activeMapId, getEngine, lightOnMap, spawnPoints, terrainFor, withActiveMap } from '../canvas/Spawn';
import { patchSceneEnv } from '../services/SceneEnv';

// Itens de teste que vêm junto com o projeto (pasta public/props).

const TIME_OPTIONS = [
  { key: 'dawn', label: '🌅 Amanhecer' },
  { key: 'day', label: '☀️ Dia' },
  { key: 'dusk', label: '🌇 Entardecer' },
  { key: 'night', label: '🌙 Noite' },
];

const WEATHER_OPTIONS = [
  { key: 'clear', label: 'Limpo' },
  { key: 'rain', label: '🌧️ Chuva' },
  { key: 'storm', label: '⛈️ Tempestade' },
  { key: 'snow', label: '❄️ Neve' },
  { key: 'wind', label: '🍃 Vento' },
  { key: 'fog', label: '🌫️ Neblina' },
];

const DEFAULT_ENV = { weather: 'clear', intensity: 0.6, time: 'day', windDir: 1, lights: [] };

// Tipos prontos de ponto de luz (raio em células; 1 célula = 2 m).
const LIGHT_PRESETS = [
  { key: 'poste', label: 'Poste', color: '#ffd27a', radius: 4, flicker: false },
  { key: 'lanterna', label: 'Lanterna', color: '#ff9a4a', radius: 3, flicker: true },
  { key: 'tocha', label: 'Tocha / fogo', color: '#ff7a2a', radius: 5, flicker: true },
  { key: 'luar', label: 'Luar', color: '#9ab8ff', radius: 7, flicker: false },
  { key: 'chakra', label: 'Chakra', color: '#5fd0ff', radius: 3, flicker: true },
];

const newId = () => (window.crypto?.randomUUID ? window.crypto.randomUUID() : `luz-${Date.now()}-${Math.random()}`);

const HUD_OPTIONS = [
  { key: 'show_names', label: 'Nomes' },
  { key: 'show_hp', label: 'Vitalidade' },
  { key: 'show_chakra', label: 'Chakra' },
];

/** Painel do Mestre: o que os jogadores veem no HUD e itens de cenário do mapa. */
const ALL_PARTS = ['hud', 'env', 'lights', 'terrain', 'map', 'props'];

/**
 * parts: quais blocos mostrar — 'hud' (o que os jogadores veem), 'env' (clima e horário),
 * 'lights' (pontos de luz), 'map' (mapa por pedaços), 'props' (itens de cenário).
 */
export default function ScenePanel({ roomId, parts = ALL_PARTS }) {
  const show = (part) => parts.includes(part);
  const hasLights = parts.includes('lights'); // só este bloco conversa com o mapa sobre as luzes
  const hasTerrain = parts.includes('terrain');
  const [terrainMode, setTerrainMode] = useState(null); // null | 'add' | 'erase'
  const [hud, setHud] = useState(null);
  const [env, setEnvState] = useState(null);
  const envRef = useRef(null); // sempre o valor mais novo (os eventos do mapa usam)
  const setEnv = (next) => { envRef.current = next; setEnvState(next); };
  const [envError, setEnvError] = useState('');
  const [lightPreset, setLightPreset] = useState('poste');
  const [editingLights, setEditingLights] = useState(false);
  const [placingLight, setPlacingLight] = useState(false);
  const [selectedLight, setSelectedLight] = useState(null);
  const [gridSize, setGridSize] = useState(64);
  const [busy, setBusy] = useState(false);
  const [upload, setUpload] = useState({ heightCells: 2, anim: 'none', fx: 'nenhum' });
  const [propTab, setPropTab] = useState('natureza');
  const [missing, setMissing] = useState({}); // itens do catálogo sem imagem em public/props

  useEffect(() => {
    supabase.from('rooms').select('hud_settings, grid_size, scene_env').eq('id', roomId).single()
      .then(({ data }) => {
        setHud(data?.hud_settings || { show_hp: true, show_names: true, show_chakra: false });
        setEnv({ ...DEFAULT_ENV, ...(data?.scene_env || {}) });
        setGridSize(data?.grid_size || 64);
      });
  }, [roomId]);

  const toggleHud = async (key) => {
    const next = { ...hud, [key]: !hud[key] };
    setHud(next);
    const { error } = await supabase.from('rooms').update({ hud_settings: next }).eq('id', roomId);
    if (error) alert('Erro ao salvar o HUD: ' + error.message);
  };

  // Clima, horário e luzes: aplica na hora no seu mapa e salva; os jogadores recebem pelo Realtime.
  const applyLocal = (next, freshActive) => {
    // O mapa em uso vem da sala (ou do mapa já aberto), nunca de uma cópia antiga deste painel.
    const detail = { ...next, active_map_id: freshActive !== undefined ? freshActive : activeMapId() };
    setEnv(detail);
    window.dispatchEvent(new CustomEvent('vtt:scene-env-local', { detail }));
  };

  const saveEnv = async (changes) => {
    // A lista de mapas e o mapa em uso são da Biblioteca de mapas: este painel nunca mexe neles.
    // Névoa e trava do cenário também têm donos próprios (FogPanel e o bloco de itens).
    const { saved_maps: _maps, active_map_id: _active, terrain_maps: _terrains, fog_maps: _fog, props_locked: _lock, scenes: _scenes, ...own } = { ...envRef.current, ...changes };
    // Lê a sala de novo antes de gravar, para não apagar o que outros painéis guardaram.
    const { data: fresh } = await supabase.from('rooms').select('scene_env').eq('id', roomId).single();
    const terrainMaps = changes.terrain_maps ?? fresh?.scene_env?.terrain_maps;
    applyLocal({ ...own, ...(terrainMaps ? { terrain_maps: terrainMaps } : {}) }, fresh?.scene_env?.active_map_id ?? activeMapId());
    const merged = { ...(fresh?.scene_env || {}), ...own, ...(terrainMaps ? { terrain_maps: terrainMaps } : {}) };
    const { error } = await supabase.from('rooms').update({ scene_env: merged }).eq('id', roomId);
    setEnvError(error ? error.message : '');
  };

  // ---------- Pontos de luz ----------
  // Luzes do mapa em uso (cada ponto de luz pertence a um mapa).
  const [, setMapTick] = useState(0);
  useEffect(() => {
    const onMap = () => setMapTick((n) => n + 1);
    window.addEventListener('vtt:active-map', onMap);
    return () => window.removeEventListener('vtt:active-map', onMap);
  }, []);
  const currentMap = activeMapId();
  const lights = (env?.lights || []).filter((l) => lightOnMap(l, currentMap));

  const updateLight = (lightId, changes, persist = true) => {
    const next = (envRef.current?.lights || []).map((l) => (l.id === lightId ? { ...l, ...changes } : l));
    if (persist) saveEnv({ lights: next });
    else applyLocal({ ...envRef.current, lights: next });
  };

  const removeLight = (lightId) => {
    saveEnv({ lights: (envRef.current?.lights || []).filter((l) => l.id !== lightId) });
    if (selectedLight === lightId) setSelectedLight(null);
  };

  // Liga/desliga os marcadores e o modo de colocar luz no mapa.
  useEffect(() => {
    if (!hasLights) return;
    window.dispatchEvent(new CustomEvent('vtt:light-edit', { detail: { editing: editingLights, placing: placingLight } }));
  }, [editingLights, placingLight, hasLights]);

  // Ao sair do painel, o mapa volta ao normal.
  useEffect(() => () => {
    if (hasLights) window.dispatchEvent(new CustomEvent('vtt:light-edit', { detail: { editing: false, placing: false } }));
  }, [hasLights]);

  // Eventos que vêm do mapa (clique para colocar, arrastar, selecionar).
  useEffect(() => {
    if (!hasLights) return undefined;
    const onPlaced = (event) => {
      const preset = LIGHT_PRESETS.find((p) => p.key === lightPreset) || LIGHT_PRESETS[0];
      const light = { id: newId(), x: event.detail.x, y: event.detail.y, color: preset.color, radius: preset.radius, flicker: preset.flicker, ...(activeMapId() ? { mapId: activeMapId() } : {}) };
      saveEnv({ lights: [...(envRef.current?.lights || []), light] });
      setSelectedLight(light.id);
    };
    const onMoved = (event) => updateLight(event.detail.id, { x: event.detail.x, y: event.detail.y });
    const onSelected = (event) => setSelectedLight(event.detail.id);

    window.addEventListener('vtt:light-placed', onPlaced);
    window.addEventListener('vtt:light-moved', onMoved);
    window.addEventListener('vtt:light-selected', onSelected);
    return () => {
      window.removeEventListener('vtt:light-placed', onPlaced);
      window.removeEventListener('vtt:light-moved', onMoved);
      window.removeEventListener('vtt:light-selected', onSelected);
    };
  });

  // ---------- Terreno difícil ----------
  useEffect(() => {
    if (!hasTerrain) return;
    window.dispatchEvent(new CustomEvent('vtt:terrain-edit', { detail: { editing: Boolean(terrainMode), mode: terrainMode || 'add' } }));
  }, [terrainMode, hasTerrain]);

  useEffect(() => () => {
    if (hasTerrain) window.dispatchEvent(new CustomEvent('vtt:terrain-edit', { detail: { editing: false } }));
  }, [hasTerrain]);

  useEffect(() => {
    if (!hasTerrain) return undefined;
    const onPainted = (event) => saveTerrain(event.detail.cells);
    window.addEventListener('vtt:terrain-painted', onPainted);
    return () => window.removeEventListener('vtt:terrain-painted', onPainted);
  });

  // Terreno do mapa em uso (scene_env.terrain_maps[mapa]); sem mapa definido, o campo antigo.
  const saveTerrain = async (cells) => {
    const mapId = activeMapId();
    if (!mapId) { saveEnv({ terrain: cells }); return; }
    const { data: fresh } = await supabase.from('rooms').select('scene_env').eq('id', roomId).single();
    saveEnv({ terrain_maps: { ...(fresh?.scene_env?.terrain_maps || {}), [mapId]: cells } });
  };
  const terrainCount = terrainFor(env, currentMap).length;

  // ---------- Trava e limpeza do cenário ----------
  const [propsLocked, setPropsLocked] = useState(() => Boolean(getEngine()?.propsLocked));
  useEffect(() => {
    const sync = () => setPropsLocked(Boolean(getEngine()?.propsLocked));
    window.addEventListener('vtt:scene-flags', sync);
    return () => window.removeEventListener('vtt:scene-flags', sync);
  }, []);

  const toggleLock = async () => {
    const next = !propsLocked;
    setPropsLocked(next);
    getEngine()?.applyFlags({ props_locked: next }); // vale na hora no seu mapa
    const { error } = await patchSceneEnv(roomId, () => ({ props_locked: next }));
    if (error) alert('Erro ao salvar a trava: ' + error.message);
  };

  // Itens de cenário do mapa em uso (inclui os antigos sem mapa, que aparecem em todos).
  const propsHere = () => {
    const engine = getEngine();
    return Object.values(engine?.tokenRows || {}).filter((row) => row.sprite?.mode === 'prop' && engine.onActiveMap(row));
  };

  const clearProps = async () => {
    const rows = propsHere();
    if (!rows.length) { alert('Não há itens de cenário neste mapa.'); return; }
    if (!window.confirm(`Apagar os ${rows.length} itens de cenário deste mapa? Personagens e NPCs ficam.`)) return;
    const ids = rows.map((row) => row.id);
    const { error } = await supabase.from('map_tokens').delete().in('id', ids);
    if (error) { alert('Erro ao apagar: ' + error.message); return; }
    ids.forEach((tokenId) => getEngine()?.removeToken(tokenId)); // some na hora para você
  };

  const addProp = async ({ name, url, heightCells, anim, sprite: preset }) => {
    setBusy(true);
    const [spot] = spawnPoints(1, gridSize); // no meio da tela, num bloco livre
    const { error } = await supabase.from('map_tokens').insert({
      room_id: roomId,
      name,
      x: spot.x,
      y: spot.y,
      width: 1,
      height: 1,
      rotation: 0,
      layer: 'object',
      is_hidden: false,
      is_clone: false,
      sprite: withActiveMap(preset || { mode: 'prop', url, heightCells, anim, fx: upload.fx || 'nenhum', blocks: true }),
    });
    setBusy(false);
    if (error) alert('Erro ao adicionar item: ' + error.message);
  };

  const handleUpload = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setBusy(true);
    try {
      const url = await uploadImage(file, 'props');
      await addProp({ name: file.name.replace(/\.[^.]+$/, ''), url, ...upload });
    } catch (error) {
      alert('Erro ao enviar a imagem: ' + error.message);
    }
    setBusy(false);
  };

  return (
    <div className="space-y-3">
      {/* ---------- HUD ---------- */}
      {show('hud') && <section className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
        <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Jogadores veem acima dos tokens</p>
        {hud && (
          <div className="grid grid-cols-3 gap-1">
            {HUD_OPTIONS.map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => toggleHud(option.key)}
                className={`rounded border py-1.5 text-xs font-bold ${hud[option.key] ? 'border-emerald-700 bg-emerald-950/50 text-emerald-200' : 'border-zinc-700 text-zinc-500 line-through'}`}
              >
                {option.label}
              </button>
            ))}
          </div>
        )}
        <p className="mt-1 text-[10px] text-zinc-600">Você (Mestre) sempre vê tudo.</p>
      </section>}

      {/* ---------- Clima e horário ---------- */}
      {show('env') && env && (
        <section className="space-y-2 rounded-lg border border-zinc-800 bg-zinc-950 p-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Horário</p>
          <div className="grid grid-cols-2 gap-1">
            {TIME_OPTIONS.map((option) => (
              <button key={option.key} type="button" onClick={() => saveEnv({ time: option.key })}
                className={`rounded border py-1.5 text-xs font-bold ${env.time === option.key ? 'border-amber-600 bg-amber-950/50 text-amber-200' : 'border-zinc-700 text-zinc-400 hover:text-white'}`}>
                {option.label}
              </button>
            ))}
          </div>

          <p className="pt-1 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Clima</p>
          <div className="grid grid-cols-3 gap-1">
            {WEATHER_OPTIONS.map((option) => (
              <button key={option.key} type="button" onClick={() => saveEnv({ weather: option.key })}
                className={`rounded border py-1.5 text-[11px] font-bold ${env.weather === option.key ? 'border-sky-600 bg-sky-950/50 text-sky-200' : 'border-zinc-700 text-zinc-400 hover:text-white'}`}>
                {option.label}
              </button>
            ))}
          </div>

          {env.weather !== 'clear' && (
            <div className="grid grid-cols-[1fr_auto] items-end gap-2">
              <label className="text-[10px] text-zinc-500">
                Intensidade: {Math.round(env.intensity * 100)}%
                <input type="range" min="0.2" max="1" step="0.1" value={env.intensity}
                  onChange={(e) => applyLocal({ ...env, intensity: Number(e.target.value) })}
                  onPointerUp={(e) => saveEnv({ intensity: Number(e.currentTarget.value) })}
                  onKeyUp={(e) => saveEnv({ intensity: Number(e.currentTarget.value) })}
                  className="w-full accent-sky-500" />
              </label>
              <button type="button" onClick={() => saveEnv({ windDir: env.windDir === -1 ? 1 : -1 })}
                title="Para que lado o vento sopra"
                className="rounded border border-zinc-700 px-2 py-1 text-xs font-bold text-zinc-300 hover:text-white">
                Vento {env.windDir === -1 ? '←' : '→'}
              </button>
            </div>
          )}
          {envError && (
            <p className="rounded border border-red-800 bg-red-950/50 p-1.5 text-[11px] text-red-200">
              Não salvou: {envError}
              {/scene_env/.test(envError) && ' — rode o clima_horario.sql no Supabase.'}
            </p>
          )}
          <p className="text-[10px] text-zinc-600">
            Só visual. O livro só pune o clima em casos específicos (ex.: rastrear com noite, chuva ou neblina: −4). Aplique quando fizer sentido.
          </p>
        </section>
      )}

      {/* ---------- Pontos de luz ---------- */}
      {show('lights') && env && (
        <section className="space-y-2 rounded-lg border border-zinc-800 bg-zinc-950 p-3">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Pontos de luz ({lights.length})</p>
            <button type="button"
              onClick={() => { setEditingLights(!editingLights); setPlacingLight(false); }}
              className={`rounded border px-2 py-0.5 text-[11px] font-bold ${editingLights ? 'border-amber-600 bg-amber-950/50 text-amber-200' : 'border-zinc-700 text-zinc-400 hover:text-white'}`}>
              {editingLights ? 'Esconder marcadores' : 'Editar luzes'}
            </button>
          </div>

          {editingLights && (
            <>
              <div className="grid grid-cols-3 gap-1">
                {LIGHT_PRESETS.map((preset) => (
                  <button key={preset.key} type="button" onClick={() => setLightPreset(preset.key)}
                    className={`flex items-center gap-1 rounded border px-1 py-1 text-[11px] font-bold ${lightPreset === preset.key ? 'border-amber-600 text-amber-200' : 'border-zinc-700 text-zinc-400 hover:text-white'}`}>
                    <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: preset.color }} />
                    {preset.label}
                  </button>
                ))}
              </div>

              <button type="button" onClick={() => setPlacingLight(!placingLight)}
                className={`w-full rounded border py-1.5 text-xs font-bold ${placingLight ? 'border-amber-500 bg-amber-600 text-black' : 'border-dashed border-zinc-600 text-zinc-300 hover:border-amber-600'}`}>
                {placingLight ? '✓ Clique no mapa para colocar (clique aqui para parar)' : '+ Colocar luz no mapa'}
              </button>

              {lights.length > 0 && (
                <ul className="max-h-48 space-y-1 overflow-y-auto">
                  {lights.map((light, index) => (
                    <li key={light.id}
                      className={`grid grid-cols-[auto_auto_1fr_auto_auto] items-center gap-1.5 rounded border px-1.5 py-1 text-[11px] ${selectedLight === light.id ? 'border-amber-600 bg-amber-950/30' : 'border-zinc-800'}`}>
                      <span className="w-4 text-center font-bold text-zinc-400">{index + 1}</span>
                      <input type="color" value={light.color} title="Cor"
                        onChange={(e) => updateLight(light.id, { color: e.target.value }, false)}
                        onBlur={(e) => updateLight(light.id, { color: e.target.value })}
                        className="h-5 w-6 cursor-pointer rounded border-0 bg-transparent p-0" />
                      <label className="flex items-center gap-1 text-zinc-500">
                        Raio
                        <input type="number" min="1" max="20" step="0.5" value={light.radius}
                          onChange={(e) => updateLight(light.id, { radius: Number(e.target.value) || 1 })}
                          className="w-12 rounded border border-zinc-700 bg-zinc-900 px-1 text-white" />
                      </label>
                      <label className="flex items-center gap-0.5 text-zinc-500" title="Tremular como fogo">
                        <input type="checkbox" checked={Boolean(light.flicker)}
                          onChange={(e) => updateLight(light.id, { flicker: e.target.checked })} />
                        🔥
                      </label>
                      <button type="button" onClick={() => removeLight(light.id)} title="Apagar luz"
                        className="px-1 font-bold text-zinc-500 hover:text-red-400">✕</button>
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-[10px] text-zinc-600">
                Arraste os círculos numerados no mapa para ajustar. A luz só aparece quando escurece (entardecer, noite, chuva, tempestade).
              </p>
            </>
          )}
        </section>
      )}

      {/* ---------- Terreno difícil ---------- */}
      {show('terrain') && env && (
        <section className="space-y-2 rounded-lg border border-zinc-800 bg-zinc-950 p-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Terreno difícil ({terrainCount} blocos)</p>
          <div className="grid grid-cols-3 gap-1">
            {[['add', '🖌️ Pintar'], ['erase', '🧽 Apagar']].map(([mode, label]) => (
              <button key={mode} type="button" onClick={() => setTerrainMode(terrainMode === mode ? null : mode)}
                className={`rounded border py-1.5 text-xs font-bold ${terrainMode === mode ? 'border-amber-500 bg-amber-600 text-black' : 'border-zinc-700 text-zinc-300 hover:border-amber-600'}`}>
                {label}
              </button>
            ))}
            <button type="button" disabled={!terrainCount}
              onClick={() => { if (window.confirm('Apagar todo o terreno difícil deste mapa?')) saveTerrain([]); }}
              className="rounded border border-zinc-700 py-1.5 text-xs font-bold text-zinc-400 hover:border-red-600 hover:text-red-300 disabled:opacity-40">
              Limpar
            </button>
          </div>
          {terrainMode && (
            <p className="text-[11px] text-amber-200">Clique e arraste no mapa para {terrainMode === 'add' ? 'marcar' : 'apagar'}. Clique no botão de novo para parar.</p>
          )}
          <p className="text-[10px] text-zinc-600">
            Cada bloco marcado custa 2 de movimento. Base no livro (págs. 38–39): nadando ou escalando você anda metade do deslocamento. Use para água, escalada, mato fechado, lama, escombros.
          </p>
        </section>
      )}

      {/* ---------- Mapa por pedaços ---------- */}
      {show('map') && <MapBuilder roomId={roomId} />}

      {/* ---------- Itens de cenário ---------- */}
      {show('props') && <section className="space-y-2 rounded-lg border border-zinc-800 bg-zinc-950 p-3">
        <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Itens de cenário</p>

        <div className="grid grid-cols-2 gap-1">
          <button type="button" onClick={toggleLock}
            title="Travado: arrastar um item move a câmera, não o item"
            className={`rounded border py-1.5 text-xs font-bold ${propsLocked ? 'border-amber-500 bg-amber-600 text-black' : 'border-zinc-700 text-zinc-300 hover:border-amber-600'}`}>
            {propsLocked ? '🔒 Cenário travado' : '🔓 Travar cenário'}
          </button>
          <button type="button" onClick={clearProps}
            className="rounded border border-zinc-700 py-1.5 text-xs font-bold text-zinc-400 hover:border-red-600 hover:text-red-300">
            🗑️ Limpar cenário
          </button>
        </div>

        <div className="flex flex-wrap gap-1">
          {CATEGORIAS_CENARIO.map((cat) => (
            <button key={cat.key} type="button" onClick={() => setPropTab(cat.key)}
              className={`rounded border px-2 py-0.5 text-[11px] font-bold ${propTab === cat.key ? 'border-red-600 bg-red-950/50 text-white' : 'border-zinc-700 text-zinc-400 hover:text-white'}`}>
              {cat.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-1">
          {CENARIO.filter((item) => item.categoria === propTab).map((item) => {
            const url = urlDoItem(item);
            const falta = !item.builtin && missing[item.key] === true;
            return (
              <button key={item.key} type="button" disabled={busy || falta} onClick={() => addProp({ name: item.nome, sprite: spriteDoItem(item) })}
                title={falta ? `Coloque a imagem em public/props/${item.arquivo}.png` : item.nome}
                className="relative flex flex-col items-center rounded border border-zinc-700 bg-zinc-900 p-1 text-center text-[10px] font-bold leading-tight hover:border-red-600 disabled:cursor-not-allowed disabled:opacity-45">
                <span className="flex h-10 w-full items-center justify-center">
                  {item.builtin
                    ? <span className="text-2xl">{item.fx === 'fogo' ? '🔥' : item.fx === 'fumaca' ? '💨' : item.fx === 'vagalumes' ? '🪲' : item.fx === 'agua' ? '💧' : '🍃'}</span>
                    : <PropThumb url={url} fallback={item.reserva} onMissing={(m) => setMissing((prev) => (prev[item.key] === m ? prev : { ...prev, [item.key]: m }))} />}
                </span>
                {item.nome}
                {falta && <span className="text-[9px] font-normal text-amber-400">falta imagem</span>}
                {(item.fx && item.fx !== 'nenhum') && !falta && <span className="text-[9px] font-normal text-sky-300">animado</span>}
              </button>
            );
          })}
        </div>
        {CENARIO.some((item) => item.categoria === propTab && missing[item.key]) && (
          <p className="text-[10px] text-amber-300/80">Itens apagados: coloque a imagem em <b>public/props/</b> com o nome indicado (passe o mouse no item).</p>
        )}

        <div className="grid grid-cols-2 gap-1">
          <label className="text-[10px] text-zinc-500">
            Altura (células)
            <input type="number" min="0.5" max="8" step="0.1" value={upload.heightCells}
              onChange={(e) => setUpload({ ...upload, heightCells: Number(e.target.value) })}
              className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm text-white" />
          </label>
          <label className="text-[10px] text-zinc-500">
            Animação
            <select value={upload.anim} onChange={(e) => setUpload({ ...upload, anim: e.target.value })}
              className="w-full rounded border border-zinc-700 bg-zinc-900 px-1 py-1 text-sm text-white">
              <option value="none">Nenhuma</option>
              <option value="sway">Vento</option>
              <option value="flicker">Fogo</option>
            </select>
          </label>
          <label className="col-span-2 text-[10px] text-zinc-500">
            Efeito
            <select value={upload.fx} onChange={(e) => setUpload({ ...upload, fx: e.target.value })}
              className="w-full rounded border border-zinc-700 bg-zinc-900 px-1 py-1 text-sm text-white">
              {EFEITOS_CENARIO.map((fx) => <option key={fx.key} value={fx.key}>{fx.label}</option>)}
            </select>
          </label>
        </div>

        <label className="block cursor-pointer rounded border border-dashed border-zinc-700 py-2 text-center text-xs font-bold text-zinc-400 hover:border-red-600 hover:text-white">
          {busy ? 'Enviando…' : '+ Enviar item (PNG transparente)'}
          <input type="file" accept="image/png,image/webp" onChange={handleUpload} className="hidden" disabled={busy} />
        </label>

        <p className="text-[10px] text-zinc-600">
          O item aparece no meio da sua tela; arraste para posicionar. Clique com o botão direito (ou segure no celular) → Editar para mudar tamanho, efeito, luz e espelhar.
        </p>
      </section>}
    </div>
  );
}

/** Miniatura do item; avisa se a imagem ainda não existe em public/props. */
function PropThumb({ url, fallback, onMissing }) {
  const [src, setSrc] = useState(url);
  return (
    <img
      src={src}
      alt=""
      className="max-h-10 max-w-full object-contain"
      onLoad={() => onMissing(false)}
      onError={() => {
        if (fallback && src !== fallback) { setSrc(fallback); return; }
        onMissing(true);
      }}
    />
  );
}
