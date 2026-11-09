import * as PIXI from 'pixi.js';

// Mesmo valor do Engine.js (evita import circular).
const HUD_Z = 1e9;

/**
 * Animações de ataque no mapa (todo mundo vê: o Room repassa pelo canal ao vivo).
 *
 *   engine.playAttack({ from, to: [tokenIds], element, shape, hit: [bool] })
 *
 * element: katon | suiton | fuuton | raiton | doton | mokuton | insetos | satetsu | sakin | chakra | arma
 * shape:   projetil | raio | cone | pilar | nova | corte | arremesso | enxame
 *          golpe (luta física) | estocada (perfurar) | pancada (esmagar) | flecha | explosao
 * weapon:  shuriken | kunai | senbon | fuuma (o que voa no arremesso)
 */
export const PALETAS = {
  katon: { core: 0xfff1a8, glow: 0xff7a1a, parts: [0xff4d00, 0xff9a1f, 0xffd447], add: true, size: 1.1 },
  suiton: { core: 0xe0f7ff, glow: 0x2f8fff, parts: [0x4fb3ff, 0x9ad8ff, 0xffffff], add: true, size: 1, gravity: 0.25 },
  fuuton: { core: 0xffffff, glow: 0xb8f5d8, parts: [0xe8fff4, 0xbdf0d8, 0xffffff], add: true, size: 0.9, swirl: true },
  raiton: { core: 0xffffff, glow: 0x7fd4ff, parts: [0xbfe9ff, 0xfff6a0, 0xffffff], add: true, size: 0.8 },
  doton: { core: 0xc9a27a, glow: 0x8a5a2b, parts: [0x7a5230, 0xa47448, 0x5a3a20], add: false, size: 1.2, gravity: 0.6 },
  mokuton: { core: 0xd9b47c, glow: 0x6f9a3a, parts: [0x8b5a2b, 0x6f9a3a, 0xc59a5c], add: false, size: 1.1, gravity: 0.4 },
  insetos: { core: 0x222222, glow: 0x3a3a2a, parts: [0x111111, 0x2a2a1f, 0x3b3b2b], add: false, size: 0.45 },
  satetsu: { core: 0x7a808e, glow: 0x3a3e48, parts: [0x1d1f25, 0x3a3e48, 0x6b7080, 0x9aa0ad], add: false, size: 0.85, gravity: 0.15 },
  sakin: { core: 0xfff0a0, glow: 0xd4a017, parts: [0xf5c842, 0xd4a017, 0xfff3b0], add: true, size: 0.7 },
  chakra: { core: 0xf0e6ff, glow: 0x8f6bff, parts: [0xb59cff, 0x7fd4ff, 0xffffff], add: true, size: 1 },
  arma: { core: 0xffffff, glow: 0xdfe6ee, parts: [0xffffff, 0xfff2b0, 0xcfd8e3], add: true, size: 0.6 },
  rasengan: { core: 0xf0faff, glow: 0x3aa0ff, parts: [0x7fc8ff, 0xd6f0ff, 0x2f7fff, 0xffffff], add: true, size: 1.1, swirl: true },
  impacto: { core: 0xffffff, glow: 0xffb347, parts: [0xffffff, 0xffd27a, 0xff9a3c], add: true, size: 0.7 },
  poeira: { core: 0xd8c3a0, glow: 0x8a6a45, parts: [0xb89a72, 0x8a6a45, 0xd8c3a0], add: false, size: 0.9, gravity: 0.2 },
};

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (list) => list[Math.floor(Math.random() * list.length)];

export class AttackFx {
  constructor(engine) {
    this.engine = engine;
    this.layer = new PIXI.Container();
    this.layer.zIndex = HUD_Z - 2; // por cima dos personagens, abaixo dos nomes/barras
    this.layer.eventMode = 'none';
    engine.viewport.addChild(this.layer);

    this.particles = [];
    this.tasks = []; // projéteis, raios, cortes (cada um com tick próprio)
    this.texture = makeSoftDot();
  }

  get g() {
    return this.engine.gridSize;
  }

  get budget() {
    return this.engine.lowPower ? 0.35 : 1; // modo leve: bem menos partículas
  }

  /** Ponto do token "na altura do peito". */
  anchor(tokenId) {
    const token = this.engine.tokens[tokenId];
    if (!token) return null;
    return { x: token.container.x, y: token.container.y - (token.heightPx || this.g) * 0.45 };
  }

  // ---------------------------------------------------------------
  // Partículas
  // ---------------------------------------------------------------

  spawn(x, y, { color, vx = 0, vy = 0, life = 500, scale = 0.5, scaleEnd = 0, alpha = 1, add = true, gravity = 0, drag = 0.96 }) {
    if (this.particles.length > 900) return;
    const sprite = new PIXI.Sprite(this.texture);
    sprite.anchor.set(0.5);
    sprite.tint = color;
    sprite.position.set(x, y);
    sprite.blendMode = add ? 'add' : 'normal';
    sprite.scale.set(scale);
    sprite.alpha = alpha;
    this.layer.addChild(sprite);
    this.particles.push({ sprite, vx, vy, life: 0, max: life, scale, scaleEnd, alpha, gravity, drag });
  }

