import { supabase } from './supabase/client';

/**
 * Altera só uma parte de rooms.scene_env, lendo a versão mais nova antes de gravar
 * (assim não apaga o que outro painel acabou de salvar).
 *
 *   patchSceneEnv(roomId, (env) => ({ props_locked: true }))
 *
 * A função recebe o scene_env atual e devolve só os campos que mudam.
 * Retorna { env, error } — env já com a mudança.
 */
export async function patchSceneEnv(roomId, change) {
  const { data, error: readError } = await supabase.from('rooms').select('scene_env').eq('id', roomId).single();
  if (readError) return { env: null, error: readError };
  const current = data?.scene_env || {};
  const env = { ...current, ...change(current) };
  const { error } = await supabase.from('rooms').update({ scene_env: env }).eq('id', roomId);
  return { env, error };
}

/** Grava a névoa de um mapa (scene_env.fog_maps[key]), mantendo o resto. */
export function patchFog(roomId, key, changes) {
  return patchSceneEnv(roomId, (env) => {
    const maps = env.fog_maps || {};
    return { fog_maps: { ...maps, [key]: { on: false, auto: true, vision: 6, cells: [], ...(maps[key] || {}), ...changes } } };
  });
}
