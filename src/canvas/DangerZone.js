import * as PIXI from 'pixi.js';
import { cellKey, deslocamentoBlocos, reachableCells } from '../services/Movement';
import { combatProfile } from '../services/Attack';

// Mesmo valor do Engine.js (evita import circular).
const GROUND_Z = -1e9;

/**
 * Zona de perigo: onde os inimigos (NPCs) conseguem atacar no próximo turno.
 *
 *  - Cada NPC anda 1 ação de Movimento (deslocamento, pág. 262) e ataca com a Padrão.
 *  - Vermelho: alcance corpo a corpo (alcance pelo tamanho, pág. 272).
 *  - Laranja: só à distância (arremesso, arco…), pelo alcance da arma.
 *  - Terreno difícil e obstáculos contam; jogadores bloqueiam a passagem dos NPCs.
 */
export class DangerZone {
  constructor(engine) {
    this.engine = engine;
    this.enabled = false;
    this.signature = '';
    this.elapsed = 0;

    this.layer = new PIXI.Graphics();
    this.layer.zIndex = GROUND_Z + 2.5; // acima do terreno, abaixo da área de movimento
    this.layer.eventMode = 'none';
    engine.viewport.addChild(this.layer);
  }

  get g() {
    return this.engine.gridSize;
  }

  setEnabled(on) {
    this.enabled = Boolean(on);
    this.signature = '';
    if (this.enabled) this.refresh();
    else this.layer.clear();
  }

  /** Recalcula só quando algo mudou (posições, Vitalidade, terreno). */
  tick(deltaMS) {
    if (!this.enabled) return;
    this.elapsed += deltaMS;
    if (this.elapsed < 400) return;
    this.elapsed = 0;
    const signature = this.makeSignature();
    if (signature !== this.signature) this.refresh(signature);
  }

  makeSignature() {
    const { tokens, characters, terrain } = this.engine;
    const parts = Object.values(tokens).map((t) => {
      const c = characters[t.data.character_id];
      return `${t.data.id}:${Math.floor(t.container.x / this.g)},${Math.floor(t.container.y / this.g)}:${c?.hp_current ?? ''}:${c?.updated_at ?? ''}`;
    });
    return `${parts.sort().join('|')}#${terrain?.cells.size || 0}#${this.g}#${this.engine.fog?.version || 0}`;
  }

  cellOf(token) {
    return { col: Math.floor(token.container.x / this.g), row: Math.floor(token.container.y / this.g) };
  }

  refresh(signature = this.makeSignature()) {
    this.signature = signature;
    const { tokens, characters, terrain } = this.engine;
    const all = Object.values(tokens);

    // Quem ocupa cada bloco.
    const occupied = new Map();
    all.forEach((token) => {
      if (token.mode === 'prop' && token.sprite?.blocks === false) return;
      const character = characters[token.data.character_id];
      occupied.set(cellKey(this.cellOf(token)), token.mode === 'prop' ? 'prop' : character?.is_npc ? 'npc' : 'pc');
    });

    const melee = new Set();
    const ranged = new Set();
    const costOf = (cell) => terrain?.cost(cell) ?? 1;

    all.forEach((token) => {
      if (token.mode === 'prop') return;
      const character = characters[token.data.character_id];
      if (!character?.is_npc) return;
      if (Number(character.hp_current ?? 1) <= 0) return; // fora de combate
      if (this.engine.fog?.hidesToken(token)) return; // inimigo escondido na névoa não se entrega

      const profile = combatProfile(character);
      const meleeReach = Math.max(0, ...profile.attacks.filter((a) => a.modo.tipo === 'cc').map((a) => Number(a.modo.alcanceBlocos) || 1));
      const rangedReach = Math.max(0, ...profile.attacks.filter((a) => a.modo.tipo !== 'cc').map((a) => Number(a.modo.alcanceBlocos) || 0));
      if (!meleeReach && !rangedReach) return;

      const start = this.cellOf(token);
      const startKey = cellKey(start);
      const blocked = (cell) => {
        const who = occupied.get(cellKey(cell));
        return who === 'prop' || who === 'pc';
      };
      const reach = reachableCells(start, deslocamentoBlocos(character), blocked, costOf);

      // Onde ele pode parar: bloco livre ou o próprio lugar.
      const stops = [];
      reach.forEach((_, key) => {
        if (key === startKey || !occupied.has(key)) stops.push(key.split(',').map(Number));
      });

      // Só a borda da área precisa ser "espalhada" pelo alcance (bem mais rápido).
      const stopSet = new Set(stops.map(([c, r]) => `${c},${r}`));
      const border = stops.filter(([c, r]) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dc, dr]) => !stopSet.has(`${c + dc},${r + dr}`)));

      stopSet.forEach((key) => melee.add(key));
      spread(border, meleeReach, melee);
      if (rangedReach > meleeReach) spread(border, rangedReach, ranged);
    });

    this.draw(melee, ranged);
  }

  draw(melee, ranged) {
    const g = this.g;
    this.layer.clear();
    const rangedOnly = [...ranged].filter((key) => !melee.has(key));

    const fillCells = (keys, color, alpha) => {
      if (!keys.length) return;
      keys.forEach((key) => {
        const [col, row] = key.split(',').map(Number);
        this.layer.rect(col * g, row * g, g, g);
      });
      this.layer.fill({ color, alpha });
    };
    // Contorno: só os lados que encostam fora da área (fica legível em qualquer mapa).
    const outline = (set, color, alpha) => {
      if (!set.size) return;
      set.forEach((key) => {
        const [col, row] = key.split(',').map(Number);
        const x = col * g;
        const y = row * g;
        if (!set.has(`${col},${row - 1}`)) this.layer.moveTo(x, y).lineTo(x + g, y);
        if (!set.has(`${col},${row + 1}`)) this.layer.moveTo(x, y + g).lineTo(x + g, y + g);
        if (!set.has(`${col - 1},${row}`)) this.layer.moveTo(x, y).lineTo(x, y + g);
        if (!set.has(`${col + 1},${row}`)) this.layer.moveTo(x + g, y).lineTo(x + g, y + g);
      });
      this.layer.stroke({ width: 3, color, alpha });
    };

    fillCells(rangedOnly, 0xf97316, 0.14);
    fillCells([...melee], 0xff1f1f, 0.32);
    if (rangedOnly.length) outline(new Set([...ranged, ...melee]), 0xfb923c, 0.7);
    outline(melee, 0xff3b3b, 0.95);
  }

  destroy() {
    this.layer.destroy();
  }
}

/** Marca todo bloco a até `radius` (diagonal conta 1) de alguma célula de `cells`. */
function spread(cells, radius, out) {
  if (radius <= 0) return;
  cells.forEach(([col, row]) => {
    for (let dc = -radius; dc <= radius; dc += 1) {
      for (let dr = -radius; dr <= radius; dr += 1) out.add(`${col + dc},${row + dr}`);
    }
  });
}