  burst(x, y, pal, { count = 26, speed = 4, life = 550, size = 0.6, ring = true } = {}) {
    const n = Math.max(4, Math.round(count * this.budget));
    for (let i = 0; i < n; i += 1) {
      const a = rand(0, Math.PI * 2);
      const s = rand(speed * 0.3, speed);
      this.spawn(x, y, {
        color: pick(pal.parts), vx: Math.cos(a) * s, vy: Math.sin(a) * s - (pal.gravity ? 1.5 : 0),
        life: rand(life * 0.6, life), scale: size * pal.size * rand(0.6, 1.2), scaleEnd: 0.05,
        add: pal.add, gravity: (pal.gravity || 0) * 0.35, drag: 0.93,
      });
    }
    // Clarão + anel de impacto.
    this.spawn(x, y, { color: pal.core, life: 220, scale: 1.6 * pal.size, scaleEnd: 2.6 * pal.size, alpha: 0.9, add: true });
    if (ring) this.ring(x, y, pal.glow, this.g * 0.9);
  }

  ring(x, y, color, radius, life = 380) {
    const g = new PIXI.Graphics();
    g.position.set(x, y);
    this.layer.addChild(g);
    this.tasks.push({
      t: 0,
      dur: life,
      tick: (task) => {
        const k = task.t / task.dur;
        g.clear();
        g.circle(0, 0, radius * (0.2 + k)).stroke({ width: Math.max(1, 6 * (1 - k)), color, alpha: 1 - k });
      },
      done: () => g.destroy(),
    });
  }

  // ---------------------------------------------------------------
  // Formatos
  // ---------------------------------------------------------------

  /** Projétil com rastro (bola de fogo, jato d'água, orbe, kunai...). */
  projectile(from, to, pal, { hit = true, onArrive, size = 1, thin = false } = {}) {
    const dist = Math.hypot(to.x - from.x, to.y - from.y);
    const dur = Math.max(220, Math.min(650, dist / 1.4));
    // Errou: passa ao lado do alvo e segue um pouco.
    const end = hit ? to : {
      x: to.x + (to.x - from.x) * 0.35 + rand(-1, 1) * this.g * 0.6,
      y: to.y + (to.y - from.y) * 0.35 + rand(-1, 1) * this.g * 0.6,
    };
    const lift = Math.min(this.g * 1.2, dist * 0.18); // arco leve
    const head = new PIXI.Sprite(this.texture);
    head.anchor.set(0.5);
    head.tint = pal.core;
    head.blendMode = pal.add ? 'add' : 'normal';
    head.scale.set((thin ? 0.35 : 0.9) * pal.size * size);
    this.layer.addChild(head);
    const glow = new PIXI.Sprite(this.texture);
    glow.anchor.set(0.5);
    glow.tint = pal.glow;
    glow.blendMode = 'add';
    glow.alpha = pal.add ? 0.8 : 0.35;
    glow.scale.set((thin ? 0.7 : 1.8) * pal.size * size);
    this.layer.addChild(glow);

    let spin = 0;
    this.tasks.push({
      t: 0,
      dur,
      tick: (task, delta) => {
        const k = task.t / task.dur;
        const x = from.x + (end.x - from.x) * k;
        const y = from.y + (end.y - from.y) * k - Math.sin(Math.PI * k) * lift;
        head.position.set(x, y);
        glow.position.set(x, y);
        spin += delta * 0.02;
        const trail = Math.round((thin ? 1 : 3) * this.budget + 0.4);
        for (let i = 0; i < trail; i += 1) {
          const sx = pal.swirl ? Math.cos(spin + i * 2) * this.g * 0.25 : rand(-4, 4);
          const sy = pal.swirl ? Math.sin(spin + i * 2) * this.g * 0.25 : rand(-4, 4);
          this.spawn(x + sx, y + sy, {
            color: pick(pal.parts), vx: rand(-0.6, 0.6), vy: rand(-0.6, 0.6) - (pal.gravity ? 0 : 0.3),
            life: thin ? 160 : rand(260, 460), scale: (thin ? 0.25 : 0.55) * pal.size * size, scaleEnd: 0.02,
            add: pal.add, gravity: (pal.gravity || 0) * 0.2,
          });
        }
      },
      done: () => {
        head.destroy();
        glow.destroy();
        if (hit) onArrive?.(end);
        else this.burst(end.x, end.y, pal, { count: 6, speed: 1.5, life: 300, size: 0.35, ring: false });
      },
    });
  }

  /** Relâmpago em zigue-zague que pisca. */
  lightning(from, to, pal, { hit = true, onArrive } = {}) {
    const end = hit ? to : { x: to.x + rand(-1, 1) * this.g * 0.8, y: to.y + rand(-1, 1) * this.g * 0.8 };
    const g = new PIXI.Graphics();
    g.blendMode = 'add';
    this.layer.addChild(g);
    const drawBolt = () => {
      g.clear();
      const segs = 9;
      const nx = -(end.y - from.y);
      const ny = end.x - from.x;
      const len = Math.hypot(nx, ny) || 1;
      const pts = [from];
      for (let i = 1; i < segs; i += 1) {
        const k = i / segs;
        const off = rand(-1, 1) * this.g * 0.35;
        pts.push({ x: from.x + (end.x - from.x) * k + (nx / len) * off, y: from.y + (end.y - from.y) * k + (ny / len) * off });
      }
      pts.push(end);
      [[9, pal.glow, 0.35], [4, pal.glow, 0.8], [2, pal.core, 1]].forEach(([w, c, a]) => {
        g.moveTo(pts[0].x, pts[0].y);
        pts.slice(1).forEach((p) => g.lineTo(p.x, p.y));
        g.stroke({ width: w, color: c, alpha: a });
      });
    };
    let flick = 0;
    let arrived = false;
    this.tasks.push({
      t: 0,
      dur: 360,
      tick: (task, delta) => {
        flick += delta;
        if (flick > 55) { flick = 0; drawBolt(); }
        g.alpha = 1 - Math.max(0, (task.t - 220) / 140);
        if (!arrived && task.t > 60) {
          arrived = true;
          if (hit) onArrive?.(end);
        }
      },
      done: () => g.destroy(),
    });
    drawBolt();
  }

