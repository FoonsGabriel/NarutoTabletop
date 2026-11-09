import * as PIXI from 'pixi.js';

/**
 * Efeitos vivos dos itens de cenário (sprite.fx):
 *   fogo · tocha · brasa · fumaca · vagalumes · folhas · sakura · agua
 *
 * - Cada item tem um container próprio na profundidade dele (o fogo de uma fogueira
 *   fica atrás de quem está na frente dela).
 * - Só emite partículas para itens que estão na tela; modo leve e celular emitem menos.
 * - O vento do clima empurra chamas, fumaça e folhas.
 */

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (list) => list[Math.floor(Math.random() * list.length)];

const FLAME = [0xfff0a0, 0xffc04a, 0xff8a26, 0xff5a14];
const EMBER = [0xffd27a, 0xffb347, 0xff8040];
const SMOKE = [0x4a4a4a, 0x5c5c5c, 0x6e6e6e];
const LEAF = [0x6f9a3a, 0x8bb34a, 0x5a7f2e, 0xb8a040];
const PETAL = [0xffc0d6, 0xffd6e4, 0xff9fc0];
const WATER = [0xbfe6ff, 0x8fd0ff, 0xffffff];
const FIREFLY = [0xd8ff7a, 0xf2ff9a, 0xb8ff5a];

export class PropFx {
  constructor(engine) {
    this.engine = engine;
    this.emitters = {}; // tokenId → { container, acc, glow }
    this.particles = [];
    this.textures = {
      dot: makeDot(),
      leaf: makeLeaf(),
    };
  }

  get g() {
    return this.engine.gridSize;
  }

  get limit() {
    if (this.engine.lowPower) return 140;
    return this.engine.isMobile ? 320 : 700;
  }

  get rate() {
    return this.engine.lowPower ? 0.35 : this.engine.isMobile ? 0.6 : 1;
  }

  /** Retângulo do mundo visível (com folga). */
  view() {
    const { viewport, app } = this.engine;
    const s = viewport.scale.x || 1;
    const m = this.g * 4;
    return { x: -viewport.x / s - m, y: -viewport.y / s - m, w: app.screen.width / s + m * 2, h: app.screen.height / s + m * 2 };
  }

  emitter(token) {
    let e = this.emitters[token.data.id];
    if (!e || e.container.destroyed) {
      const container = new PIXI.Container();
      container.eventMode = 'none';
      this.engine.viewport.addChild(container);
      e = { container, acc: {}, glow: null, phase: Math.random() * 10 };
      this.emitters[token.data.id] = e;
    }
    return e;
  }

  spawn(e, x, y, o) {
    if (this.particles.length >= this.limit) return;
    const sprite = new PIXI.Sprite(o.texture || this.textures.dot);
    sprite.anchor.set(0.5);
    sprite.tint = o.color;
    sprite.blendMode = o.add ? 'add' : 'normal';
    sprite.position.set(x, y);
    sprite.scale.set(o.scale);
    sprite.alpha = o.alpha ?? 1;
    sprite.rotation = o.rotation || 0;
    e.container.addChild(sprite);
    this.particles.push({
      sprite, vx: o.vx || 0, vy: o.vy || 0, life: 0, max: o.life, scale: o.scale, scaleEnd: o.scaleEnd ?? o.scale,
      alpha: o.alpha ?? 1, fadeIn: o.fadeIn || 0, drag: o.drag ?? 0.99, gravity: o.gravity || 0, wind: o.wind || 0,
      spin: o.spin || 0, flicker: o.flicker || 0, wander: o.wander || 0, phase: Math.random() * 10,
    });
  }

  /** Quantas partículas deste tipo emitir neste quadro (por segundo × tempo). */
  due(e, kind, perSecond, deltaMS) {
    e.acc[kind] = (e.acc[kind] || 0) + perSecond * this.rate * (deltaMS / 1000);
    const n = Math.floor(e.acc[kind]);
    e.acc[kind] -= n;
    return n;
  }

