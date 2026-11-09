import * as PIXI from 'pixi.js';

// Mesmo valor de HUD_Z do Engine.js (a camada fica logo abaixo do HUD).
const HUD_Z = 1e9;

/**
 * Clima e horário do mapa (rooms.scene_env).
 *
 *   scene_env = { weather, intensity, time, windDir }
 *     weather:   'clear' | 'rain' | 'storm' | 'snow' | 'wind' | 'fog'
 *     intensity: 0.2 a 1
 *     time:      'dawn' | 'day' | 'dusk' | 'night'
 *     windDir:   1 (vento para a direita) | -1 (para a esquerda)
 *     lights:    [{ id, x, y, radius (células), color, flicker }]
 *                pontos de luz soltos (postes e lanternas desenhados no mapa)
 *
 * Fica dentro do viewport, entre os tokens e o HUD: escurece mapa e personagens,
 * mas nomes e barras continuam legíveis. A cada quadro a camada se reposiciona
 * para cobrir exatamente a tela, então as partículas usam coordenadas de tela.
 */

export const DEFAULT_ENV = { weather: 'clear', intensity: 0.6, time: 'day', windDir: 1, lights: [] };

// Cor multiplicada sobre a cena em cada horário (branco = sem mudança).
const TIME_TINT = {
  dawn: 0xffd2bd,
  day: 0xffffff,
  dusk: 0xffc49a,
  night: 0x2c3870,
};

// Quanto as fontes de luz (fogueiras) brilham em cada horário.
const TIME_DARKNESS = { dawn: 0.35, day: 0, dusk: 0.55, night: 1 };

// Partículas por 1.000.000 px² de tela, com intensidade 1.
const DENSITY = { rain: 520, storm: 900, snow: 520, wind: 140, fog: 0, clear: 0 };
const MAX_PARTICLES = { desktop: 700, mobile: 260 };

const isMobile = () => typeof window !== 'undefined' && Math.min(window.innerWidth, window.innerHeight) < 700;

export class Atmosphere {
  constructor(engine) {
    this.engine = engine;
    this.env = { ...DEFAULT_ENV };
    this.time = 0;

    // Camada principal (escurecimento + partículas), abaixo do HUD.
    this.layer = new PIXI.Container();
    this.layer.zIndex = HUD_Z - 10;
    this.layer.eventMode = 'none';

    // Luz das fogueiras: por cima do escurecimento, em coordenadas do mundo.
    this.lightLayer = new PIXI.Container();
    this.lightLayer.zIndex = HUD_Z - 5;
    this.lightLayer.eventMode = 'none';
    this.lights = {}; // tokenId → Sprite

    // Iluminação real: uma "máscara de luz" do tamanho da tela é desenhada a cada quadro
    // (cor do horário + as luzes somadas por cima) e multiplicada sobre a cena.
    // Onde há luz, a máscara fica branca e o mapa aparece com as cores originais.
    this.currentTint = { r: 255, g: 255, b: 255 };
    this.maskScene = new PIXI.Container();
    this.maskBg = new PIXI.Sprite(PIXI.Texture.WHITE);
    this.maskLights = new PIXI.Container();
    this.maskScene.addChild(this.maskBg, this.maskLights);
    this.maskTexture = null;
    this.tint = new PIXI.Sprite(PIXI.Texture.WHITE);
    this.tint.blendMode = 'multiply';

    // Sombras projetadas pelos personagens (no mundo, logo abaixo de cada token).
    this.castShadows = {}; // "tokenId|lightKey" → Sprite

    this.fogLayer = new PIXI.Container();
    this.particleLayer = new PIXI.Container();

    // Clarão do relâmpago (tempestade).
    this.flash = new PIXI.Sprite(PIXI.Texture.WHITE);
    this.flash.blendMode = 'add';
    this.flash.alpha = 0;
    this.nextFlashIn = 4;

    this.layer.addChild(this.tint, this.fogLayer, this.particleLayer, this.flash);
    engine.viewport.addChild(this.layer, this.lightLayer);

    this.textures = this.createTextures();
    this.particles = [];
    this.fogs = [];
  }

  // ---------------------------------------------------------------
  // Texturas desenhadas por código (não precisa de imagem)
  // ---------------------------------------------------------------

  createTextures() {
    const radial = (size, stops) => {
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
      stops.forEach(([offset, color]) => gradient.addColorStop(offset, color));
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, size, size);
      return PIXI.Texture.from(canvas);
    };