  /** Corte em arco no alvo (golpe corpo a corpo). */
  slash(from, to, pal, { hit = true, onArrive } = {}) {
    const g = new PIXI.Graphics();
    g.blendMode = 'add';
    g.position.set(to.x, to.y);
    this.layer.addChild(g);
    const base = Math.atan2(to.y - from.y, to.x - from.x) - Math.PI / 2;
    const r = this.g * 0.85;
    let arrived = false;
    this.tasks.push({
      t: 0,
      dur: 260,
      tick: (task) => {
        const k = task.t / task.dur;
        g.clear();
        const a0 = base - 1.1;
        const a1 = a0 + 2.2 * Math.min(1, k * 1.6);
        g.arc(0, 0, r, a0, a1).stroke({ width: 18 * (1 - k) + 3, color: pal.glow, alpha: 0.45 * (1 - k) });
        g.arc(0, 0, r * 0.92, a0 + 0.1, a1).stroke({ width: 6 * (1 - k) + 2, color: pal.core, alpha: 1 - k * 0.8 });
        g.arc(0, 0, r * 0.75, a0 + 0.3, a1 - 0.2).stroke({ width: 2, color: pal.core, alpha: 0.7 * (1 - k) });
        if (!arrived && k > 0.45) {
          arrived = true;
          if (hit) onArrive?.(to);
        }
      },
      done: () => g.destroy(),
    });
  }

  /** Nuvem de insetos que voa até o alvo e gira em volta dele. */
  swarm(from, to, pal, { hit = true, onArrive } = {}) {
    const count = Math.max(14, Math.round(55 * this.budget));
    const bugs = [];
    // Sombra da nuvem de insetos (para ler bem em cima de mato e telhado).
    const cloud = new PIXI.Sprite(this.texture);
    cloud.anchor.set(0.5);
    cloud.tint = 0x0b0b08;
    cloud.alpha = 0.35;
    cloud.scale.set((this.g * 1.6) / 64);
    cloud.position.set(from.x, from.y);
    this.layer.addChild(cloud);
    for (let i = 0; i < count; i += 1) {
      const s = new PIXI.Sprite(this.texture);
      s.anchor.set(0.5);
      s.tint = pick(pal.parts);
      s.scale.set(rand(0.16, 0.28));
      s.position.set(from.x + rand(-10, 10), from.y + rand(-10, 10));
      this.layer.addChild(s);
      bugs.push({ s, phase: rand(0, Math.PI * 2), delay: rand(0, 0.25), off: rand(0.2, 0.6) });
    }
    const dist = Math.hypot(to.x - from.x, to.y - from.y);
    const travel = Math.max(380, Math.min(900, dist / 1.1));
    const dur = travel + (hit ? 650 : 250);
    let arrived = false;
    this.tasks.push({
      t: 0,
      dur,
      tick: (task) => {
        bugs.forEach((b) => {
          const k = Math.max(0, Math.min(1, (task.t / travel - b.delay) / (1 - b.delay)));
          const tx = hit ? to.x : to.x + (to.x - from.x) * 0.3;
          const ty = hit ? to.y : to.y + (to.y - from.y) * 0.3;
          let x = from.x + (tx - from.x) * k;
          let y = from.y + (ty - from.y) * k;
          const wob = this.g * b.off * (k < 1 ? 0.6 : 1);
          const w = task.t * 0.012 + b.phase;
          x += Math.cos(w) * wob;
          y += Math.sin(w * 1.3) * wob * 0.7;
          b.s.position.set(x, y);
          b.s.alpha = task.t > dur - 250 ? (dur - task.t) / 250 : 1;
        });
        const kc = Math.min(1, task.t / travel);
        const cx = hit ? to.x : to.x + (to.x - from.x) * 0.3;
        const cy = hit ? to.y : to.y + (to.y - from.y) * 0.3;
        cloud.position.set(from.x + (cx - from.x) * kc, from.y + (cy - from.y) * kc);
        cloud.alpha = 0.35 * (task.t > dur - 250 ? (dur - task.t) / 250 : 1);
        if (!arrived && task.t > travel) {
          arrived = true;
          if (hit) onArrive?.(to, { quiet: true });
        }
      },
      done: () => { bugs.forEach((b) => b.s.destroy()); cloud.destroy(); },
    });
  }

