import * as PIXI from 'pixi.js';
import { cellKey, findPath, pathCost, reachableCells, METROS_POR_BLOCO } from '../services/Movement';

// Mesmos valores do Engine.js (evita import circular).
const GROUND_Z = -1e9;
const HUD_Z = 1e9;

/**
 * Planejador de movimento no mapa.
 *
 *  - Arrastar o token: ele vai pelo menor caminho até onde você soltar (desviando de obstáculos).
 *  - Tocar no token (sem arrastar): entra no modo "caminho". Cada toque no mapa marca uma
 *    curva (zigue-zague); tocar de novo no último ponto confirma; tocar no token ou Esc cancela.
 *
 * As regras (quanto pode andar, se é o turno) vêm do Room.jsx por engine.moveRules(tokenData):
 *   null                         → movimento livre (fora de combate)
 *   { canMove: false, reason }   → não pode mover agora
 *   { remaining, deslocBlocks, strict, commit(blocks) }
 */
export class MovePlanner {
  constructor(engine) {
    this.engine = engine;
    this.plan = null;

    this.layer = new PIXI.Graphics();
    this.layer.zIndex = GROUND_Z + 3; // acima do grid, abaixo dos personagens
    this.layer.eventMode = 'none';

    this.labelLayer = new PIXI.Container();
    this.labelLayer.zIndex = HUD_Z + 2;
    this.labelLayer.eventMode = 'none';
    this.label = new PIXI.Text({
      text: '',
      style: { fontSize: 15, fontWeight: 'bold', fill: 0xffffff, stroke: { color: 0x000000, width: 4 } },
    });
    this.label.anchor.set(0.5, 1);
    this.labelLayer.addChild(this.label);

    engine.viewport.addChild(this.layer, this.labelLayer);

    this.flashTimer = null;
    this.handleKey = (event) => {
      if (event.key === 'Escape' && this.plan) this.cancel();
    };
    window.addEventListener('keydown', this.handleKey);
  }

  get g() {
    return this.engine.gridSize;
  }

  cellAt(x, y) {
    return { col: Math.floor(x / this.g), row: Math.floor(y / this.g) };
  }

  /** Custo de entrar no bloco: 2 em terreno difícil, 1 no resto. */
  costOf = (cell) => this.engine.terrain?.cost(cell) ?? 1;

  center(cell) {
    return { x: cell.col * this.g + this.g / 2, y: cell.row * this.g + this.g / 2 };
  }

  // ---------------------------------------------------------------
  // Obstáculos
  // ---------------------------------------------------------------

  /** Quem ocupa cada célula (menos o próprio token que está andando). */
  buildOccupancy(movingToken) {
    const occupied = new Map();
    const side = (token) => {
      const character = this.engine.characters[token.data.character_id];
      if (!character) return 'neutro';
      return character.is_npc ? 'npc' : 'pc';
    };
    Object.values(this.engine.tokens).forEach((token) => {
      if (token === movingToken) return;
      const cell = this.cellAt(token.container.x, token.container.y);
      const isProp = token.mode === 'prop';
      // Itens de cenário bloqueiam, a menos que o Mestre desligue (sprite.blocks = false).
      if (isProp && token.sprite.blocks === false) return;
      occupied.set(cellKey(cell), { prop: isProp, side: isProp ? null : side(token) });
    });
    return { occupied, mySide: side(movingToken) };
  }

  /** Passar pela célula: itens bloqueiam; personagens do outro lado bloqueiam; aliados deixam passar. */
  isBlocked(cell) {
    const info = this.plan?.occupancy.occupied.get(cellKey(cell));
    if (!info) return false;
    if (info.prop) return true;
    return info.side !== this.plan.occupancy.mySide || info.side === 'neutro';
  }

  /** Terminar na célula: não pode parar em cima de ninguém. */
  canEnd(cell) {
    return !this.plan?.occupancy.occupied.has(cellKey(cell));
  }

  // ---------------------------------------------------------------
  // Fluxo
  // ---------------------------------------------------------------

  /** Começa a planejar o movimento de um token. Retorna false se não pode mover. */
  start(token) {
    const rules = this.engine.moveRules?.(token.data) ?? null;
    if (rules && rules.canMove === false) {
      this.flash(rules.reason || 'Não pode mover agora.', token.container.x, token.container.y - this.g);
      return false;
    }

    const origin = this.cellAt(token.container.x, token.container.y);
    this.plan = {
      token,
      rules,
      origin,
      waypoints: [],
      hover: null,
      tapMode: false,
      occupancy: this.buildOccupancy(token),
    };
    const remaining = rules?.remaining;
    this.plan.reach = Number.isFinite(remaining)
      ? reachableCells(origin, remaining, (cell) => this.isBlocked(cell), this.costOf)
      : null;
    this.draw();
    return true;
  }

