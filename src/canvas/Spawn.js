// =====================================================================
// Onde aparece o que é adicionado no mapa: no meio da tela de quem clicou.
//
// O CanvasEngine se registra aqui quando abre a sala. Os painéis (NPCs,
// itens de cenário, ficha, token simples) pedem as posições com spawnPoints().
// Os blocos já ocupados são pulados, em espiral a partir do centro.
// =====================================================================

let activeEngine = null;

export function setActiveEngine(engine) {
  activeEngine = engine;
}

export function clearActiveEngine(engine) {
  if (activeEngine === engine) activeEngine = null;
}

/** O mapa aberto (os painéis leem a névoa e a trava do cenário por aqui). */
export const getEngine = () => activeEngine;

/** Mapa em uso (itens e NPCs novos ficam presos a ele). */
export const activeMapId = () => activeEngine?.activeMapId || null;

/** Ponto de luz deste mapa? (sem mapId = luz antiga, aparece em todos) */
export const lightOnMap = (light, mapId) => !light?.mapId || !mapId || light.mapId === mapId;

/** Terreno difícil do mapa (scene_env.terrain_maps[mapId]); o antigo (scene_env.terrain) vale onde o mapa não tem o seu. */
export const terrainFor = (env, mapId) => (mapId && env?.terrain_maps?.[mapId]) || env?.terrain || [];

/** Acrescenta o mapa em uso no `sprite` de um token novo. */
export function withActiveMap(sprite) {
  const mapId = activeMapId();
  return mapId ? { ...(sprite || {}), mapId } : sprite;
}

/**
 * Retorna `count` posições (centro do bloco) perto do meio da tela.
 * Sem mapa aberto, cai no bloco (2, 2) como antes.
 */
export function spawnPoints(count = 1, gridSize = 64) {
  const engine = activeEngine;
  const g = engine?.gridSize || gridSize;
  const center = (col, row) => ({ x: col * g + g / 2, y: row * g + g / 2 });

  if (!engine?.viewport || !engine.app) {
    return Array.from({ length: count }, (_, i) => center(2 + i, 2));
  }

  const { width, height } = engine.app.screen;
  const scale = engine.viewport.scale.x || 1;
  const worldX = (width / 2 - engine.viewport.x) / scale;
  const worldY = (height / 2 - engine.viewport.y) / scale;
  if (!Number.isFinite(worldX) || !Number.isFinite(worldY)) {
    return Array.from({ length: count }, (_, i) => center(2 + i, 2));
  }
  const start = { col: Math.floor(worldX / g), row: Math.floor(worldY / g) };

  const occupied = new Set(
    Object.values(engine.tokens || {}).map((t) => `${Math.floor(t.container.x / g)},${Math.floor(t.container.y / g)}`)
  );

  // Espiral quadrada: centro, depois o anel de 1 bloco, depois o de 2…
  const points = [];
  for (let ring = 0; points.length < count && ring < 30; ring += 1) {
    for (let dr = -ring; dr <= ring && points.length < count; dr += 1) {
      for (let dc = -ring; dc <= ring && points.length < count; dc += 1) {
        if (Math.max(Math.abs(dc), Math.abs(dr)) !== ring) continue;
        const col = start.col + dc;
        const row = start.row + dr;
        const key = `${col},${row}`;
        if (occupied.has(key)) continue;
        occupied.add(key);
        points.push(center(col, row));
      }
    }
  }
  return points;
}