  /** Cone/corrente (Sopro Destrutivo, Correnteza, Míssil): jorro largo até os alvos. */
  cone(from, targets, pal, hits, onArrive) {
    const center = targets.reduce((acc, p) => ({ x: acc.x + p.x / targets.length, y: acc.y + p.y / targets.length }), { x: 0, y: 0 });
    const ang = Math.atan2(center.y - from.y, center.x - from.x);
    const dist = Math.max(this.g * 2, Math.hypot(center.x - from.x, center.y - from.y) * 1.1);
    const dur = 520;
    this.tasks.push({
      t: 0,
      dur,
      tick: () => {
        const n = Math.round(5 * this.budget + 1);
        for (let i = 0; i < n; i += 1) {
          const a = ang + rand(-0.36, 0.36);
          const sp = dist / rand(24, 36);
          this.spawn(from.x, from.y, {
            color: pick(pal.parts.slice(0, 2)), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rand(380, 560),
            scale: 0.3 * pal.size, scaleEnd: 0.95 * pal.size, alpha: pal.add ? 0.42 : 0.75, add: pal.add, drag: 0.985, gravity: (pal.gravity || 0) * 0.1,
          });
        }
      },
      done: () => {},
    });
    targets.forEach((p, i) => setTimeout(() => { if (hits[i]) onArrive(p, i); }, 380));
  }

  /** Pilar que sobe do chão em cada alvo (Coluna). */
  pillar(points, pal, hits, onArrive) {
    points.forEach((p, i) => {
      const ground = { x: p.x, y: p.y + this.g * 0.45 };
      this.ring(ground.x, ground.y, pal.glow, this.g * 0.7, 420);
      // A coluna em si: sobe rápido do chão e some.
      const column = new PIXI.Graphics();
      column.blendMode = pal.add ? 'add' : 'normal';
      this.layer.addChild(column);
      const w = this.g * 0.62;
      const hMax = this.g * 2.1;
      this.tasks.push({
        t: 0,
        dur: 520,
        tick: (task) => {
          const k = task.t / task.dur;
          const h = hMax * Math.min(1, k / 0.35);
          const fade = k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4;
          column.clear();
          column.roundRect(ground.x - w / 2, ground.y - h, w, h, w * 0.35).fill({ color: pal.glow, alpha: 0.55 * fade });
          column.roundRect(ground.x - w * 0.28, ground.y - h * 0.96, w * 0.56, h * 0.96, w * 0.25).fill({ color: pal.core, alpha: 0.6 * fade });
        },
        done: () => column.destroy(),
      });
      this.tasks.push({
        t: 0,
        dur: 420,
        tick: (task) => {
          const n = Math.round(4 * this.budget + 1);
          const k = task.t / task.dur;
          for (let j = 0; j < n; j += 1) {
            const spread = (rand(-1, 1) + rand(-1, 1)) * 0.5; // mais denso no centro
            this.spawn(ground.x + spread * this.g * 0.38 * (1 - k * 0.5), ground.y, {
              color: pick(pal.parts), vx: spread * 0.4, vy: -rand(3, 8), life: rand(300, 520),
              scale: rand(0.25, 0.5) * pal.size, scaleEnd: 0.04, alpha: pal.add ? 0.8 : 0.85, add: pal.add, drag: 0.96,
            });
          }
          // Lascas/pedras voando para os lados (com gravidade).
          if (Math.random() < 0.5 * this.budget) {
            const a = rand(-Math.PI, 0);
            this.spawn(ground.x, ground.y - this.g * 0.2, {
              color: pick(pal.parts), vx: Math.cos(a) * rand(2, 4), vy: Math.sin(a) * rand(3, 6), life: 520,
              scale: rand(0.15, 0.3) * pal.size, scaleEnd: 0.12, add: pal.add, gravity: 0.35, drag: 0.99,
            });
          }
        },
        done: () => {},
      });
      setTimeout(() => { if (hits[i]) onArrive(p, i); }, 260);
    });
  }

  /** Anel que se expande ao redor de quem usou (Onda Explosiva, Descarga). */
  nova(from, targets, pal, hits, onArrive) {
    const maxR = Math.max(this.g * 2, ...targets.map((p) => Math.hypot(p.x - from.x, p.y - from.y))) * 1.15;
    this.ring(from.x, from.y, pal.glow, maxR, 520);
    this.ring(from.x, from.y, pal.core, maxR * 0.8, 440);
    const n = Math.round(60 * this.budget);
    for (let i = 0; i < n; i += 1) {
      const a = (i / n) * Math.PI * 2;
      const sp = (maxR / 30) * rand(0.6, 1.05);
      this.spawn(from.x, from.y, { color: pick(pal.parts), vx: Math.cos(a + rand(-0.05, 0.05)) * sp, vy: Math.sin(a) * sp, life: rand(400, 560), scale: rand(0.35, 0.65) * pal.size, scaleEnd: 0.05, alpha: 0.8, add: pal.add, drag: 0.99 });
    }
    targets.forEach((p, i) => {
      const delay = (Math.hypot(p.x - from.x, p.y - from.y) / maxR) * 420;
      setTimeout(() => { if (hits[i]) onArrive(p, i); }, delay);
    });
  }

  // ---------------------------------------------------------------
  // Movimento do corpo (avanço, tremida, esquiva)
  // O pivot desloca o desenho do token sem mudar a posição salva.
  // ---------------------------------------------------------------

  motion(tokenId, dur, offsetAt) {
    const token = this.engine.tokens[tokenId];
    if (!token || token.container.destroyed) return;
    this.tasks.push({
      t: 0,
      dur,
      tick: (task) => {
        if (token.container.destroyed) return;
        const { x, y } = offsetAt(task.t / task.dur);
        token.container.pivot.set(-x, -y);
      },
      done: () => { if (!token.container.destroyed) token.container.pivot.set(0, 0); },
    });
  }

