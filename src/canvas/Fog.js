import * as PIXI from 'pixi.js';
import { cellKey } from '../services/Movement';

// Mesmo valor de HUD_Z do Engine.js: a névoa fica por cima de personagens, cenário,
// clima e luz, mas abaixo dos nomes/barras (que a gente esconde quando estão na névoa).
const HUD_Z = 1e9;
const PX_PER_CELL = 2;      // 2 pixels por bloco: a borda fica suave sem pesar
const VISION_EVERY_MS = 250;

/** Chave do mapa em scene_env.fog_maps (sem mapa definido = '_'). */
export const fogKey = (mapId) => mapId || '_';

/**
 * Névoa de guerra (rooms.scene_env.fog_maps[mapa] = { on, auto, vision, cells }).
 *
 *  - cells: blocos já descobertos ("col,row"). O resto fica coberto.
 *  - auto: os personagens dos jogadores descobrem o que está a `vision` blocos deles.
 *  - Jogador: a névoa é preta e esconde tokens, nomes e barras.
 *  - Mestre: a névoa é translúcida (ele vê tudo e sabe o que está coberto).
 *
 * Desenho: uma imagem minúscula (2 px por bloco) esticada no mapa. O filtro linear
 * da placa de vídeo deixa a borda suave de graça, e só redesenha quando muda.
 */
export class Fog {
  constructor(engine) {
    this.engine = engine;
    this.maps = {};           // scene_env.fog_maps
    this.cells = new Set();   // blocos descobertos do mapa em uso
    this.pending = false;     // o Mestre tem mudança ainda não salva
    this.version = 0;         // muda a cada alteração (a zona de perigo usa)
    this.bounds = { width: 3000, height: 3000 };
    this.editing = false;
    this.mode = 'reveal';     // 'reveal' | 'hide'
    this.brush = 1;           // 1, 3 ou 5 blocos
    this.painting = false;
    this.elapsed = 0;
    this.lastCells = {};      // último bloco de cada personagem (só recalcula se mudou)
    this.onChange = null;     // (key, cells[]) => void — o Room salva (só o Mestre)

    this.canvas = document.createElement('canvas');
    this.canvas.width = 2;
    this.canvas.height = 2;
    this.ctx = this.canvas.getContext('2d');
    this.texture = PIXI.Texture.from(this.canvas);
    this.texture.source.scaleMode = 'linear';

    this.sprite = new PIXI.Sprite(this.texture);
    this.sprite.zIndex = HUD_Z - 3;
    this.sprite.eventMode = 'none';
    this.sprite.visible = false;
    engine.viewport.addChild(this.sprite);
  }

  get g() {
    return this.engine.gridSize;
  }

  get key() {
    return fogKey(this.engine.activeMapId);
  }

  get config() {
    return this.maps[this.key] || {};
  }

  /** Névoa ligada no mapa em uso? */
  get active() {
    return Boolean(this.config.on);
  }

  // ---------------- Dados ----------------

  setMaps(maps) {
    const wasActive = this.active;
    this.maps = maps && typeof maps === 'object' ? maps : {};
    // Jogador: soma de novo o que o próprio personagem enxerga agora (sem piscar).
    // Mestre: respeita o que ele cobriu com o pincel; só recalcula quando a névoa liga.
    this.load(!this.engine.isGM || (!wasActive && this.active));
  }

  /** Lê os blocos do mapa em uso (ao trocar de mapa ou ao chegar dado novo). */
  load(force = true) {
    if (this.pending || this.painting) return; // mudança do Mestre ainda não salva: não sobrescreve
    this.cells = new Set(Array.isArray(this.config.cells) ? this.config.cells : []);
    if (force) {
      this.lastCells = {};
      this.revealAroundPlayers(true);
    }
    this.draw();
  }

  setBounds(width, height) {
    this.bounds = { width: Math.max(1, width), height: Math.max(1, height) };
    this.draw();
  }

  get cols() {
    return Math.ceil(this.bounds.width / this.g);
  }

  get rows() {
    return Math.ceil(this.bounds.height / this.g);
  }

  /** Todos os blocos do mapa (para "Revelar tudo"). */
  allCells() {
    const list = [];
    for (let row = 0; row < this.rows; row += 1) for (let col = 0; col < this.cols; col += 1) list.push(`${col},${row}`);
    return list;
  }

  isRevealedAt(x, y) {
    if (!this.active) return true;
    return this.cells.has(cellKey({ col: Math.floor(x / this.g), row: Math.floor(y / this.g) }));
  }

  /** O jogador não deve ver este token (está na névoa)? O Mestre sempre vê. */
  hidesToken(token) {
    if (!this.active || this.engine.isGM) return false;
    return !this.isRevealedAt(token.container.x, token.container.y);
  }

  // ---------------- Visão dos personagens ----------------

  tick(deltaMS) {
    if (!this.active) return;
    this.elapsed += deltaMS;
    if (this.elapsed < VISION_EVERY_MS) return;
    this.elapsed = 0;
    this.revealAroundPlayers();
    this.applyTokenVisibility();
  }

  /**
   * Blocos que tapam a visão: itens de cenário altos (árvore, casa, muro, pedra grande)
   * que bloqueiam passagem. Fogueira, lanterna e itens baixos não tapam.
   */
  sightBlockers() {
    const set = new Set();
    Object.values(this.engine.tokens).forEach((token) => {
      if (token.mode !== 'prop') return;
      const sprite = token.sprite || {};
      if (sprite.blocks === false || sprite.builtin) return;
      if (Number(sprite.heightCells || 2) < 1.5) return;
      set.add(`${Math.floor(token.container.x / this.g)},${Math.floor(token.container.y / this.g)}`);
    });
    return set;
  }