    const drop = document.createElement('canvas');
    drop.width = 4;
    drop.height = 64;
    const dctx = drop.getContext('2d');
    const dg = dctx.createLinearGradient(0, 0, 0, 64);
    dg.addColorStop(0, 'rgba(200,220,255,0)');
    dg.addColorStop(1, 'rgba(210,225,255,0.85)');
    dctx.fillStyle = dg;
    dctx.fillRect(1, 0, 2, 64);

    const leaf = document.createElement('canvas');
    leaf.width = 16;
    leaf.height = 10;
    const lctx = leaf.getContext('2d');
    lctx.fillStyle = 'rgba(150,170,90,0.9)';
    lctx.beginPath();
    lctx.ellipse(8, 5, 7, 3.5, 0, 0, Math.PI * 2);
    lctx.fill();

    return {
      drop: PIXI.Texture.from(drop),
      flake: radial(32, [[0, 'rgba(255,255,255,1)'], [0.45, 'rgba(255,255,255,0.8)'], [1, 'rgba(255,255,255,0)']]),
      leaf: PIXI.Texture.from(leaf),
      dust: radial(16, [[0, 'rgba(230,215,180,0.7)'], [1, 'rgba(230,215,180,0)']]),
      fog: radial(256, [[0, 'rgba(225,230,235,0.55)'], [0.6, 'rgba(225,230,235,0.25)'], [1, 'rgba(225,230,235,0)']]),
      glow: radial(256, [[0, 'rgba(255,190,90,0.9)'], [0.35, 'rgba(255,140,40,0.45)'], [1, 'rgba(255,100,20,0)']]),
      // Luz branca: recebe a cor do ponto de luz pelo tint.
      light: radial(256, [[0, 'rgba(255,255,255,0.95)'], [0.25, 'rgba(255,255,255,0.55)'], [0.6, 'rgba(255,255,255,0.18)'], [1, 'rgba(255,255,255,0)']]),
    };
  }

  // ---------------------------------------------------------------
  // Configuração vinda da sala
  // ---------------------------------------------------------------

  setEnv(env) {
    const next = { ...DEFAULT_ENV, ...(env || {}) };
    // Cópia própria das luzes: o arraste no mapa mexe nelas sem tocar no estado do React.
    next.lights = (Array.isArray(next.lights) ? next.lights : []).map((light) => ({ ...light }));
    const weatherChanged = next.weather !== this.env.weather
      || next.intensity !== this.env.intensity;
    this.env = next;
    if (weatherChanged) this.rebuildWeather();
  }

  /** 0 = sem vento; 1 = vendaval. As árvores e o fogo usam isso. */
  get windStrength() {
    const base = { clear: 0.1, rain: 0.35, storm: 1, snow: 0.25, wind: 0.9, fog: 0 }[this.env.weather] ?? 0.1;
    return base * (this.env.weather === 'clear' ? 1 : this.env.intensity);
  }

  get windDir() {
    return this.env.windDir === -1 ? -1 : 1;
  }

  screenSize() {
    const { width, height } = this.engine.app.screen;
    return { width, height };
  }

  rebuildWeather() {
    this.particles.forEach((p) => p.destroy());
    this.particles = [];
    this.fogs.forEach((f) => f.destroy());
    this.fogs = [];

    const { weather, intensity } = this.env;
    const { width, height } = this.screenSize();

    const wanted = Math.round(((width * height) / 1e6) * (DENSITY[weather] || 0) * intensity);
    const max = isMobile() ? MAX_PARTICLES.mobile : MAX_PARTICLES.desktop;
    const count = Math.min(this.engine.lowPower ? Math.round(wanted / 2) : wanted, this.engine.lowPower ? max / 2 : max);
    for (let i = 0; i < count; i += 1) this.particles.push(this.spawnParticle(true));

    if (weather === 'fog' || weather === 'storm') {
      const light = this.engine.lowPower || isMobile();
      const fogCount = Math.round((weather === 'fog' ? 6 + intensity * 6 : 4) * (light ? 0.5 : 1));
      for (let i = 0; i < fogCount; i += 1) {
        const fog = new PIXI.Sprite(this.textures.fog);
        fog.anchor.set(0.5);
        fog.x = Math.random() * width;
        fog.y = Math.random() * height;
        fog.scale.set((2 + Math.random() * 3) * (0.6 + intensity * 0.6));
        fog.alpha = weather === 'fog' ? 0.12 + intensity * 0.22 : 0.1;
        fog.speed = 6 + Math.random() * 10;
        this.fogLayer.addChild(fog);
        this.fogs.push(fog);
      }
    }
  }

  spawnParticle(anywhere = false) {
    const { weather } = this.env;
    const { width, height } = this.screenSize();
    let sprite;

    if (weather === 'rain' || weather === 'storm') {
      sprite = new PIXI.Sprite(this.textures.drop);
      sprite.anchor.set(0.5, 1);
      const scale = 0.5 + Math.random() * 0.6;
      sprite.scale.set(scale);
      sprite.alpha = 0.35 + Math.random() * 0.4;
      sprite.vy = (weather === 'storm' ? 1300 : 950) * (0.8 + scale * 0.4);
      sprite.vx = this.windDir * sprite.vy * (weather === 'storm' ? 0.35 : 0.15);
      sprite.rotation = -Math.atan2(sprite.vx, sprite.vy);
    } else if (weather === 'snow') {
      sprite = new PIXI.Sprite(this.textures.flake);
      sprite.anchor.set(0.5);
      const scale = 0.22 + Math.random() * 0.3;
      sprite.scale.set(scale);
      sprite.alpha = 0.6 + Math.random() * 0.4;
      sprite.vy = 40 + scale * 160;
      sprite.vx = this.windDir * 25;
      sprite.phase = Math.random() * Math.PI * 2;
    } else {
      // Vento: folhas e poeira atravessando a tela.
      const isLeaf = Math.random() < 0.55;
      sprite = new PIXI.Sprite(isLeaf ? this.textures.leaf : this.textures.dust);
      sprite.anchor.set(0.5);
      sprite.scale.set(isLeaf ? 0.9 + Math.random() * 0.9 : 1 + Math.random() * 1.8);
      sprite.alpha = 0.5 + Math.random() * 0.4;
      sprite.vx = this.windDir * (380 + Math.random() * 320);
      sprite.vy = 30 + Math.random() * 60;
      sprite.spin = (Math.random() - 0.5) * 8;
      sprite.phase = Math.random() * Math.PI * 2;
    }

    this.placeParticle(sprite, anywhere, width, height);
    this.particleLayer.addChild(sprite);
    return sprite;
  }

  /** Coloca a partícula no topo (ou na lateral de onde vem o vento). */
  placeParticle(sprite, anywhere, width, height) {
    const margin = 80;
    if (anywhere) {
      sprite.x = Math.random() * width;
      sprite.y = Math.random() * height;
      return;
    }
    if (this.env.weather === 'wind') {
      sprite.x = this.windDir === 1 ? -margin : width + margin;
      sprite.y = Math.random() * height;
    } else {
      sprite.x = Math.random() * (width + margin * 2) - margin - sprite.vx * 0.5;
      sprite.y = -margin * Math.random() - 10;
    }
  }

  // ---------------------------------------------------------------
  // Quadro a quadro
  // ---------------------------------------------------------------

  tick(deltaMS) {
    const dt = deltaMS / 1000;
    this.time += dt;
    const { viewport } = this.engine;
    const { width, height } = this.screenSize();

    // A camada cobre sempre a tela, independente de zoom e posição da câmera.
    const scale = viewport.scale.x;
    this.layer.scale.set(1 / scale);
    this.layer.position.set(-viewport.x / scale, -viewport.y / scale);

    this.sceneLights = this.collectLights();
    this.updateTint(dt, width, height);
    this.updateParticles(dt, width, height);
    this.updateFog(dt, width, height);
    this.updateFlash(dt, width, height);
    this.updateLights();
    this.updateCastShadows();
  }

  updateTint(dt, width, height) {
    let target = TIME_TINT[this.env.time] ?? TIME_TINT.day;
    // Tempestade e neblina deixam a cena mais cinza/escura.
    if (this.env.weather === 'storm') target = multiplyColor(target, 0xa9b2c4);
    if (this.env.weather === 'rain') target = multiplyColor(target, 0xd2d8e2);
    if (this.env.weather === 'fog') target = multiplyColor(target, 0xe2e6ea);

    const goal = splitColor(target);
    const k = Math.min(1, dt * 1.5); // transição suave (~1 s)
    this.currentTint.r += (goal.r - this.currentTint.r) * k;
    this.currentTint.g += (goal.g - this.currentTint.g) * k;
    this.currentTint.b += (goal.b - this.currentTint.b) * k;

    const color = (Math.round(this.currentTint.r) << 16)
      | (Math.round(this.currentTint.g) << 8)
      | Math.round(this.currentTint.b);
    this.renderLightMask(color, width, height);
  }

  updateParticles(dt, width, height) {
    const { weather } = this.env;
    const margin = 100;

    this.particles.forEach((p) => {
      if (weather === 'snow') {
        p.phase += dt * 1.5;
        p.x += (p.vx + Math.sin(p.phase) * 30) * dt;
        p.y += p.vy * dt;
      } else if (weather === 'wind') {
        p.phase += dt * 3;
        p.x += p.vx * dt;
        p.y += (p.vy * Math.sin(p.phase)) * dt;
        p.rotation += p.spin * dt;
      } else {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }

      const out = p.y > height + margin || p.x < -margin * 2 || p.x > width + margin * 2;
      if (out) this.placeParticle(p, false, width, height);
    });
  }

  updateFog(dt, width, height) {
    this.fogs.forEach((f) => {
      f.x += f.speed * this.windDir * dt;
      const half = f.width / 2;
      if (this.windDir === 1 && f.x - half > width) f.x = -half;
      if (this.windDir === -1 && f.x + half < 0) f.x = width + half;
      if (f.y > height + f.height / 2) f.y = Math.random() * height;
    });
  }

  updateFlash(dt, width, height) {
    this.flash.width = width;
    this.flash.height = height;

    if (this.env.weather !== 'storm') {
      this.flash.alpha = 0;
      return;
    }

    this.nextFlashIn -= dt;
    if (this.nextFlashIn <= 0) {
      this.flash.alpha = 0.35 + this.env.intensity * 0.35;
      this.nextFlashIn = 5 + Math.random() * 10 * (1.4 - this.env.intensity);
      // Às vezes um segundo clarão logo depois, como relâmpago de verdade.
      if (Math.random() < 0.4) this.nextFlashIn = 0.18;
    }
    this.flash.alpha = Math.max(0, this.flash.alpha - dt * 2.2);
  }

  /** Quanto a cena está escura agora (0 = dia claro, 1 = noite fechada). */
  get darkness() {
    let darkness = TIME_DARKNESS[this.env.time] ?? 0;
    if (this.env.weather === 'storm') darkness = Math.min(1, darkness + 0.35);
    if (this.env.weather === 'rain') darkness = Math.min(1, darkness + 0.15);
    return darkness;
  }

  /**
   * Todas as luzes da cena, em coordenadas do mundo: fogueiras (itens com
   * animação de fogo) e os pontos de luz soltos que o Mestre coloca no mapa.
   */
  collectLights() {
    const cell = this.engine.gridSize;
    const lights = [];

    Object.values(this.engine.tokens).forEach((token) => {
      if (token.mode !== 'prop') return;
      const s = token.sprite;
      const fire = ['fogo', 'tocha', 'brasa'].includes(s.fx);
      // Luz do item: a configurada (sprite.light), ou a padrão de fogo/lanterna antiga.
      const light = s.light || (fire || s.anim === 'flicker' ? { radius: 4, color: '#ffb060' } : null);
      if (!light || light.off) return;
      const h = token.heightPx || cell;
      const height = s.fx === 'tocha' ? 0.92 : s.fx === 'fogo' ? 0.4 : s.builtin === 'vazio' ? 0.2 : 0.6;
      lights.push({
        key: `token:${token.data.id}`,
        sourceTokenId: token.data.id,
        x: token.container.x,
        y: token.container.y + token.footY - h * height,
        radius: Number(light.radius) || 4,
        color: parseColor(light.color || '#ffb060'),
        flicker: fire || s.anim === 'flicker',
        phase: token.time,
        glowTexture: this.textures.glow,
      });
    });

    const mapId = this.engine.activeMapId;
    (this.env.lights || []).forEach((light, index) => {
      if (light.mapId && mapId && light.mapId !== mapId) return; // luz de outro mapa
      lights.push({
        key: `light:${light.id}`,
        x: Number(light.x) || 0,
        y: Number(light.y) || 0,
        radius: Number(light.radius) || 4,
        color: parseColor(light.color),
        flicker: Boolean(light.flicker),
        phase: index * 1.7,
        glowTexture: this.textures.light,
      });
    });

    lights.forEach((light) => {
      light.wobble = light.flicker
        ? 1 + Math.sin(this.time * 11 + light.phase) * 0.04 + Math.sin(this.time * 7.1 + light.phase) * 0.03
        : 1;
      light.radiusPx = light.radius * cell * light.wobble; // alcance no mundo
    });
    return lights;
  }

  /**
   * Desenha a máscara: fundo na cor do horário e cada luz somada por cima (branca no
   * centro, sumindo na borda). O resultado multiplica a cena: escuro longe das luzes,
   * cores originais perto delas.
   */
  renderLightMask(color, width, height) {
    const lights = this.darkness > 0.01 ? this.sceneLights : [];
    const active = color !== 0xffffff;
    this.tint.visible = active;
    if (!active) return;

    // A máscara é borrada por natureza: meia resolução basta e economiza GPU.
    const w = Math.max(2, Math.ceil(width));
    const h = Math.max(2, Math.ceil(height));
    const resolution = this.engine.lowPower ? 0.25 : 0.5;
    if (!this.maskTexture || this.maskTexture.width !== w || this.maskTexture.height !== h || this.maskRes !== resolution) {
      this.maskTexture?.destroy(true);
      this.maskRes = resolution;
      this.maskTexture = PIXI.RenderTexture.create({ width: w, height: h, resolution });
      this.tint.texture = this.maskTexture;
      this.maskSig = null; // textura nova: precisa desenhar de novo
    }
    this.tint.width = width;
    this.tint.height = height;

    this.maskBg.width = w;
    this.maskBg.height = h;
    this.maskBg.tint = color;

    const { viewport } = this.engine;
    const scale = viewport.scale.x;

    // Só redesenha a máscara quando algo mudou (câmera, cor, luzes). Luz que tremula
    // (fogo) atualiza no máximo ~15 vezes por segundo.
    const flicker = lights.some((l) => l.flicker);
    const baseSig = `${color}|${w}x${h}|${viewport.x.toFixed(1)},${viewport.y.toFixed(1)},${scale.toFixed(4)}|${this.darkness.toFixed(2)}|${lights.length}`;
    const lightSig = lights.map((l) => (l.flicker ? `f${l.key}` : `${Math.round(l.x)},${Math.round(l.y)},${Math.round(l.radiusPx)},${l.color}`)).join(';');
    const now = this.time;
    const changed = baseSig !== this.maskSig || lightSig !== this.maskLightSig;
    const flickerDue = flicker && now - (this.maskAt || 0) >= 1 / 15;
    if (!changed && !flickerDue) return;
    this.maskSig = baseSig;
    this.maskLightSig = lightSig;
    this.maskAt = now;

    while (this.maskLights.children.length < lights.length) {
      const sprite = new PIXI.Sprite(this.textures.light);
      sprite.anchor.set(0.5);
      sprite.blendMode = 'add';
      this.maskLights.addChild(sprite);
    }
    this.maskLights.children.forEach((sprite, index) => {
      const light = lights[index];
      sprite.visible = Boolean(light);
      if (!light) return;
      const size = light.radiusPx * 2 * scale;
      sprite.x = viewport.x + light.x * scale;
      sprite.y = viewport.y + light.y * scale;
      sprite.width = size;
      sprite.height = size * 0.8; // luz no chão, em perspectiva
      sprite.tint = light.color;
      // Quanto mais escuro, mais a luz precisa "abrir" a escuridão.
      sprite.alpha = Math.min(1, 0.55 + this.darkness * 0.6) * (light.flicker ? 0.92 + Math.sin(this.time * 17 + light.phase) * 0.06 : 1);
    });

    this.engine.app.renderer.render({ container: this.maskScene, target: this.maskTexture, clear: true });
  }

  /** Halo colorido suave por cima da cena (a cor da chama, do poste…). */
  updateLights() {
    const darkness = this.darkness;
    const seen = new Set();

    (this.sceneLights || []).forEach((light) => {
      seen.add(light.key);
      let glow = this.lights[light.key];
      if (!glow || glow.texture !== light.glowTexture) {
        glow?.destroy();
        glow = new PIXI.Sprite(light.glowTexture);
        glow.anchor.set(0.5);
        glow.blendMode = 'add';
        this.lightLayer.addChild(glow);
        this.lights[light.key] = glow;
      }
      const size = light.radiusPx * 1.1;
      glow.width = size;
      glow.height = size * 0.8;
      glow.x = light.x;
      glow.y = light.y;
      glow.tint = light.glowTexture === this.textures.light ? light.color : 0xffffff;
      glow.alpha = darkness * 0.35;
      glow.visible = darkness > 0.01;
    });

    Object.keys(this.lights).forEach((key) => {
      if (seen.has(key)) return;
      this.lights[key].destroy();
      delete this.lights[key];
    });
  }

  /**
   * Sombras projetadas: cada personagem/item perto de uma luz ganha uma cópia escura
   * da própria imagem, deitada no chão e apontando para o lado oposto da luz.
   * Quanto mais longe da luz, mais comprida e mais fraca.
   */
  updateCastShadows() {
    const darkness = this.darkness;
    const lights = darkness > 0.05 ? (this.sceneLights || []) : [];
    const limit = this.engine.lowPower ? 0 : isMobile() ? 24 : 60; // modo leve: sem sombras projetadas
    const seen = new Set();
    let count = 0;

    Object.values(this.engine.tokens).forEach((token) => {
      const visual = token.visual;
      if (token.mode === 'disc' || !visual?.texture || token.container.destroyed || token.downStage) return;
      const feetX = token.container.x;
      const feetY = token.container.y + token.footY;

      lights.forEach((light) => {
        if (count >= limit || light.sourceTokenId === token.data.id) return;
        const dx = feetX - light.x;
        const dy = feetY - light.y;
        const dist = Math.hypot(dx, dy);
        const reach = light.radiusPx * 1.15;
        if (dist > reach || dist < 4) return;
        count += 1;

        const key = `${token.data.id}|${light.key}`;
        seen.add(key);
        let shadow = this.castShadows[key];
        if (!shadow) {
          shadow = new PIXI.Sprite(visual.texture);
          shadow.anchor.set(0.5, 1); // os pés ficam no ponto de contato com o chão
          shadow.tint = 0x000000;
          shadow.eventMode = 'none';
          this.engine.viewport.addChild(shadow);
          this.castShadows[key] = shadow;
        }
        if (shadow.texture !== visual.texture) shadow.texture = visual.texture;

        const closeness = 1 - dist / reach;               // 1 colado na luz, 0 na borda
        const length = 0.45 + (1 - closeness) * 0.9;     // mais longe = sombra mais comprida
        const sx = Math.abs(visual.scale.x) * Math.abs(token.body.scale.x || 1);
        const sy = Math.abs(visual.scale.y);
        shadow.scale.set(sx * 0.9, sy * length);
        // Gira a "cabeça" da sombra para longe da luz (a imagem aponta para cima por padrão).
        shadow.rotation = Math.atan2(dx, -dy);
        shadow.x = feetX;
        shadow.y = feetY;
        shadow.alpha = Math.min(0.6, darkness * (0.25 + closeness * 0.55));
        shadow.zIndex = token.container.zIndex - 0.5; // logo atrás do próprio token
        shadow.visible = token.container.visible;
      });
    });

    Object.keys(this.castShadows).forEach((key) => {
      if (seen.has(key)) return;
      this.castShadows[key].destroy();
      delete this.castShadows[key];
    });
  }

  /** A tela mudou de tamanho: redistribui as partículas. */
  resize() {
    this.rebuildWeather();
  }

  destroy() {
    Object.values(this.castShadows).forEach((shadow) => shadow.destroy());
    this.castShadows = {};
    this.maskScene.destroy({ children: true });
    this.maskTexture?.destroy(true);
    this.particles = [];
    this.fogs = [];
    this.lights = {};
    this.layer.destroy({ children: true });
    this.lightLayer.destroy({ children: true });
    Object.values(this.textures).forEach((texture) => texture.destroy(true));
  }
}

/** Aceita '#ffcc66', 'ffcc66' ou número. */
export function parseColor(value) {
  if (typeof value === 'number') return value;
  const hex = String(value || '#ffcc66').replace('#', '');
  const parsed = parseInt(hex, 16);
  return Number.isNaN(parsed) ? 0xffcc66 : parsed;
}

function splitColor(color) {
  return { r: (color >> 16) & 0xff, g: (color >> 8) & 0xff, b: color & 0xff };
}

function multiplyColor(a, b) {
  const x = splitColor(a);
  const y = splitColor(b);
  return (Math.round((x.r * y.r) / 255) << 16)
    | (Math.round((x.g * y.g) / 255) << 8)
    | Math.round((x.b * y.b) / 255);
}