  /** Atacante avança até o alvo e volta. Retorna em quantos ms ele "chega". */
  lunge(fromId, to, { reach = 0.55, dur = 420, windup = 0 } = {}) {
    const token = this.engine.tokens[fromId];
    if (!token) return 0;
    const dx = to.x - token.container.x;
    const dy = to.y - (token.container.y - (token.heightPx || this.g) * 0.45);
    const dist = Math.hypot(dx, dy) || 1;
    const go = Math.min(dist * reach, Math.max(0, dist - this.g * 0.55), this.g * 1.4);
    const ux = dx / dist;
    const uy = dy / dist;
    if (Math.abs(dx) > 1) token.direction = dx > 0 ? 1 : -1;
    const w = windup / dur; // recua um pouco antes (golpe pesado)
    this.motion(fromId, dur, (k) => {
      let f;
      if (k < w) f = -0.25 * (k / w);
      else if (k < w + 0.3) f = -0.25 * (1 - (k - w) / 0.3) + ((k - w) / 0.3) ** 0.6;
      else if (k < w + 0.45) f = 1;
      else f = 1 - (k - w - 0.45) / (1 - w - 0.45);
      return { x: ux * go * f, y: uy * go * f * 0.6 };
    });
    return dur * (w + 0.3);
  }

  /** Alvo treme com o impacto. */
  shake(tokenId, power = 1, dur = 260) {
    this.motion(tokenId, dur, (k) => {
      const a = (1 - k) * this.g * 0.09 * power;
      return { x: Math.sin(k * 60) * a, y: Math.cos(k * 47) * a * 0.4 };
    });
  }

  /** Alvo esquiva para o lado (errou o golpe). */
  dodge(tokenId, from, dur = 420) {
    const token = this.engine.tokens[tokenId];
    if (!token) return;
    const dx = token.container.x - from.x;
    const dy = token.container.y - from.y;
    const len = Math.hypot(dx, dy) || 1;
    const side = Math.random() < 0.5 ? 1 : -1;
    const px = (-dy / len) * side * this.g * 0.42;
    const py = (dx / len) * side * this.g * 0.25;
    this.motion(tokenId, dur, (k) => {
      const f = k < 0.3 ? k / 0.3 : k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4;
      return { x: px * f, y: py * f - Math.sin(Math.min(1, k / 0.6) * Math.PI) * this.g * 0.12 };
    });
    this.afterimage(token);
  }

  /** "Rastro" da esquiva: um borrão que some no lugar de onde ele saiu. */
  afterimage(token) {
    const ghost = new PIXI.Sprite(this.texture);
    ghost.anchor.set(0.5);
    ghost.tint = 0xcfe6ff;
    ghost.blendMode = 'add';
    ghost.alpha = 0.45;
    ghost.scale.set((this.g * 1.1) / 64, ((token.heightPx || this.g) * 1.2) / 64);
    ghost.position.set(token.container.x, token.container.y - (token.heightPx || this.g) * 0.45);
    this.layer.addChild(ghost);
    this.tasks.push({ t: 0, dur: 380, tick: (task) => { ghost.alpha = 0.45 * (1 - task.t / task.dur); }, done: () => ghost.destroy() });
  }

  /** Estrela de impacto (linhas de velocidade saindo do ponto, estilo mangá). */
  impactStar(x, y, { color = 0xffffff, size = 1, lines = 10 } = {}) {
    const g = new PIXI.Graphics();
    g.position.set(x, y);
    g.blendMode = 'add';
    g.rotation = rand(0, Math.PI);
    this.layer.addChild(g);
    const r = this.g * 0.75 * size;
    this.tasks.push({
      t: 0,
      dur: 240,
      tick: (task) => {
        const k = task.t / task.dur;
        g.clear();
        for (let i = 0; i < lines; i += 1) {
          const a = (i / lines) * Math.PI * 2;
          const r0 = r * (0.25 + k * 0.5);
          const r1 = r * (0.6 + k * 0.6) * (i % 2 ? 0.75 : 1);
          g.moveTo(Math.cos(a) * r0, Math.sin(a) * r0).lineTo(Math.cos(a) * r1, Math.sin(a) * r1);
        }
        g.stroke({ width: 4 * (1 - k) + 1, color, alpha: 1 - k });
      },
      done: () => g.destroy(),
    });
  }

  // ---------------------------------------------------------------
  // Luta física e armas
  // ---------------------------------------------------------------

  /** Taijutsu: avança e solta uma sequência rápida de golpes. */
  punch(fromId, toId, to, hit, { pal = PALETAS.impacto, single = false } = {}) {
    const arrive = this.lunge(fromId, to, { reach: 0.6, dur: 560 });
    if (!hit) {
      setTimeout(() => this.dodge(toId, this.engine.tokens[fromId]?.container || to), arrive * 0.6);
      return;
    }
    // Rasengan: um único impacto grande que gira e explode.
    if (single) {
      setTimeout(() => {
        this.impactStar(to.x, to.y, { color: pal.core, size: 1.6, lines: 14 });
        this.ring(to.x, to.y, pal.glow, this.g * 1.4, 460);
        this.ring(to.x, to.y, pal.core, this.g * 0.9, 360);
        this.burst(to.x, to.y, pal, { count: 40, speed: 5.5, life: 520, size: 0.7 });
        this.shake(toId, 1.8, 380);
      }, arrive);
      return;
    }
    [0, 95, 190].forEach((delay, i) => setTimeout(() => {
      const px = to.x + rand(-0.25, 0.25) * this.g;
      const py = to.y + rand(-0.3, 0.2) * this.g;
      const last = i === 2;
      this.impactStar(px, py, { color: last ? 0xffd27a : 0xffffff, size: last ? 1.15 : 0.7 });
      this.burst(px, py, pal, { count: last ? 16 : 6, speed: last ? 4 : 2.2, life: 320, size: last ? 0.45 : 0.28, ring: last });
      this.shake(toId, last ? 1.3 : 0.6, last ? 280 : 120);
    }, arrive + delay));
  }

