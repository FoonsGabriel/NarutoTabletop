import * as PIXI from 'pixi.js';

// Acima de tudo no mapa (inclusive da névoa), abaixo dos menus da página.
const HUD_Z = 1e9;
const PING_MS = 2600;
const ARROW_MS = 4500;

/**
 * Marcadores no mapa: ping (toque) e seta (arrastar), para o Mestre e os jogadores
 * mostrarem "aqui" / "vou por ali". Somem sozinhos.
 *
 * Leve: só desenha enquanto existe marcador na tela; sem marcador, não faz nada.
 * Quem marca avisa os outros pelo canal `marks_<sala>` (ligado no Room.jsx).
 */
export class Marks {
  constructor(engine) {
    this.engine = engine;
    this.layer = new PIXI.Container();
    this.layer.zIndex = HUD_Z + 1;
    this.layer.eventMode = 'none';
    engine.viewport.addChild(this.layer);
    this.items = [];
    this.mode = false;     // botão 📍 ligado: tocar = ping, arrastar = seta
    this.drawing = null;   // seta sendo desenhada
    this.preview = new PIXI.Graphics();
    this.layer.addChild(this.preview);
    this.onMark = null;    // (mark) => void — o Room envia para os outros
    this.color = 0xff8a2b;
    this.name = '';
  }

  setMode(on) {
    this.mode = Boolean(on);
    this.drawing = null;
    this.preview.clear();
    if (this.engine.app?.canvas) this.engine.app.canvas.style.cursor = this.mode ? 'crosshair' : '';
  }

  // ---------------- Toque do usuário ----------------

  begin(x, y) {
    this.drawing = { x, y, x2: x, y2: y };
  }

  move(x, y) {
    if (!this.drawing) return;
    this.drawing.x2 = x;
    this.drawing.y2 = y;
    this.preview.clear();
    this.drawArrow(this.preview, this.drawing, this.color, 0.6);
  }

  end() {
    if (!this.drawing) return;
    const d = this.drawing;
    this.drawing = null;
    this.preview.clear();
    const long = Math.hypot(d.x2 - d.x, d.y2 - d.y) > this.engine.gridSize * 0.6;
    const mark = long
      ? { type: 'arrow', x: d.x, y: d.y, x2: d.x2, y2: d.y2, color: this.color, name: this.name }
      : { type: 'ping', x: d.x, y: d.y, color: this.color, name: this.name };
    this.add(mark);
    this.onMark?.(mark);
  }

  get isDrawing() {
    return Boolean(this.drawing);
  }

  // ---------------- Marcadores na tela ----------------

  add(mark) {
    const g = new PIXI.Graphics();
    this.layer.addChild(g);
    let label = null;
    if (mark.name) {
      label = new PIXI.Text({
        text: mark.name,
        style: { fontFamily: 'Nunito, Arial', fontSize: 13, fontWeight: '800', fill: 0xffffff, stroke: { color: 0x000000, width: 3 } },
      });
      label.anchor.set(0.5, 1);
      const at = mark.type === 'arrow' ? { x: mark.x2, y: mark.y2 } : mark;
      label.position.set(at.x, at.y - this.engine.gridSize * 0.55);
      this.layer.addChild(label);
    }
    this.items.push({ mark, g, label, t: 0, dur: mark.type === 'arrow' ? ARROW_MS : PING_MS });
    // Muitos marcadores ao mesmo tempo: some o mais antigo.
    if (this.items.length > 12) this.remove(this.items[0]);
  }

  remove(item) {
    item.g.destroy();
    item.label?.destroy();
    this.items = this.items.filter((i) => i !== item);
  }

  tick(deltaMS) {
    if (!this.items.length) return;
    [...this.items].forEach((item) => {
      item.t += deltaMS;
      const k = item.t / item.dur;
      if (k >= 1) { this.remove(item); return; }
      const fade = k > 0.75 ? 1 - (k - 0.75) / 0.25 : 1;
      item.g.clear();
      if (item.mark.type === 'arrow') this.drawArrow(item.g, item.mark, item.mark.color, fade);
      else this.drawPing(item.g, item.mark, item.t, fade);
      if (item.label) item.label.alpha = fade;
    });
  }

  drawPing(g, { x, y, color }, t, fade) {
    const r = this.engine.gridSize;
    // Três ondas saindo do ponto + um alfinete no centro.
    for (let i = 0; i < 3; i += 1) {
      const p = ((t / 900) + i / 3) % 1;
      g.circle(x, y, r * (0.2 + p * 0.9)).stroke({ width: 3, color, alpha: (1 - p) * fade });
    }
    g.circle(x, y, r * 0.14).fill({ color, alpha: fade }).stroke({ width: 2, color: 0x000000, alpha: 0.6 * fade });
  }

  drawArrow(g, { x, y, x2, y2 }, color, alpha) {
    const ang = Math.atan2(y2 - y, x2 - x);
    const head = this.engine.gridSize * 0.45;
    const bx = x2 - Math.cos(ang) * head * 0.7;
    const by = y2 - Math.sin(ang) * head * 0.7;
    g.moveTo(x, y).lineTo(bx, by).stroke({ width: 9, color: 0x000000, alpha: 0.35 * alpha, cap: 'round' });
    g.moveTo(x, y).lineTo(bx, by).stroke({ width: 5, color, alpha, cap: 'round' });
    g.moveTo(x2, y2)
      .lineTo(x2 - Math.cos(ang - 0.45) * head, y2 - Math.sin(ang - 0.45) * head)
      .lineTo(x2 - Math.cos(ang + 0.45) * head, y2 - Math.sin(ang + 0.45) * head)
      .closePath()
      .fill({ color, alpha })
      .stroke({ width: 2, color: 0x000000, alpha: 0.5 * alpha });
    g.circle(x, y, 5).fill({ color, alpha });
  }

  destroy() {
    this.layer.destroy({ children: true });
  }
}