  tick(deltaMS) {
    const tokens = this.engine.tokens;
    const view = this.view();
    const wind = (this.engine.atmosphere?.windStrength ?? 0.1) * (this.engine.atmosphere?.windDir ?? 1);
    const darkness = this.engine.atmosphere?.darkness ?? 0;
    const g = this.g;
    const k = g / 64; // tamanho relativo ao bloco
    const seen = new Set();

    Object.values(tokens).forEach((token) => {
      const fx = token.mode === 'prop' ? token.sprite.fx : null;
      if (!fx || fx === 'nenhum' || token.container.destroyed) return;
      seen.add(token.data.id);
      const e = this.emitter(token);
      e.container.zIndex = token.container.zIndex + 0.5;
      e.container.visible = token.container.visible;

      const x = token.container.x;
      const foot = token.container.y + token.footY;
      const h = token.heightPx || g;
      const w = (token.visual?.width || g) * 0.8;
      const onScreen = x > view.x && x < view.x + view.w && foot > view.y && foot - h < view.y + view.h;

      // Brilho na base do fogo (pulsando).
      if (fx === 'fogo' || fx === 'tocha' || fx === 'brasa') this.updateGlow(e, token, fx, x, foot, h, deltaMS, onScreen);
      if (!onScreen) return;

      if (fx === 'fogo') {
        const size = Math.max(0.7, Math.min(2.2, h / g)) * k; // fogueira maior = chamas maiores
        const base = token.sprite.builtin === 'vazio' ? foot - g * 0.1 : foot - h * 0.45;
        for (let i = this.due(e, 'flame', 38, deltaMS); i > 0; i -= 1) {
          this.spawn(e, x + rand(-14, 14) * size, base + rand(-3, 3), {
            color: pick(FLAME), add: true, vx: rand(-0.25, 0.25), vy: -rand(1.1, 2.1) * size, life: rand(420, 720),
            scale: rand(0.32, 0.5) * size, scaleEnd: 0.04, alpha: 0.95, wind: 0.05, drag: 0.985, flicker: 0.25,
          });
        }
        for (let i = this.due(e, 'ember', 6, deltaMS); i > 0; i -= 1) {
          this.spawn(e, x + rand(-10, 10) * size, base - 6 * size, {
            color: pick(EMBER), add: true, vx: rand(-0.6, 0.6), vy: -rand(1.2, 2.4) * size, life: rand(900, 1500),
            scale: rand(0.05, 0.09) * size, scaleEnd: 0.02, wind: 0.08, drag: 0.992, flicker: 0.6, wander: 0.08,
          });
        }
        for (let i = this.due(e, 'smoke', 5, deltaMS); i > 0; i -= 1) {
          this.spawn(e, x + rand(-6, 6) * size, base - 30 * size, {
            color: pick(SMOKE), vx: rand(-0.15, 0.15), vy: -rand(0.5, 0.9) * size, life: rand(2000, 3000),
            scale: 0.3 * size, scaleEnd: 1.3 * size, alpha: 0.22, fadeIn: 0.15, wind: 0.12, drag: 0.995,
          });
        }
      } else if (fx === 'tocha') {
        const top = foot - h * 0.93;
        for (let i = this.due(e, 'flame', 20, deltaMS); i > 0; i -= 1) {
          this.spawn(e, x + rand(-4, 4) * k, top, {
            color: pick(FLAME), add: true, vx: rand(-0.15, 0.15), vy: -rand(0.8, 1.4) * k, life: rand(300, 520),
            scale: rand(0.18, 0.28) * k, scaleEnd: 0.03, wind: 0.06, drag: 0.985, flicker: 0.25,
          });
        }
        for (let i = this.due(e, 'ember', 2, deltaMS); i > 0; i -= 1) {
          this.spawn(e, x, top - 6 * k, { color: pick(EMBER), add: true, vx: rand(-0.4, 0.4), vy: -rand(0.8, 1.6) * k, life: rand(700, 1100), scale: 0.05 * k, scaleEnd: 0.02, wind: 0.08, flicker: 0.6 });
        }
      } else if (fx === 'brasa') {
        const mid = foot - h * 0.62;
        for (let i = this.due(e, 'ember', 3, deltaMS); i > 0; i -= 1) {
          this.spawn(e, x + rand(-6, 6) * k, mid, { color: pick(EMBER), add: true, vx: rand(-0.2, 0.2), vy: -rand(0.3, 0.7) * k, life: rand(600, 1000), scale: 0.06 * k, scaleEnd: 0.02, flicker: 0.6 });
        }
      } else if (fx === 'fumaca') {
        const top = token.sprite.builtin === 'vazio' ? foot - g * 0.2 : foot - h * 0.92;
        for (let i = this.due(e, 'smoke', 4, deltaMS); i > 0; i -= 1) {
          this.spawn(e, x + rand(-6, 6) * k, top, {
            color: pick(SMOKE), vx: rand(-0.1, 0.1), vy: -rand(0.45, 0.8) * k, life: rand(2600, 3600),
            scale: 0.25 * k, scaleEnd: 1.5 * k, alpha: 0.26, fadeIn: 0.12, wind: 0.14, drag: 0.996,
          });
        }
      } else if (fx === 'folhas' || fx === 'sakura') {
        // Com mais vento, caem mais folhas.
        const perSecond = (fx === 'sakura' ? 2.2 : 1.2) * (0.5 + Math.abs(wind) * 3);
        for (let i = this.due(e, 'leaf', perSecond, deltaMS); i > 0; i -= 1) {
          this.spawn(e, x + rand(-w / 2, w / 2), foot - h * rand(0.45, 0.9), {
            texture: this.textures.leaf, color: pick(fx === 'sakura' ? PETAL : LEAF), vx: rand(-0.2, 0.2), vy: rand(0.25, 0.5) * k,
            life: rand(2600, 4200), scale: rand(0.22, 0.32) * k, alpha: 0.95, fadeIn: 0.08, wind: 0.6, drag: 0.995,
            spin: rand(-0.06, 0.06), wander: 0.25, rotation: rand(0, Math.PI * 2),
          });
        }
      } else if (fx === 'vagalumes') {
        if (darkness < 0.15) return; // só aparecem no escuro
        for (let i = this.due(e, 'fly', 1.6, deltaMS); i > 0; i -= 1) {
          this.spawn(e, x + rand(-2, 2) * g, foot - rand(0.1, 1.4) * g, {
            color: pick(FIREFLY), add: true, vx: rand(-0.2, 0.2), vy: rand(-0.2, 0.1), life: rand(3000, 5000),
            scale: rand(0.07, 0.11) * k, alpha: 0.95, fadeIn: 0.25, drag: 0.98, wander: 0.12, flicker: 0.9,
          });
        }
      } else if (fx === 'agua') {
        const base = foot - g * 0.15;
        for (let i = this.due(e, 'drop', 26, deltaMS); i > 0; i -= 1) {
          const a = rand(-Math.PI * 0.85, -Math.PI * 0.15);
          const s = rand(1.2, 2.6) * k;
          this.spawn(e, x + rand(-10, 10) * k, base, {
            color: pick(WATER), add: true, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(450, 750),
            scale: rand(0.07, 0.13) * k, scaleEnd: 0.03, alpha: 0.85, gravity: 0.11 * k, drag: 0.99,
          });
        }
        for (let i = this.due(e, 'mist', 3, deltaMS); i > 0; i -= 1) {
          this.spawn(e, x + rand(-14, 14) * k, base - 4, { color: 0xffffff, add: true, vx: rand(-0.2, 0.2), vy: -rand(0.1, 0.3), life: 1500, scale: 0.3 * k, scaleEnd: 0.9 * k, alpha: 0.12, fadeIn: 0.2, wind: 0.05 });
        }
      }
    });

    // Itens que saíram do mapa (ou perderam o efeito).
    Object.keys(this.emitters).forEach((id) => {
      if (seen.has(id)) return;
      const e = this.emitters[id];
      this.particles = this.particles.filter((p) => {
        if (p.sprite.parent !== e.container) return true;
        p.sprite.destroy();
        return false;
      });
      e.container.destroy({ children: true });
      delete this.emitters[id];
    });

    this.updateParticles(deltaMS, wind);
  }