  /** Arma de corte: avança e corta em arco. */
  weaponSlash(fromId, toId, from, to, hit) {
    const arrive = this.lunge(fromId, to, { reach: 0.5, dur: 460 });
    setTimeout(() => {
      if (!hit) {
        this.dodge(toId, from);
        this.slash(from, { x: to.x + rand(-0.4, 0.4) * this.g, y: to.y }, PALETAS.arma, { hit: false });
        return;
      }
      this.slash(from, to, PALETAS.arma, {
        hit: true,
        onArrive: (p) => {
          this.burst(p.x, p.y, PALETAS.arma, { count: 12, speed: 3.2, size: 0.32 });
          this.shake(toId, 0.9);
        },
      });
    }, arrive * 0.7);
  }

  /** Perfuração (lança, pique, florete): estocada reta e rápida. */
  thrust(fromId, toId, from, to, hit) {
    const arrive = this.lunge(fromId, to, { reach: 0.45, dur: 380 });
    const g = new PIXI.Graphics();
    g.blendMode = 'add';
    this.layer.addChild(g);
    const ang = Math.atan2(to.y - from.y, to.x - from.x) + (hit ? 0 : rand(0.25, 0.4) * (Math.random() < 0.5 ? 1 : -1));
    const len = Math.hypot(to.x - from.x, to.y - from.y) + this.g * 0.5;
    this.tasks.push({
      t: 0,
      dur: arrive + 200,
      tick: (task) => {
        const k = Math.max(0, (task.t - arrive * 0.5) / (arrive * 0.5 + 200));
        g.clear();
        if (k <= 0) return;
        const head = Math.min(1, k * 1.8);
        const tail = Math.max(0, k * 1.8 - 0.8);
        const x0 = from.x + Math.cos(ang) * len * tail;
        const y0 = from.y + Math.sin(ang) * len * tail;
        const x1 = from.x + Math.cos(ang) * len * head;
        const y1 = from.y + Math.sin(ang) * len * head;
        g.moveTo(x0, y0).lineTo(x1, y1).stroke({ width: 10, color: 0xdfe6ee, alpha: 0.3 * (1 - k) });
        g.moveTo(x0, y0).lineTo(x1, y1).stroke({ width: 3, color: 0xffffff, alpha: 1 - k * 0.7 });
      },
      done: () => g.destroy(),
    });
    setTimeout(() => {
      if (hit) {
        this.impactStar(to.x, to.y, { size: 0.7, lines: 6 });
        this.burst(to.x, to.y, PALETAS.arma, { count: 8, speed: 3, size: 0.28, ring: false });
        this.shake(toId, 0.8, 200);
      } else this.dodge(toId, from);
    }, arrive);
  }

  /** Esmagamento (clava, maça, bastão, tonfa): recua, bate forte, levanta poeira. */
  smash(fromId, toId, from, to, hit) {
    const arrive = this.lunge(fromId, to, { reach: 0.55, dur: 620, windup: 160 });
    setTimeout(() => {
      if (!hit) {
        this.dodge(toId, from);
        const ground = { x: to.x + rand(-0.4, 0.4) * this.g, y: to.y + this.g * 0.4 };
        this.burst(ground.x, ground.y, PALETAS.poeira, { count: 10, speed: 2, size: 0.5, ring: false });
        return;
      }
      this.impactStar(to.x, to.y, { color: 0xffd27a, size: 1.3, lines: 12 });
      this.burst(to.x, to.y, PALETAS.impacto, { count: 14, speed: 4, size: 0.45 });
      this.ring(to.x, to.y + this.g * 0.4, 0xd8c3a0, this.g * 1.1, 420);
      this.burst(to.x, to.y + this.g * 0.4, PALETAS.poeira, { count: 12, speed: 2.4, size: 0.55, ring: false });
      this.shake(toId, 1.6, 340);
    }, arrive);
  }