  /** Caminho completo: origem → curvas → ponto final. null se algum trecho é impossível. */
  buildPath(endCell) {
    if (!this.plan) return null;
    const points = [...this.plan.waypoints, endCell].filter(Boolean);
    let from = this.plan.origin;
    const path = [];
    for (const point of points) {
      const segment = findPath(from, point, (cell) => this.isBlocked(cell), 80, this.costOf);
      if (!segment) return null;
      path.push(...segment);
      from = point;
    }
    return path;
  }

  preview(x, y) {
    if (!this.plan) return;
    const cell = this.cellAt(x, y);
    if (this.plan.hover && cellKey(this.plan.hover) === cellKey(cell)) return;
    this.plan.hover = cell;
    this.draw();
  }

  /** Avalia um destino: caminho, custo e se é permitido. */
  evaluate(endCell) {
    const path = this.buildPath(endCell);
    if (!path) return { ok: false, reason: 'Sem caminho até lá.' };
    const cost = pathCost(path, this.costOf);
    const end = path.length ? path[path.length - 1] : this.plan.origin;
    if (cost && !this.canEnd(end)) return { ok: false, path, cost, reason: 'Já tem alguém nesse bloco.' };
    const rules = this.plan.rules;
    if (rules?.strict && cost > rules.remaining) {
      return { ok: false, path, cost, reason: `Longe demais: ${cost} de ${rules.remaining} blocos.` };
    }
    return { ok: true, path, cost };
  }

  /** Soltou o token arrastado. */
  finishDrag(x, y) {
    if (!this.plan) return { ok: false };
    const cell = this.cellAt(x, y);

    // Soltou no mesmo lugar: vira modo "caminho" (toques marcam as curvas).
    if (cellKey(cell) === cellKey(this.plan.origin) && !this.plan.waypoints.length) {
      this.plan.tapMode = true;
      this.plan.hover = null;
      this.draw();
      this.flash('Toque nos blocos para traçar o caminho. Toque de novo no último para ir.', x, y - this.g * 1.6, 3500);
      return { ok: false, tapMode: true };
    }
    return this.commit(cell);
  }

  /** Toque no mapa durante o modo "caminho". */
  handleTap(x, y) {
    if (!this.plan?.tapMode) return false;
    const cell = this.cellAt(x, y);
    const last = this.plan.waypoints[this.plan.waypoints.length - 1];

    if (cellKey(cell) === cellKey(this.plan.origin)) {
      this.cancel();
      return true;
    }
    if (last && cellKey(last) === cellKey(cell)) {
      this.plan.waypoints.pop();
      this.commit(cell);
      return true;
    }

    const path = this.buildPath(cell);
    if (!path) {
      this.flash('Sem caminho até lá.', x, y - this.g);
      return true;
    }
    this.plan.waypoints.push(cell);
    this.plan.hover = null;
    this.draw();
    return true;
  }

  /** Remove a última curva (clique direito no modo caminho). */
  undoWaypoint() {
    if (!this.plan?.tapMode) return false;
    if (this.plan.waypoints.length) this.plan.waypoints.pop();
    else this.cancel();
    this.draw();
    return true;
  }

  commit(cell) {
    const result = this.evaluate(cell);
    const { token, rules } = this.plan;
    // Fora de combate o movimento é livre: sem caminho possível, coloca direto no bloco.
    if (!result.ok && !rules) {
      token.walkPath([this.center(cell)], { save: true, direct: true });
      this.clear();
      return { ok: true, cost: 0 };
    }
    if (!result.ok) {
      const at = this.center(cell);
      this.flash(result.reason, at.x, at.y - this.g);
      token.walkPath([]); // volta para a origem
      this.clear();
      return result;
    }

    const points = result.path.map((c) => this.center(c));
    token.walkPath(points, { save: true });
    if (rules?.commit && result.cost) rules.commit(result.cost);
    this.clear();
    return result;
  }

  cancel() {
    this.plan?.token.walkPath([]);
    this.clear();
  }

  clear() {
    this.plan = null;
    this.layer.clear();
    if (!this.flashTimer) this.label.text = '';
  }