  updateGlow(e, token, fx, x, foot, h, deltaMS, onScreen) {
    if (!e.glow) {
      e.glow = new PIXI.Sprite(this.textures.dot);
      e.glow.anchor.set(0.5);
      e.glow.blendMode = 'add';
      e.glow.tint = 0xff8a30;
      e.container.addChild(e.glow);
    }
    e.glow.visible = onScreen;
    if (!onScreen) return;
    e.phase += deltaMS / 1000;
    const pulse = 0.85 + Math.sin(e.phase * 9) * 0.08 + Math.sin(e.phase * 23) * 0.05;
    const k = this.g / 64;
    const y = fx === 'fogo' ? (token.sprite.builtin === 'vazio' ? foot - this.g * 0.2 : foot - h * 0.58) : fx === 'tocha' ? foot - h * 0.93 : foot - h * 0.62;
    const size = fx === 'fogo' ? 1.25 : fx === 'tocha' ? 0.8 : 0.6;
    e.glow.position.set(x, y);
    e.glow.scale.set(size * k * pulse, size * k * pulse * 0.85);
    e.glow.alpha = (fx === 'brasa' ? 0.4 : 0.42) * pulse;
  }

  updateParticles(deltaMS, wind) {
    if (!this.particles.length) return;
    const step = deltaMS / 16.67;
    this.particles = this.particles.filter((p) => {
      p.life += deltaMS;
      if (p.life >= p.max || p.sprite.destroyed) {
        if (!p.sprite.destroyed) p.sprite.destroy();
        return false;
      }
      const t = p.life / p.max;
      p.phase += deltaMS / 1000;
      if (p.wander) {
        p.vx += Math.sin(p.phase * 2.3) * p.wander * 0.05 * step;
        p.vy += Math.cos(p.phase * 1.7) * p.wander * 0.03 * step;
      }
      p.vx = (p.vx + wind * p.wind * 0.1 * step) * p.drag;
      p.vy = (p.vy + p.gravity * step) * p.drag;
      p.sprite.x += p.vx * step;
      p.sprite.y += p.vy * step;
      p.sprite.rotation += p.spin * step;
      p.sprite.scale.set(p.scale + (p.scaleEnd - p.scale) * t);
      const fadeIn = p.fadeIn ? Math.min(1, t / p.fadeIn) : 1;
      const flick = p.flicker ? 1 - p.flicker * 0.5 * (1 + Math.sin(p.phase * 25)) : 1;
      p.sprite.alpha = p.alpha * fadeIn * (1 - t * t) * flick;
      return true;
    });
  }

