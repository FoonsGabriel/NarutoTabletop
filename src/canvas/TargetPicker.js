import * as PIXI from 'pixi.js';

// Mesmos valores do Engine.js (evita import circular).
const GROUND_Z = -1e9;
const HUD_Z = 1e9;

/**
 * Mira de ataque no mapa (estilo Fire Emblem):
 *  - blocos vermelhos = alcance do ataque a partir de quem ataca (diagonal = 1 bloco);
 *  - passar o mouse num alvo válido mostra o arco do atacante até ele;
 *  - clicar no alvo escolhe; Esc ou clique direito cancela.
 */
export class TargetPicker {
  constructor(engine) {
    this.engine = engine;
    this.active = null;

    this.area = new PIXI.Graphics();
    this.area.zIndex = GROUND_Z + 4;
    this.area.eventMode = 'none';

    this.arc = new PIXI.Graphics();
    this.arc.zIndex = HUD_Z - 1;
    this.arc.eventMode = 'none';

    engine.viewport.addChild(this.area, this.arc);

    this.handleKey = (event) => {
      if (event.key === 'Escape' && this.active) this.cancel();
    };
    window.addEventListener('keydown', this.handleKey);
  }

  get g() {
    return this.engine.gridSize;
  }

  cellOf(token) {
    return { col: Math.floor(token.container.x / this.g), row: Math.floor(token.container.y / this.g) };
  }

  distanceBlocks(a, b) {
    const ca = this.cellOf(a);
    const cb = this.cellOf(b);
    return Math.max(Math.abs(ca.col - cb.col), Math.abs(ca.row - cb.row));
  }

  /**
   * opts: { attackerTokenId, rangeBlocks, isValid(tokenData) → bool, onPick(tokenData), onCancel() }
   *   multi: true → cada clique marca/desmarca um alvo (anel verde) e chama onToggle(ids[]);
   *          a mira continua até o painel confirmar (clear) ou cancelar.
   */
  start(opts) {
    const attacker = this.engine.tokens[opts.attackerTokenId];
    if (!attacker) return false;
    this.active = { ...opts, attacker, hover: null, selected: new Set(opts.selected || []) };
    if (this.engine.app?.canvas) this.engine.app.canvas.style.cursor = 'crosshair';
    this.drawArea();
    return true;
  }

  inRange(token) {
    if (!this.active || token === this.active.attacker) return false;
    return this.distanceBlocks(this.active.attacker, token) <= this.active.rangeBlocks;
  }

  isValid(token) {
    return this.inRange(token) && token.mode !== 'prop' && (this.active.isValid?.(token.data) ?? true);
  }

  drawArea() {
    const { attacker, rangeBlocks } = this.active;
    const g = this.g;
    const c = this.cellOf(attacker);
    this.area.clear();

    // Alcance grande: só o contorno (desenhar centenas de blocos pesa).
    if (rangeBlocks > 12) {
      this.area.rect((c.col - rangeBlocks) * g, (c.row - rangeBlocks) * g, (rangeBlocks * 2 + 1) * g, (rangeBlocks * 2 + 1) * g);
      this.area.fill({ color: 0xef4444, alpha: 0.1 });
      this.area.stroke({ width: 3, color: 0xef4444, alpha: 0.7 });
    } else {
      for (let dc = -rangeBlocks; dc <= rangeBlocks; dc += 1) {
        for (let dr = -rangeBlocks; dr <= rangeBlocks; dr += 1) {
          if (!dc && !dr) continue;
          this.area.rect((c.col + dc) * g + 3, (c.row + dr) * g + 3, g - 6, g - 6);
        }
      }
      this.area.fill({ color: 0xef4444, alpha: 0.24 });
    }

    // Alvos válidos ganham um quadrado amarelo.
    Object.values(this.engine.tokens).forEach((token) => {
      if (!this.isValid(token)) return;
      const tc = this.cellOf(token);
      this.area.rect(tc.col * g + 2, tc.row * g + 2, g - 4, g - 4);
    });
    this.area.stroke({ width: 3, color: 0xfacc15, alpha: 0.9 });

    // Alvos já marcados (modo vários alvos).
    if (this.active.selected.size) {
      this.active.selected.forEach((id) => {
        const token = this.engine.tokens[id];
        if (!token) return;
        this.area.circle(token.container.x, token.container.y, g * 0.45);
      });
      this.area.stroke({ width: 5, color: 0x22c55e, alpha: 0.95 });
    }
  }

  /** Passou o mouse por cima de um token. */
  hoverToken(token) {
    if (!this.active) return;
    this.active.hover = token && this.isValid(token) ? token : null;
    this.drawArc();
  }

  drawArc() {
    this.arc.clear();
    const target = this.active?.hover;
    if (!target) return;
    const a = this.active.attacker.container;
    const b = target.container;
    const lift = this.g * 0.6; // na altura do peito
    const ax = a.x;
    const ay = a.y - lift;
    const bx = b.x;
    const by = b.y - lift;
    const cx = (ax + bx) / 2;
    const cy = Math.min(ay, by) - Math.max(this.g, Math.hypot(bx - ax, by - ay) * 0.35);
    this.arc.moveTo(ax, ay).quadraticCurveTo(cx, cy, bx, by).stroke({ width: 4, color: 0xf97316, alpha: 0.9 });
    this.arc.circle(bx, by, 7).fill({ color: 0xfacc15 });
  }

  /** Clique num token durante a mira. Retorna true se tratou o clique. */
  clickToken(token) {
    if (!this.active) return false;
    if (!this.isValid(token)) return true; // fora do alcance: ignora o clique
    if (this.active.multi) {
      const { selected } = this.active;
      if (selected.has(token.data.id)) selected.delete(token.data.id);
      else selected.add(token.data.id);
      this.drawArea();
      this.active.onToggle?.([...selected]);
      return true;
    }
    const { onPick } = this.active;
    this.clear();
    onPick?.(token.data);
    return true;
  }

  cancel() {
    const onCancel = this.active?.onCancel;
    this.clear();
    onCancel?.();
  }

  clear() {
    this.active = null;
    this.area.clear();
    this.arc.clear();
    if (this.engine.app?.canvas) this.engine.app.canvas.style.cursor = '';
  }

  get isActive() {
    return Boolean(this.active);
  }

  destroy() {
    window.removeEventListener('keydown', this.handleKey);
    this.area.destroy();
    this.arc.destroy();
  }
}
