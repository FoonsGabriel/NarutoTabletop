import * as PIXI from 'pixi.js';
import { cellKey } from '../services/Movement';

// Mesmo valor do Engine.js (evita import circular).
const GROUND_Z = -1e9;

/**
 * Terreno difícil (rooms.scene_env.terrain = ["col,row", ...]).
 *
 * Regra: entrar num bloco difícil custa 2 blocos de movimento.
 * Base no livro (págs. 38–39): nadando ou escalando você anda metade do deslocamento.
 * Mato fechado, lama, escombros etc. usam a mesma ideia (decisão do Mestre).
 *
 * O Mestre pinta no mapa: clicar e arrastar marca (ou apaga) os blocos.
 */
export class Terrain {
  constructor(engine) {
    this.engine = engine;
    this.cells = new Set();
    this.editing = false;
    this.mode = 'add'; // 'add' | 'erase'
    this.painting = null; // Set em edição durante o arraste
    this.onChange = null; // (cells: string[]) => void

    this.layer = new PIXI.Graphics();
    this.layer.zIndex = GROUND_Z + 2; // acima do chão/grid, abaixo da área de movimento
    this.layer.eventMode = 'none';
    engine.viewport.addChild(this.layer);
  }

  get g() {
    return this.engine.gridSize;
  }

  /** Custo para entrar na célula. */
  cost(cell) {
    return this.cells.has(cellKey(cell)) ? 2 : 1;
  }

  setCells(list) {
    const next = new Set(Array.isArray(list) ? list : []);
    const same = next.size === this.cells.size && [...next].every((k) => this.cells.has(k));
    if (same || this.painting) return;
    this.cells = next;
    this.draw();
  }

  setEditing({ editing = false, mode = 'add' } = {}) {
    this.editing = Boolean(editing);
    this.mode = mode === 'erase' ? 'erase' : 'add';
    if (!this.editing) this.painting = null;
    this.draw();
  }

  // ---------------- Pintura ----------------

  begin(x, y) {
    this.painting = new Set(this.cells);
    this.paint(x, y);
  }

  paint(x, y) {
    if (!this.painting) return;
    const key = cellKey({ col: Math.floor(x / this.g), row: Math.floor(y / this.g) });
    const had = this.painting.has(key);
    if (this.mode === 'add' && !had) this.painting.add(key);
    else if (this.mode === 'erase' && had) this.painting.delete(key);
    else return;
    this.draw();
  }

  end() {
    if (!this.painting) return;
    this.cells = this.painting;
    this.painting = null;
    this.draw();
    this.onChange?.([...this.cells]);
  }

  get isPainting() {
    return Boolean(this.painting);
  }

  // ---------------- Desenho ----------------

  draw() {
    const g = this.g;
    const cells = this.painting || this.cells;
    this.layer.clear();
    if (!cells.size) return;

    const parsed = [...cells].map((key) => key.split(',').map(Number));
    parsed.forEach(([col, row]) => this.layer.rect(col * g, row * g, g, g));
    this.layer.fill({ color: 0x8b5a2b, alpha: this.editing ? 0.38 : 0.22 });

    // Listras diagonais: dá para ver o terreno mesmo em mapas marrons.
    const step = g / 4;
    parsed.forEach(([col, row]) => {
      const x0 = col * g;
      const y0 = row * g;
      for (let i = step; i < g * 2; i += step) {
        const ax = x0 + Math.max(0, i - g);
        const ay = y0 + Math.min(i, g);
        const bx = x0 + Math.min(i, g);
        const by = y0 + Math.max(0, i - g);
        this.layer.moveTo(ax, ay).lineTo(bx, by);
      }
    });
    this.layer.stroke({ width: 2, color: 0xd6a35c, alpha: this.editing ? 0.6 : 0.35 });
  }

  destroy() {
    this.layer.destroy();
  }
}
