import * as PIXI from 'pixi.js';

// Mesmos valores do Engine.js (evita import circular).
const HUD_Z = 1e9;
const GROUND_Z = -1e9;

const CORES = [0x8a0303, 0xa00808, 0x6b0000, 0xb31212, 0x5c0000];
const MAX_DROPS = 260;   // gotas voando ao mesmo tempo
const MAX_STAINS = 420;  // manchas no chão (as mais antigas somem)

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (list) => list[Math.floor(Math.random() * list.length)];

/**
 * Sangue no mapa: gotas que espirram do golpe e manchas que ficam no chão.
 * Quanto mais forte o golpe (em relação à Vitalidade do alvo), mais sangue.
 *
 *   engine.blood.splash(tokenId, { intensity: 0..1, critico, fromTokenId })
 */
export class Blood {
  constructor(engine) {
    this.engine = engine;

    // Gotas no ar: na frente dos personagens, atrás da névoa e da escuridão.
    this.dropLayer = new PIXI.Container();
    this.dropLayer.zIndex = HUD_Z - 12;
    this.dropLayer.eventMode = 'none';

    // Manchas: no chão, acima do mapa e do grid, abaixo de tudo o mais.
    this.stainLayer = new PIXI.Container();
    this.stainLayer.zIndex = GROUND_Z + 2;
    this.stainLayer.eventMode = 'none';

    engine.viewport.addChild(this.stainLayer, this.dropLayer);
    this.drops = [];
    this.stains = [];
    this.texture = makeDot();
  }

  get g() {
    return this.engine.gridSize;
  }

  splash(tokenId, { intensity = 0.3, critico = false, fromTokenId = null } = {}) {
    const token = this.engine.tokens[tokenId];
    if (!token || token.container.destroyed) return;
    const g = this.g;
    const power = Math.max(0, Math.min(1, intensity));
    const budget = this.engine.lowPower ? 0.35 : 1;

    const x = token.container.x;
    const ground = token.container.y + token.footY;
    const chest = Math.max(g * 0.4, (token.heightPx || g) * 0.6);

    // O sangue voa para longe de quem bateu.
    const from = fromTokenId ? this.engine.tokens[fromTokenId] : null;
    let dir = from ? Math.sign(x - from.container.x) : 0;
    if (!dir) dir = Math.random() < 0.5 ? -1 : 1;

    const count = Math.round((8 + power * 60 + (critico ? 25 : 0)) * budget);
    for (let i = 0; i < count && this.drops.length < MAX_DROPS; i += 1) {
      const sprite = new PIXI.Sprite(this.texture);
      sprite.anchor.set(0.5);
      sprite.tint = pick(CORES);
      const size = g * rand(0.018, 0.05) * (1 + power * 0.8);
      sprite.width = size;
      sprite.height = size;
      this.dropLayer.addChild(sprite);
      const spurt = critico && i < count * 0.4 ? 1.6 : 1; // crítico: jato mais forte
      this.drops.push({
        sprite,
        x: x + rand(-0.12, 0.12) * g,
        y: ground + rand(-0.06, 0.06) * g,
        z: chest * rand(0.7, 1.1),
        vx: (dir * rand(0.4, 3) * (0.6 + power) * spurt + rand(-0.8, 0.8)) * g,
        vy: rand(-0.7, 0.7) * g,
        vz: rand(0.6, 2.8) * g * spurt,
        size,
        stain: Math.random() < 0.55,
      });
    }

    // Mancha grande no lugar do golpe (cresce com o dano).
    if (power > 0.15 || critico) {
      this.addStain(x + dir * g * 0.25, ground + g * 0.05, g * (0.12 + power * 0.32), true);
    }
  }

  addStain(x, y, radius, big = false) {
    const stain = new PIXI.Sprite(this.texture);
    stain.anchor.set(0.5);
    stain.tint = big ? 0x5c0505 : pick(CORES);
    stain.width = radius * 2;
    stain.height = radius * (big ? 0.8 : 0.9);
    stain.rotation = big ? rand(-0.2, 0.2) : 0;
    stain.alpha = big ? 0.78 : 0.85;
    stain.position.set(x, y);
    this.stainLayer.addChild(stain);
    this.stains.push(stain);
    if (this.stains.length > MAX_STAINS) this.stains.shift().destroy();
  }

  tick(deltaMS) {
    if (!this.drops.length) return;
    const dt = deltaMS / 1000;
    const gravity = 9 * this.g;
    this.drops = this.drops.filter((d) => {
      d.vz -= gravity * dt;
      d.z += d.vz * dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      if (d.z <= 0) {
        if (d.stain) this.addStain(d.x, d.y, d.size * rand(0.8, 1.6));
        d.sprite.destroy();
        return false;
      }
      d.sprite.position.set(d.x, d.y - d.z);
      return true;
    });
  }

  /** Mapa trocado: o sangue da cena anterior some. */
  clear() {
    this.drops.forEach((d) => d.sprite.destroy());
    this.drops = [];
    this.stains.forEach((s) => s.destroy());
    this.stains = [];
  }

  destroy() {
    this.clear();
    this.dropLayer.destroy({ children: true });
    this.stainLayer.destroy({ children: true });
    this.texture.destroy(true);
  }
}

/** Intensidade do sangue: dano em relação à Vitalidade máxima (golpes fracos não sangram). */
export function bloodIntensity(dano, hpMax, { critico = false, caiu = false } = {}) {
  const max = Math.max(1, Number(hpMax) || 1);
  const ratio = Math.max(0, Number(dano) || 0) / max;
  if (ratio < 0.06 && !critico) return 0;
  return Math.min(1, ratio / 0.45 + (critico ? 0.25 : 0) + (caiu ? 0.3 : 0));
}

/** Gota branca com borda irregular (o tint pinta de vermelho). */
function makeDot() {
  const size = 32;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  const c = size / 2;
  for (let i = 0; i <= 16; i += 1) {
    const a = (i / 16) * Math.PI * 2;
    const r = c * (0.78 + Math.sin(i * 2.7) * 0.08 + Math.cos(i * 1.3) * 0.06);
    if (i === 0) ctx.moveTo(c + Math.cos(a) * r, c + Math.sin(a) * r);
    else ctx.lineTo(c + Math.cos(a) * r, c + Math.sin(a) * r);
  }
  ctx.closePath();
  ctx.fill();
  return PIXI.Texture.from(canvas);
}