  get isPlanning() {
    return Boolean(this.plan);
  }

  get isTapMode() {
    return Boolean(this.plan?.tapMode);
  }

  // ---------------------------------------------------------------
  // Desenho
  // ---------------------------------------------------------------

  draw() {
    const plan = this.plan;
    this.layer.clear();
    if (!plan) return;
    const g = this.g;

    // Área alcançável (só quando há limite de movimento).
    if (plan.reach) {
      plan.reach.forEach((dist, key) => {
        if (!dist) return;
        const [col, row] = key.split(',').map(Number);
        if (!this.canEnd({ col, row })) return;
        this.layer.rect(col * g + 3, row * g + 3, g - 6, g - 6);
      });
      this.layer.fill({ color: 0x38bdf8, alpha: 0.3 });
    }

    // Caminho até o ponto sob o cursor (ou até a última curva no modo caminho).
    const end = plan.hover || plan.waypoints[plan.waypoints.length - 1] || null;
    const result = end ? this.evaluate(end) : null;
    const path = result?.path || [];
    const limit = plan.rules?.strict ? plan.rules.remaining : Infinity;

    const start = this.center(plan.origin);
    if (path.length) {
      this.layer.moveTo(start.x, start.y);
      path.forEach((c) => {
        const p = this.center(c);
        this.layer.lineTo(p.x, p.y);
      });
      this.layer.stroke({ width: 4, color: result.ok ? 0xfacc15 : 0xef4444, alpha: 0.85 });
      // Setas em cada bloco apontando para onde o personagem vai; a última é maior.
      let spent = 0;
      let prev = start;
      path.forEach((c, i) => {
        spent += this.costOf(c);
        const p = this.center(c);
        const ang = Math.atan2(p.y - prev.y, p.x - prev.x);
        const last = i === path.length - 1;
        const size = last ? 13 : 7;
        const tip = { x: p.x + Math.cos(ang) * size, y: p.y + Math.sin(ang) * size };
        const left = { x: p.x + Math.cos(ang + 2.5) * size, y: p.y + Math.sin(ang + 2.5) * size };
        const right = { x: p.x + Math.cos(ang - 2.5) * size, y: p.y + Math.sin(ang - 2.5) * size };
        this.layer.moveTo(tip.x, tip.y).lineTo(left.x, left.y).lineTo(p.x - Math.cos(ang) * size * 0.25, p.y - Math.sin(ang) * size * 0.25).lineTo(right.x, right.y).closePath();
        this.layer.fill({ color: spent <= limit ? 0xfacc15 : 0xef4444, alpha: 0.95 });
        if (last) this.layer.stroke({ width: 2, color: 0x000000, alpha: 0.6 });
        prev = p;
      });
    }

    // Curvas do zigue-zague.
    plan.waypoints.forEach((c) => {
      const p = this.center(c);
      this.layer.circle(p.x, p.y, 10).stroke({ width: 3, color: 0xffffff, alpha: 0.95 });
    });

    // Contador: "6 bl · 12 m / 11".
    if (end && !this.flashTimer) {
      const p = this.center(end);
      const cost = result?.cost ?? pathCost(path, this.costOf);
      const extra = cost > path.length ? ` (+${cost - path.length} terreno)` : '';
      const total = Number.isFinite(plan.rules?.remaining) ? ` / ${plan.rules.remaining}` : '';
      this.label.text = result?.ok === false && result.reason && !cost
        ? result.reason
        : `${cost} bl${total} · ${path.length * METROS_POR_BLOCO} m${extra}`;
      this.label.style.fill = result?.ok === false ? 0xfca5a5 : 0xffffff;
      this.label.position.set(p.x, p.y - g * 0.55);
    } else if (!this.flashTimer) {
      this.label.text = '';
    }
  }

  /** Mensagem curta no mapa (some sozinha). */
  flash(text, x, y, ms = 2200) {
    clearTimeout(this.flashTimer);
    this.label.text = text;
    this.label.style.fill = 0xfde68a;
    this.label.position.set(x, y);
    this.flashTimer = setTimeout(() => {
      this.flashTimer = null;
      if (!this.label.destroyed) this.label.text = '';
      this.draw();
    }, ms);
  }

  destroy() {
    window.removeEventListener('keydown', this.handleKey);
    clearTimeout(this.flashTimer);
    this.layer.destroy();
    this.labelLayer.destroy({ children: true });
  }
}