  destroy() {
    Object.values(this.emitters).forEach((e) => e.container.destroy({ children: true }));
    this.emitters = {};
    this.particles = [];
    Object.values(this.textures).forEach((t) => t.destroy(true));
    builtinCache.forEach((t) => t.destroy(true));
    builtinCache.clear();
  }
}

// ---------------------------------------------------------------------
// Texturas
// ---------------------------------------------------------------------

function makeDot() {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.4, 'rgba(255,255,255,0.75)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  return PIXI.Texture.from(canvas);
}

function makeLeaf() {
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 20;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.ellipse(16, 10, 14, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(3, 10);
  ctx.lineTo(29, 10);
  ctx.stroke();
  return PIXI.Texture.from(canvas);
}

const builtinCache = new Map();

/**
 * Bases desenhadas pelo sistema (não precisam de arquivo):
 *   fogueira → lenha cruzada num anel de pedras (estilo cel shading)
 *   vazio    → marcador só para o Mestre achar o efeito no mapa
 */
export function builtinTexture(kind) {
  if (builtinCache.has(kind)) return builtinCache.get(kind);
  const texture = kind === 'fogueira' ? drawCampfire() : drawEmpty();
  builtinCache.set(kind, texture);
  return texture;
}

function drawCampfire() {
  const W = 256;
  const H = 190;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const c = canvas.getContext('2d');
  const cx = W / 2;
  const cy = H * 0.74; // centro do anel de pedras (no chão)
  const outline = '#21150d';

  // Chão queimado e cinzas.
  c.fillStyle = 'rgba(25,18,14,0.5)';
  c.beginPath();
  c.ellipse(cx, cy + 6, 104, 36, 0, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = '#33261f';
  c.beginPath();
  c.ellipse(cx, cy, 70, 24, 0, 0, Math.PI * 2);
  c.fill();

  const stone = (x, y, rx, ry, tone) => {
    c.fillStyle = outline;
    c.beginPath();
    c.ellipse(x, y, rx + 2.5, ry + 2.5, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = tone;
    c.beginPath();
    c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    c.fill();
    // Sombra embaixo e brilho em cima (cel shading).
    c.fillStyle = 'rgba(0,0,0,0.28)';
    c.beginPath();
    c.ellipse(x, y + ry * 0.35, rx * 0.95, ry * 0.6, 0, 0, Math.PI);
    c.fill();
    c.fillStyle = 'rgba(255,255,255,0.18)';
    c.beginPath();
    c.ellipse(x - rx * 0.25, y - ry * 0.35, rx * 0.5, ry * 0.32, 0, 0, Math.PI * 2);
    c.fill();
  };
  const tones = ['#5e636b', '#6d727a', '#555a62', '#787d84', '#646970'];
  const ring = (from, to, count) => {
    for (let i = 0; i < count; i += 1) {
      const a = from + (i / (count - 1)) * (to - from);
      stone(cx + Math.cos(a) * 80, cy + Math.sin(a) * 27, 15 + (i % 3) * 2, 10 + (i % 2) * 2, tones[i % tones.length]);
    }
  };
  ring(Math.PI * 1.08, Math.PI * 1.92, 7); // pedras de trás (atrás da lenha)

  // Brasas no meio.
  const ember = c.createRadialGradient(cx, cy - 4, 2, cx, cy - 4, 52);
  ember.addColorStop(0, 'rgba(255,205,90,1)');
  ember.addColorStop(0.45, 'rgba(240,100,30,0.75)');
  ember.addColorStop(1, 'rgba(120,40,20,0)');
  c.fillStyle = ember;
  c.beginPath();
  c.ellipse(cx, cy - 2, 54, 20, 0, 0, Math.PI * 2);
  c.fill();

  // Toras em pirâmide (claras em cima, escuras embaixo, contorno grosso).
  const log = (x1, y1, x2, y2, r) => {
    const ang = Math.atan2(y2 - y1, x2 - x1);
    const len = Math.hypot(x2 - x1, y2 - y1);
    c.save();
    c.translate(x1, y1);
    c.rotate(ang);
    c.fillStyle = outline;
    roundRect(c, -3, -r - 3, len + 6, r * 2 + 6, r + 3);
    c.fill();
    c.fillStyle = '#6b3f1f';
    roundRect(c, 0, -r, len, r * 2, r);
    c.fill();
    c.fillStyle = '#9a6234';
    roundRect(c, 4, -r + 2, len - 8, r * 0.85, r * 0.45);
    c.fill();
    c.strokeStyle = 'rgba(40,20,8,0.55)';
    c.lineWidth = 2;
    for (let i = 1; i < 4; i += 1) {
      c.beginPath();
      c.moveTo((len * i) / 4 - 6, r * 0.1);
      c.lineTo((len * i) / 4 + 10, r * 0.45);
      c.stroke();
    }
    // Ponta carbonizada perto do fogo.
    const burn = c.createLinearGradient(len * 0.55, 0, len, 0);
    burn.addColorStop(0, 'rgba(20,10,5,0)');
    burn.addColorStop(1, 'rgba(20,10,5,0.75)');
    c.fillStyle = burn;
    roundRect(c, 0, -r, len, r * 2, r);
    c.fill();
    c.restore();
  };
  const top = { x: cx, y: cy - 62 };
  log(cx - 62, cy + 10, top.x - 4, top.y + 8, 9);
  log(cx + 62, cy + 10, top.x + 4, top.y + 8, 9);
  log(cx - 30, cy + 20, top.x + 2, top.y + 4, 8);
  log(cx + 34, cy + 18, top.x - 2, top.y + 6, 8);
  // Tora deitada na frente.
  log(cx - 50, cy + 14, cx + 52, cy + 4, 8);

  ring(Math.PI * 0.05, Math.PI * 0.95, 9); // pedras da frente
  return PIXI.Texture.from(canvas);
}

function drawEmpty() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const c = canvas.getContext('2d');
  c.setLineDash([6, 5]);
  c.strokeStyle = 'rgba(255,255,255,0.9)';
  c.lineWidth = 3;
  c.beginPath();
  c.arc(32, 32, 26, 0, Math.PI * 2);
  c.stroke();
  c.fillStyle = 'rgba(255,255,255,0.9)';
  c.font = 'bold 26px sans-serif';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText('✦', 32, 33);
  return PIXI.Texture.from(canvas);
}

function roundRect(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}