  /** Linha reta (Bresenham) do personagem até o bloco: algo alto no meio tapa a visão. */
  canSee(c0, r0, c1, r1, blockers) {
    if (!blockers.size) return true;
    let x = c0;
    let y = r0;
    const dx = Math.abs(c1 - c0);
    const dy = -Math.abs(r1 - r0);
    const sx = c0 < c1 ? 1 : -1;
    const sy = r0 < r1 ? 1 : -1;
    let err = dx + dy;
    while (!(x === c1 && y === r1)) {
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x += sx; }
      if (e2 <= dx) { err += dx; y += sy; }
      if (x === c1 && y === r1) break; // o próprio bloco do alvo aparece (você vê a árvore)
      if (blockers.has(`${x},${y}`)) return false;
    }
    return true;
  }

  /** Descobre os blocos em volta dos personagens dos jogadores (círculo de `vision` blocos). */
  revealAroundPlayers(force = false) {
    if (!this.active || this.config.auto === false || this.painting) return;
    const radius = Math.max(1, Number(this.config.vision) || 6);
    const blockers = this.config.walls === false ? new Set() : this.sightBlockers();
    let added = 0;

    Object.values(this.engine.tokens).forEach((token) => {
      if (!this.engine.isVisionToken?.(token.data)) return;
      const col = Math.floor(token.container.x / this.g);
      const row = Math.floor(token.container.y / this.g);
      const here = `${col},${row}`;
      if (!force && this.lastCells[token.data.id] === here) return;
      this.lastCells[token.data.id] = here;

      for (let dr = -radius; dr <= radius; dr += 1) {
        for (let dc = -radius; dc <= radius; dc += 1) {
          if (dc * dc + dr * dr > radius * radius + radius) continue; // círculo
          const key = `${col + dc},${row + dr}`;
          if (this.cells.has(key)) continue;
          if (!this.canSee(col, row, col + dc, row + dr, blockers)) continue;
          this.cells.add(key);
          added += 1;
        }
      }
    });

    if (!added) return;
    this.draw();
    // Só o Mestre grava (evita várias pessoas salvando ao mesmo tempo).
    if (this.engine.isGM) this.scheduleSave();
  }

  scheduleSave() {
    this.pending = true;
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      this.pending = false;
      this.onChange?.(this.key, [...this.cells]);
    }, 1200);
  }

  /** Esconde nomes e barras de quem está na névoa (o corpo já fica coberto pela névoa). */
  applyTokenVisibility() {
    Object.values(this.engine.tokens).forEach((token) => {
      if (token.hud) token.hud.renderable = !this.hidesToken(token);
    });
  }

  // ---------------- Pincel do Mestre ----------------

  setEditing({ editing = false, mode = 'reveal', brush = 1 } = {}) {
    this.editing = Boolean(editing);
    this.mode = mode === 'hide' ? 'hide' : 'reveal';
    this.brush = [1, 3, 5].includes(Number(brush)) ? Number(brush) : 1;
    if (!this.editing) this.painting = false;
    this.draw();
  }

  begin(x, y) {
    this.painting = true;
    this.paint(x, y);
  }

  paint(x, y) {
    if (!this.painting) return;
    const col = Math.floor(x / this.g);
    const row = Math.floor(y / this.g);
    const half = Math.floor(this.brush / 2);
    let changed = false;
    for (let dr = -half; dr <= half; dr += 1) {
      for (let dc = -half; dc <= half; dc += 1) {
        const key = `${col + dc},${row + dr}`;
        if (this.mode === 'reveal' && !this.cells.has(key)) { this.cells.add(key); changed = true; }
        if (this.mode === 'hide' && this.cells.has(key)) { this.cells.delete(key); changed = true; }
      }
    }
    if (changed) this.draw();
  }

  end() {
    if (!this.painting) return;
    this.painting = false;
    this.pending = false;
    clearTimeout(this.saveTimer);
    this.onChange?.(this.key, [...this.cells]);
  }

  get isPainting() {
    return this.painting;
  }

  // ---------------- Desenho ----------------

  draw() {
    this.version += 1;
    if (!this.active) {
      this.sprite.visible = false;
      this.applyTokenVisibility();
      return;
    }

    const cols = this.cols;
    const rows = this.rows;
    const w = cols * PX_PER_CELL;
    const h = rows * PX_PER_CELL;
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
      this.texture.source.resize(w, h);
    }

    const ctx = this.ctx;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#05070b';
    ctx.fillRect(0, 0, w, h);
    this.cells.forEach((key) => {
      const [col, row] = key.split(',').map(Number);
      if (col < 0 || row < 0 || col >= cols || row >= rows) return;
      ctx.clearRect(col * PX_PER_CELL, row * PX_PER_CELL, PX_PER_CELL, PX_PER_CELL);
    });
    this.texture.source.update();

    // Mestre: vê através (mais forte enquanto pinta, para enxergar o que está coberto).
    this.sprite.alpha = this.engine.isGM ? (this.editing ? 0.6 : 0.45) : 1;
    this.sprite.position.set(0, 0);
    this.sprite.width = cols * this.g;
    this.sprite.height = rows * this.g;
    this.sprite.visible = true;
    this.applyTokenVisibility();
  }

  destroy() {
    clearTimeout(this.saveTimer);
    this.sprite.destroy();
    this.texture.destroy(true);
  }
}