  /** Desenho do que é arremessado (gira ou aponta para onde vai). */
  thrownGraphic(weapon) {
    const g = new PIXI.Graphics();
    const s = (this.g / 64) * (weapon === 'flecha' ? 1.4 : 1.15);
    if (weapon === 'shuriken' || weapon === 'fuuma') {
      const r = (weapon === 'fuuma' ? 22 : 14) * s;
      for (let i = 0; i < 4; i += 1) {
        const a = (i / 4) * Math.PI * 2;
        g.moveTo(0, 0)
          .lineTo(Math.cos(a - 0.35) * r * 0.35, Math.sin(a - 0.35) * r * 0.35)
          .lineTo(Math.cos(a) * r, Math.sin(a) * r)
          .lineTo(Math.cos(a + 0.35) * r * 0.35, Math.sin(a + 0.35) * r * 0.35)
          .closePath();
      }
      g.fill({ color: 0xc9d1dc }).stroke({ width: 1.5, color: 0x3a3f48 });
      g.circle(0, 0, r * 0.16).fill({ color: 0x2a2e35 });
      return { g, spin: weapon === 'fuuma' ? 0.025 : 0.045 };
    }
    if (weapon === 'senbon') {
      g.moveTo(-10 * s, 0).lineTo(10 * s, 0).stroke({ width: 1.5, color: 0xe8eef5 });
      return { g, spin: 0 };
    }
    if (weapon === 'flecha') {
      g.moveTo(-16 * s, 0).lineTo(14 * s, 0).stroke({ width: 2, color: 0x8b5a2b });
      g.moveTo(14 * s, 0).lineTo(8 * s, -4 * s).lineTo(8 * s, 4 * s).closePath().fill({ color: 0xc9d1dc });
      g.moveTo(-16 * s, 0).lineTo(-20 * s, -4 * s).moveTo(-16 * s, 0).lineTo(-20 * s, 4 * s).stroke({ width: 2, color: 0xeeeeee });
      return { g, spin: 0 };
    }
    // Kunai (lâmina + cabo + argola).
    g.moveTo(14 * s, 0).lineTo(2 * s, -4 * s).lineTo(-2 * s, 0).lineTo(2 * s, 4 * s).closePath().fill({ color: 0xc9d1dc }).stroke({ width: 1, color: 0x3a3f48 });
    g.rect(-11 * s, -1.5 * s, 9 * s, 3 * s).fill({ color: 0x2a2e35 });
    g.circle(-13 * s, 0, 2.5 * s).stroke({ width: 1.5, color: 0x2a2e35 });
    return { g, spin: 0 };
  }

  /** Arremesso/disparo: o objeto voa (girando, se for shuriken) e crava no alvo. */
  throwWeapon(from, toId, to, hit, weapon, { explode = false } = {}) {
    const end = hit ? to : {
      x: to.x + (to.x - from.x) * 0.4 + rand(-1, 1) * this.g * 0.5,
      y: to.y + (to.y - from.y) * 0.4 + rand(-1, 1) * this.g * 0.5,
    };
    const dist = Math.hypot(end.x - from.x, end.y - from.y);
    const dur = Math.max(200, Math.min(560, dist / (weapon === 'flecha' ? 2.2 : 1.6)));
    const lift = weapon === 'flecha' ? Math.min(this.g, dist * 0.12) : Math.min(this.g * 0.5, dist * 0.06);
    const { g, spin } = this.thrownGraphic(weapon);
    this.layer.addChild(g);
    let last = { ...from };
    this.tasks.push({
      t: 0,
      dur,
      tick: (task, delta) => {
        const k = task.t / task.dur;
        const x = from.x + (end.x - from.x) * k;
        const y = from.y + (end.y - from.y) * k - Math.sin(Math.PI * k) * lift;
        g.position.set(x, y);
        if (spin) g.rotation += delta * spin;
        else g.rotation = Math.atan2(y - last.y, x - last.x);
        last = { x, y };
        // Risco de velocidade atrás.
        if (Math.random() < 0.7 * this.budget) {
          this.spawn(x, y, { color: 0xffffff, life: 140, scale: 0.18, scaleEnd: 0.02, alpha: 0.6, add: true });
        }
      },
      done: () => {
        g.destroy();
        if (explode) {
          this.burst(end.x, end.y, PALETAS.katon, { count: 34, speed: 5, size: 0.8 });
          this.ring(end.x, end.y, 0xff7a1a, this.g * 1.6, 460);
          if (hit) this.shake(toId, 1.4, 320);
          return;
        }
        if (hit) {
          this.burst(end.x, end.y, PALETAS.arma, { count: 8, speed: 2.6, size: 0.28, ring: false });
          this.shake(toId, 0.6, 160);
        } else {
          this.dodge(toId, from, 360);
          this.burst(end.x, end.y, PALETAS.poeira, { count: 5, speed: 1.2, size: 0.3, ring: false });
        }
      },
    });
  }

  // ---------------------------------------------------------------
  // Entrada
  // ---------------------------------------------------------------

  play({ from, to = [], element = 'chakra', shape = 'projetil', hit = [], weapon = 'kunai' }) {
    const origin = this.anchor(from);
    const targets = to.map((id) => this.anchor(id));
    if (!origin || targets.some((t) => !t)) return;

    // Luta física e armas: cada uma do seu jeito.
    const melee = { golpe: 'punch', corte: 'weaponSlash', estocada: 'thrust', pancada: 'smash' }[shape];
    const pal = PALETAS[element] || PALETAS.chakra;
    if (melee || shape === 'arremesso' || shape === 'flecha' || shape === 'explosao') {
      to.forEach((id, i) => {
        const hitIt = hit[i] !== false;
        setTimeout(() => {
          if (shape === 'golpe') this.punch(from, id, targets[i], hitIt, element !== 'arma' ? { pal, single: weapon === 'rasengan' } : {});
          else if (melee) this[melee](from, id, origin, targets[i], hitIt);
          else this.throwWeapon(origin, id, targets[i], hitIt, shape === 'flecha' ? 'flecha' : weapon, { explode: shape === 'explosao' });
        }, i * 160);
      });
      return;
    }
    const hits = to.map((_, i) => hit[i] !== false);
    const impact = (p, opts = {}) => {
      if (opts.quiet) this.burst(p.x, p.y, pal, { count: 10, speed: 1.6, life: 380, size: 0.3, ring: false });
      else this.burst(p.x, p.y, pal, { count: element === 'arma' ? 10 : 26, speed: element === 'arma' ? 3 : 4.5, size: element === 'arma' ? 0.35 : 0.6 });
    };

    if (shape === 'cone') return this.cone(origin, targets, pal, hits, impact);
    if (shape === 'pilar') return this.pillar(targets, pal, hits, impact);
    if (shape === 'nova') return this.nova(origin, targets, pal, hits, impact);

    targets.forEach((p, i) => {
      const opts = { hit: hits[i], onArrive: impact };
      const delay = i * 160; // vários alvos (Ricochete): um depois do outro
      setTimeout(() => {
        if (shape === 'raio') this.lightning(i === 0 ? origin : targets[i - 1], p, pal, opts);
        else if (shape === 'corte_jutsu') this.slash(origin, p, pal, opts);
        else if (shape === 'enxame') this.swarm(origin, p, pal, opts);
        else if (shape === 'arremesso') this.projectile(origin, p, pal, { ...opts, thin: true });
        else this.projectile(origin, p, pal, opts);
      }, delay);
    });
  }

  tick(deltaMS) {
    if (!this.particles.length && !this.tasks.length) return;
    const step = deltaMS / 16.67;
    // Uma animação que termina pode criar outra (o anel do impacto, a esquiva...).
    // As novas entram numa lista à parte para não se perderem no meio do filtro.
    const running = this.tasks;
    this.tasks = [];
    const keep = running.filter((task) => {
      task.t += deltaMS;
      if (task.t >= task.dur) {
        task.done?.();
        return false;
      }
      task.tick(task, deltaMS);
      return true;
    });
    this.tasks = keep.concat(this.tasks);
    this.particles = this.particles.filter((p) => {
      p.life += deltaMS;
      if (p.life >= p.max) {
        p.sprite.destroy();
        return false;
      }
      const k = p.life / p.max;
      p.vx *= p.drag;
      p.vy = p.vy * p.drag + p.gravity * step;
      p.sprite.x += p.vx * step;
      p.sprite.y += p.vy * step;
      p.sprite.scale.set(p.scale + (p.scaleEnd - p.scale) * k);
      p.sprite.alpha = p.alpha * (1 - k * k);
      return true;
    });
  }

  destroy() {
    this.tasks.forEach((t) => t.done?.());
    this.tasks = [];
    this.particles = [];
    this.layer.destroy({ children: true });
    this.texture.destroy(true);
  }
}

/** Bolinha com borda suave (uma textura para todas as partículas). */
function makeSoftDot() {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.85)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  return PIXI.Texture.from(canvas);
}

/** Qual animação usar para um ataque de arma ou um jutsu. */
export function fxFor({ poderId = null, efeitoId = null, ataque = null, tipo = 'cc', arma = null, elemento = null } = {}) {
  if (!poderId) return weaponFx(arma, tipo);
  // Rasengan (e o Elemental, com a cor do elemento: Katon, Raiton ou Fuuton).
  if (poderId === 'rasengan') return { element: elemento && PALETAS[elemento] ? elemento : 'rasengan', shape: 'golpe', weapon: 'rasengan' };
  const element = {
    katon: 'katon', suiton: 'suiton', fuuton: 'fuuton', raiton: 'raiton', doton: 'doton', mokuton: 'mokuton',
    kikai_ninpou: 'insetos', kikaichuu: 'insetos', jiton_satetsu: 'satetsu', jiton_sakin: 'sakin', ninpou: 'chakra',
  }[poderId] || 'chakra';
  let shape = 'projetil';
  if (efeitoId === 'raio' || efeitoId === 'selar_chakra' || efeitoId === 'ricochete') shape = 'raio';
  else if (efeitoId === 'coluna') shape = 'pilar';
  else if (efeitoId === 'onda_explosiva' || efeitoId === 'descarga') shape = 'nova';
  else if (ataque === 'area') shape = 'cone';
  else if (efeitoId === 'lamina_de_raios') shape = 'corte_jutsu';
  else if (element === 'insetos') shape = 'enxame';
  else if (element === 'raiton' && efeitoId !== 'orbe') shape = 'raio';
  return { element, shape };
}

/**
 * Animação de um ataque com arma ou sem arma (Armas.js: grupo e tipo de dano).
 *  - Desarmado / ataque natural: sequência de socos (Taijutsu)
 *  - Corte: avança e corta · Perfuração: estocada · Esmagamento: pancada com poeira
 *  - Arremesso: shuriken girando, kunai, senbon · Disparo: flecha · Explosivo: tarja explodindo
 */
export function weaponFx(arma, tipo = 'cc') {
  const id = arma?.id || '';
  const grupo = arma?.grupo || '';
  const dano = (arma?.tipo || '').toLowerCase();
  const nome = (arma?.nome || '').toLowerCase();
  const fx = (shape, weapon) => ({ element: 'arma', shape, ...(weapon ? { weapon } : {}) });

  if (tipo !== 'cc') {
    if (grupo === 'explosivo') return fx('explosao', 'kunai');
    if (grupo === 'disparo') return fx('flecha');
    if (id.includes('fuuma')) return fx('arremesso', 'fuuma');
    if (id.includes('shuriken') || nome.includes('shuriken')) return fx('arremesso', 'shuriken');
    if (id.includes('senbon')) return fx('arremesso', 'senbon');
    return fx('arremesso', 'kunai');
  }
  if (!arma || grupo === 'desarmado' || !arma.id) return fx('golpe');
  if (dano.includes('corte')) return fx('corte');
  if (dano.includes('perfura')) return fx('estocada');
  if (dano.includes('esmag')) return fx('pancada');
  return fx('corte');
}
