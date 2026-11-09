import * as PIXI from 'pixi.js';
import { condicoesDe } from '../data/Condicoes.js';
import { builtinTexture } from './PropFx.js';
import { supabase } from '../services/supabase/client';
import { sizeInfo } from '../data/Tamanhos.js';

// Quanto a figura cresce em cada categoria de tamanho (só o desenho; as regras ficam em Tamanhos.js).
const ESCALA_TAMANHO = [0.35, 0.45, 0.6, 0.8, 1, 1.5, 2.1, 2.8, 3.6, 4.5];

/**
 * Token do mapa. Três formas de desenhar (campo `sprite` de map_tokens):
 *
 *  - 'figure' → personagem de corpo inteiro, em pé na célula (PNG transparente).
 *               sprite: { mode: 'figure', url, heightCells, facing: 'right' | 'left' }
 *  - 'prop'   → item de cenário (árvore, fogueira…), só o Mestre mexe.
 *               sprite: { mode: 'prop', url, heightCells, anim: 'sway' | 'flicker' | 'none' }
 *  - 'disc'   → token antigo (imagem redonda/quadrada no centro da célula).
 *
 * A "sensação de 3D" vem de: pés no chão + sombra, ordenação pela profundidade
 * (quem está mais abaixo aparece na frente) e animação de respirar/andar.
 */

const WALK_SPEED_CELLS = 5;   // velocidade da caminhada animada (células por segundo)
const CAST_ALPHA = 0.28;      // força da sombra do sol (some à noite)
const CAST_SKEW = 1.1;        // inclinação da sombra deitada no chão
const CAST_LENGTH = 0.8;      // comprimento da sombra em relação à altura

// Ferimentos (pág. 259): 0 = fora de combate · −1 a −10 inconsciente ·
// −11 a −20 morrendo (sangrando) · −21 ou menos morto.
const ESTADOS_QUEDA = {
  caido: { label: 'caído', tint: 0xffffff, pool: 0 },
  inconsciente: { label: 'inconsciente', tint: 0xd8cfcf, pool: 0.22 },
  morrendo: { label: 'morrendo', tint: 0xc9b9b9, pool: 0.55 },
  morto: { label: 'morto', tint: 0x7d7676, pool: 0.85 },
};

export function estadoQueda(hp, max) {
  if (!(max > 0) || hp > 0) return null;
  if (hp <= -21) return 'morto';
  if (hp <= -11) return 'morrendo';
  if (hp <= -1) return 'inconsciente';
  return 'caido';
}

// Onde a imagem realmente toca o chão. Muitas imagens têm borda transparente
// embaixo e o item parece flutuar. Mede uma vez por imagem (cópia pequena, rápido).
const opaqueCache = new WeakMap();
function opaqueBounds(texture) {
  const source = texture?.source;
  if (!source) return null;
  if (opaqueCache.has(source)) return opaqueCache.get(source);
  let result = null;
  try {
    const frame = texture.frame;
    const w = 64;
    const h = Math.max(8, Math.min(256, Math.round((w * frame.height) / Math.max(1, frame.width))));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(source.resource, frame.x, frame.y, frame.width, frame.height, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h).data;
    const solid = (x, y) => data[(y * w + x) * 4 + 3] > 60;
    let bottom = -1;
    for (let y = h - 1; y >= 0 && bottom < 0; y -= 1) {
      for (let x = 0; x < w; x += 1) if (solid(x, y)) { bottom = y; break; }
    }
    if (bottom >= 0) {
      const band = Math.max(1, Math.round(h * 0.08)); // largura da base: linhas de baixo
      let left = w;
      let right = -1;
      for (let y = Math.max(0, bottom - band); y <= bottom; y += 1) {
        for (let x = 0; x < w; x += 1) {
          if (!solid(x, y)) continue;
          if (x < left) left = x;
          if (x > right) right = x;
        }
      }
      result = { bottom: (bottom + 1) / h, base: (right + 1 - left) / w };
    }
  } catch {
    result = null; // imagem sem permissão de leitura (CORS) ou gerada na GPU
  }
  opaqueCache.set(source, result);
  return result;
}
const FOOT_RATIO = 0.32;      // onde ficam os pés: um pouco abaixo do centro da célula

export class Token {
  constructor(engine, tokenData, gridSize = 64) {
    this.engine = engine;
    this.gridSize = gridSize;
    this.data = tokenData;

    this.container = new PIXI.Container();
    this.container.x = Number(tokenData.x || 0);
    this.container.y = Number(tokenData.y || 0);
    this.container.eventMode = 'static';
    this.container.cursor = 'pointer';
    this.container.tokenId = tokenData.id; // usado pelo CanvasEngine.getTokenAt()
    this.container.interactiveChildren = false;

    // Estado de animação
    this.time = Math.random() * 10; // fase aleatória: nem todos respiram juntos
    this.walkTime = 0;
    this.direction = 1;             // 1 = olhando para a direita, -1 = esquerda
    this.target = null;             // destino da caminhada animada
    this.pathQueue = [];            // próximos pontos do caminho (movimento em blocos)
    this.moveOrigin = null;         // onde o token estava antes de arrastar
    this.lastMoveAt = 0;
    this.isDragging = false;
    this.dragOffset = null;
    this.isTurn = false;
    this.downStage = null;          // caído / inconsciente / morrendo / morto
    this.fallProgress = 0;
    this.poolDrawn = 0;
    this.castShadow = null;
    this.baseWidth = gridSize * 0.5;

    // Camadas: sombra → corpo (animado) → HUD
    this.shadow = new PIXI.Graphics();
    this.pool = new PIXI.Graphics(); // poça de sangue de quem caiu
    this.body = new PIXI.Container();
    this.container.addChild(this.shadow, this.pool, this.body);

    // O HUD fica numa camada própria do engine (por cima de árvores etc.)
    // e segue a posição do token a cada quadro.
    this.hud = new PIXI.Container();
    this.hudOffsetY = 0;
    this.engine.hudLayer.addChild(this.hud);

    this.visual = null;
    this.visualKey = null;
    this.heightPx = gridSize;

    this.createHud();
    this.applyVisual();
    this.setupInteractivity();
    this.updateDepth();
    this.ready = true;

    this.engine.viewport.addChild(this.container);
  }

  // ---------------------------------------------------------------
  // Configuração visual
  // ---------------------------------------------------------------

  get sprite() {
    return this.data.sprite && typeof this.data.sprite === 'object' ? this.data.sprite : {};
  }

  get mode() {
    if (this.sprite.mode === 'prop') return 'prop';
    if (this.sprite.url) return 'figure';
    return 'disc';
  }

  get footY() {
    return this.mode === 'disc' ? 0 : this.gridSize * FOOT_RATIO;
  }

  /**
   * O Mestre mudou o Tamanho (⚙️ Tamanho e deslocamento): a figura cresce/encolhe
   * em relação ao tamanho da ficha (a altura do token já foi pensada para ele).
   */
  get sizeScale() {
    if (this.mode !== 'figure') return 1;
    const c = this.getCharacter?.();
    const override = c?.overrides?.tamanho;
    if (!override) return 1;
    const base = c?.attributes?.tamanho || c?.attributes?.npc?.size || 'medio';
    return (ESCALA_TAMANHO[sizeInfo(override).ordem] || 1) / (ESCALA_TAMANHO[sizeInfo(base).ordem] || 1);
  }

  /** (Re)carrega a imagem só quando algo visual mudou. */
  applyVisual() {
    const s = this.sprite;
    const key = JSON.stringify([this.mode, s.url, s.builtin, s.heightCells, s.facing, this.data.image_url, this.sizeScale]);
    if (key === this.visualKey) return;
    this.visualKey = key;

    if (this.mode === 'disc') this.loadDisc(this.data.image_url, key);
    else if (this.mode === 'prop' && s.builtin) this.useFigureTexture(builtinTexture(s.builtin));
    else this.loadFigure(s.url, key);
  }

  async loadFigure(url, key) {
    try {
      // Mipmaps deixam a imagem grande nítida quando é reduzida no mapa.
      const texture = await PIXI.Assets.load({ src: url, data: { autoGenerateMipmaps: true } });
      if (this.container.destroyed || this.visualKey !== key) return;
      this.useFigureTexture(texture);
    } catch (error) {
      // Imagem padrão ainda não colocada em public/sprites: tenta a reserva do tipo, depois a bolinha.
      const fallback = this.sprite.fallback;
      if (fallback && url !== fallback && !this.container.destroyed && this.visualKey === key) {
        this.loadFigure(fallback, key);
        return;
      }
      console.warn('Imagem do token não carregou, usando o disco padrão:', error);
      if (!this.container.destroyed) this.loadDisc(this.data.image_url, key);
    }
  }

  /** Monta o corpo do personagem/item a partir da textura (âncora nos pés). */
  useFigureTexture(texture) {
    {
      const sprite = new PIXI.Sprite(texture);
      sprite.anchor.set(0.5, 1); // âncora nos pés

      const defaultHeight = this.mode === 'prop' ? 2 : 1.8;
      const heightCells = (Number(this.sprite.heightCells) || defaultHeight) * this.sizeScale;
      this.heightPx = heightCells * this.gridSize;
      sprite.scale.set(this.heightPx / texture.height);

      // A parte visível da imagem encosta no chão (sem "flutuar" por causa da borda transparente).
      const bounds = this.sprite.builtin ? null : opaqueBounds(texture);
      sprite.y = bounds ? Math.min(0.5, 1 - bounds.bottom) * this.heightPx : 0;
      this.baseWidth = bounds ? bounds.base * sprite.width : sprite.width * 0.5;

      this.setVisual(sprite);

      // Área clicável: o corpo do personagem (ou o item inteiro).
      const width = this.mode === 'prop'
        ? sprite.width
        : Math.min(Math.max(sprite.width * 0.55, this.gridSize * 0.6), this.gridSize);
      this.standHitArea = new PIXI.Rectangle(-width / 2, this.footY - this.heightPx, width, this.heightPx);
      this.container.hitArea = this.standHitArea;

      // Efeito solto (sem imagem): só o Mestre vê o marcador, para achar e mover.
      if (this.sprite.builtin === 'vazio') {
        sprite.alpha = this.engine.isGM ? 0.45 : 0;
        this.shadow.clear();
        this.removeCastShadow();
      } else {
        this.drawGroundShadow(sprite);
      }
      this.applyDownLook();
    }
  }

  async loadDisc(imageUrl, key) {
    let visual;
    try {
      if (!imageUrl) throw new Error('Token sem imagem.');
      const texture = await PIXI.Assets.load(imageUrl);
      if (this.container.destroyed || this.visualKey !== key) return;
      visual = new PIXI.Sprite(texture);
      visual.width = this.gridSize;
      visual.height = this.gridSize;
      visual.anchor.set(0.5);
    } catch {
      if (this.container.destroyed) return;
      visual = new PIXI.Graphics();
      visual.circle(0, 0, this.gridSize / 2);
      visual.fill(0xff0000);
      visual.stroke({ width: 2, color: 0xffffff });
    }

    this.heightPx = this.gridSize;
    this.setVisual(visual);
    const half = this.gridSize / 2;
    this.container.hitArea = new PIXI.Rectangle(-half, -half, this.gridSize, this.gridSize);
    this.shadow.clear();
    this.removeCastShadow();
    this.applyDownLook();
  }

  setVisual(visual) {
    if (this.visual) this.visual.destroy();
    this.visual = visual;
    this.body.addChild(visual);
    this.body.position.set(0, this.footY);
    this.layoutHud();
  }

  /**
   * Sombra no chão em duas partes:
   *  - contato: elipse fina e escura do tamanho da base (prende o objeto no chão);
   *  - sol: a silhueta escura deitada no chão, inclinada (some à noite e no modo leve).
   */
  drawGroundShadow(sprite) {
    const g = this.gridSize;
    const contact = this.mode === 'prop'
      ? Math.max(g * 0.16, Math.min(this.baseWidth * 0.62, g * 1.4))
      : g * 0.3;
    this.shadow.clear();
    this.shadow.ellipse(0, this.footY, contact, contact * 0.24);
    this.shadow.fill({ color: 0x000000, alpha: 0.4 });

    this.removeCastShadow();
    // Fogo e efeitos desenhados não fazem sombra de sol; modo leve também não.
    if (this.engine.lowPower || this.sprite.builtin || this.sprite.anim === 'flicker') return;
    const cast = new PIXI.Sprite(sprite.texture);
    cast.anchor.set(0.5, 1);
    cast.tint = 0x000000;
    cast.eventMode = 'none';
    cast.scale.set(sprite.scale.x, sprite.scale.y * CAST_LENGTH);
    cast.skew.x = CAST_SKEW;
    // A borda transparente de baixo também deita: compensa para a base ficar nos pés.
    const lift = sprite.y * CAST_LENGTH;
    cast.position.set(Math.sin(CAST_SKEW) * lift, this.footY + Math.cos(CAST_SKEW) * lift);
    cast.alpha = CAST_ALPHA;
    this.container.addChildAt(cast, 0);
    this.castShadow = cast;
  }

  removeCastShadow() {
    this.castShadow?.destroy();
    this.castShadow = null;
  }

  /** Sombra do sol acompanha o lado que o personagem olha e some no escuro. */
  updateCastShadow(flip) {
    const cast = this.castShadow;
    if (!cast) return;
    const darkness = this.engine.atmosphere?.darkness ?? 0;
    cast.alpha = CAST_ALPHA * (1 - darkness) * (this.downStage ? 0 : 1);
    cast.visible = cast.alpha > 0.01;
    if (Math.sign(cast.scale.x) !== flip) cast.scale.x = Math.abs(cast.scale.x) * flip;
  }

  // ---------------------------------------------------------------
  // Queda (Vitalidade 0 ou menos)
  // ---------------------------------------------------------------

  setDownStage(stage) {
    const wasDown = Boolean(this.downStage);
    this.downStage = stage;
    if (stage && !wasDown) this.fallProgress = this.ready ? 0 : 1; // ao abrir a mesa já aparece caído
    if (!stage) this.fallProgress = 0;
    this.applyDownLook();
  }

  /** Cor, área clicável e HUD de acordo com o estado (em pé ou caído). */
  applyDownLook() {
    if (this.container.destroyed || !this.visual) return;
    const info = ESTADOS_QUEDA[this.downStage];
    if ('tint' in this.visual) this.visual.tint = info ? info.tint : 0xffffff;
    if (this.mode === 'disc') {
      this.visual.alpha = this.downStage === 'morto' ? 0.5 : this.downStage ? 0.75 : 1;
      this.visual.rotation = this.downStage ? Math.PI / 2 : 0;
    }
    if (this.mode === 'figure') {
      const g = this.gridSize;
      this.container.hitArea = info
        ? new PIXI.Rectangle(-this.heightPx / 2, this.footY - g * 0.5, this.heightPx, g * 0.8)
        : this.standHitArea || this.container.hitArea;
    }
    if (!info) this.pool.clear();
    this.poolDrawn = info ? this.poolDrawn : 0;
    this.layoutHud();
  }

  /** Poça de sangue embaixo de quem caiu (formato fixo por token). */
  drawPool(radius) {
    this.pool.clear();
    if (radius < 1) return;
    let seed = 0;
    String(this.data.id || '').split('').forEach((c) => { seed = (seed * 31 + c.charCodeAt(0)) >>> 0; });
    const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const y = this.footY + this.gridSize * 0.04;
    this.pool.ellipse(0, y, radius, radius * 0.42);
    for (let i = 0; i < 5; i += 1) {
      const angle = rand() * Math.PI * 2;
      const r = radius * (0.35 + rand() * 0.35);
      this.pool.ellipse(Math.cos(angle) * radius * 0.7, y + Math.sin(angle) * radius * 0.28, r, r * 0.42);
    }
    this.pool.fill({ color: 0x5c0505, alpha: 0.82 });
    this.pool.ellipse(-radius * 0.2, y - radius * 0.08, radius * 0.45, radius * 0.14);
    this.pool.fill({ color: 0x9b1111, alpha: 0.35 }); // brilho
  }

  /** Profundidade: quem tem os pés mais abaixo é desenhado na frente. */
  updateDepth() {
    this.container.zIndex = this.container.y + this.footY;
  }

  // ---------------------------------------------------------------
  // HUD (nome, Vitalidade, Chakra) — visibilidade controlada pelo Mestre
  // ---------------------------------------------------------------

  getCharacter() {
    if (!this.data.character_id) return null;
    return this.engine.characters[this.data.character_id] ?? null;
  }

  getDisplayName() {
    return this.getCharacter()?.name || this.data.name || 'Token';
  }

  getHp() {
    const character = this.getCharacter();
    if (character) {
      return { current: Number(character.hp_current ?? 0), max: Number(character.hp_max ?? 1) };
    }
    const max = Number(this.data.hp_max ?? this.data.max_hp ?? 100);
    return { current: Number(this.data.hp_current ?? this.data.hp ?? max), max };
  }

  createHud() {
    this.nameText = new PIXI.Text({
      text: this.getDisplayName(),
      style: {
        fontFamily: 'Arial',
        fontSize: 11,
        fill: 0xffffff,
        align: 'center',
        dropShadow: { distance: 1, blur: 0, color: 0x000000, alpha: 1 },
      },
    });
    this.nameText.anchor.set(0.5, 1);

    this.hpBar = new PIXI.Graphics();
    this.chakraBar = new PIXI.Graphics();
    this.hud.addChild(this.hpBar, this.chakraBar, this.nameText);
    this.refreshHud();
  }

  /** Posiciona o HUD logo acima da cabeça. */
  layoutHud() {
    let top = this.mode === 'disc' ? -this.gridSize / 2 : this.footY - this.heightPx;
    if (this.downStage && this.mode === 'figure') top = this.footY - this.gridSize * 0.55;
    this.hudOffsetY = top - 14;
    this.syncHud();
  }

  /** Mantém o HUD em cima da cabeça (ele mora em outra camada). */
  syncHud() {
    this.hud.position.set(this.container.x, this.container.y + this.hudOffsetY);
  }

  destroy() {
    this.hud.destroy({ children: true });
    this.container.destroy({ children: true });
  }

  refreshHud() {
    if (this.container.destroyed) return;

    // Itens de cenário não têm HUD.
    if (this.mode === 'prop') {
      this.hud.visible = false;
      return;
    }

    const show = (key) => this.engine.canSeeHud(key);
    const character = this.getCharacter();

    const hp = this.getHp();
    const stage = estadoQueda(hp.current, hp.max);
    if (stage !== this.downStage) this.setDownStage(stage);
    // Ícones das condições prejudiciais (atordoado 💫, lento 🐢…), menos as que a queda já mostra.
    const icones = condicoesDe(this.getCharacter?.() || null)
      .filter((c) => c.id !== 'inconsciente' && c.id !== 'indefeso')
      .map((c) => c.icone)
      .join('');
    this.nameText.text = this.getDisplayName() + (stage ? ` · ${ESTADOS_QUEDA[stage].label}` : '') + (icones ? ` ${icones}` : '');
    this.nameText.visible = show('show_names');
    this.nameText.y = -2;

    this.drawBar(this.hpBar, hp, show('show_hp'), 0, true);
    this.drawBar(
      this.chakraBar,
      character ? { current: Number(character.chakra_current ?? 0), max: Number(character.chakra_max ?? 1) } : null,
      Boolean(character) && show('show_chakra'),
      6,
      false
    );

    this.hud.visible = this.nameText.visible || this.hpBar.visible || this.chakraBar.visible;
    this.setTurnHighlight(this.isTurn);
  }

  drawBar(graphics, value, visible, offsetY, isHp) {
    graphics.clear();
    graphics.visible = Boolean(visible && value);
    if (!graphics.visible) return;

    const max = Math.max(1, value.max);
    const ratio = Math.max(0, Math.min(value.current, max)) / max;

    let color = 0x38bdf8; // chakra
    if (isHp) {
      color = 0x22c55e;
      if (ratio < 0.5) color = 0xeab308;
      if (ratio < 0.2) color = 0xef4444;
    }

    graphics.rect(-30, offsetY, 60, 4);
    graphics.fill(0x000000);
    graphics.stroke({ width: 1, color: 0xffffff, alpha: 0.7 });
    graphics.rect(-30, offsetY, ratio * 60, 4);
    graphics.fill(color);
  }

  /** Vez do token no combate: só o nome fica dourado (discreto). */
  setTurnHighlight(isActive) {
    this.isTurn = isActive;
    if (this.container.destroyed || !this.nameText) return;
    this.nameText.style.fill = isActive ? 0xfbbf24 : 0xffffff;
    this.nameText.style.fontWeight = isActive ? 'bold' : 'normal';
  }

  // ---------------------------------------------------------------
  // Animação (chamada a cada quadro pelo CanvasEngine)
  // ---------------------------------------------------------------

  tick(deltaMS) {
    if (this.container.destroyed) return;
    const dt = deltaMS / 1000;
    this.time += dt;

    // Caminhada animada até o destino (movimento vindo do Realtime).
    if (this.target && !this.isDragging) {
      const dx = this.target.x - this.container.x;
      const dy = this.target.y - this.container.y;
      const distance = Math.hypot(dx, dy);
      const step = WALK_SPEED_CELLS * this.gridSize * dt;

      if (Math.abs(dx) > 1) this.direction = dx > 0 ? 1 : -1;

      if (distance <= step) {
        this.container.position.set(this.target.x, this.target.y);
        this.target = this.pathQueue.length ? this.pathQueue.shift() : null;
      } else {
        this.container.x += (dx / distance) * step;
        this.container.y += (dy / distance) * step;
        this.lastMoveAt = performance.now();
      }
      this.updateDepth();
    }

    const walking = performance.now() - this.lastMoveAt < 140;

    if (this.mode === 'figure') this.animateFigure(walking, dt);
    else if (this.mode === 'prop') this.animateProp();

    this.syncHud();
  }

  animateFigure(walking, dt) {
    const natural = this.sprite.facing === 'left' ? -1 : 1;
    const flip = this.direction * natural;
    const g = this.gridSize;
    this.updateCastShadow(flip);

    if (this.downStage) {
      // Cai de costas, para o lado contrário ao que olha, e fica deitado no bloco.
      this.fallProgress = Math.min(1, this.fallProgress + dt * 2.4);
      const p = this.fallProgress;
      const ease = p < 1 ? 1 - (1 - p) ** 3 : 1;
      const bounce = p < 1 ? Math.sin(p * Math.PI) * 0.06 : 0;
      this.body.rotation = -flip * (Math.PI / 2) * ease;
      this.body.x = flip * this.heightPx * 0.5 * ease;
      this.body.y = this.footY - bounce * g;
      this.body.scale.set(flip, 1);
      this.shadow.scale.set(1 + ease * 1.2, 1);
      const info = ESTADOS_QUEDA[this.downStage];
      const target = info.pool * g;
      if (target > 0 && p >= 1 && this.poolDrawn < target) {
        // A poça cresce devagar depois da queda.
        this.poolDrawn = Math.min(target, this.poolDrawn + dt * g * 0.12);
        this.drawPool(this.poolDrawn);
      } else if (target === 0 && this.poolDrawn) {
        this.poolDrawn = 0;
        this.pool.clear();
      }
      return;
    }
    this.body.x *= 0.8; // levantando: volta ao centro junto com a rotação

    if (walking) {
      // Passos: sobe e desce, com uma leve inclinação.
      this.walkTime += dt * 11;
      const bob = Math.abs(Math.sin(this.walkTime)) * g * 0.05;
      this.body.y = this.footY - bob;
      this.body.rotation = Math.sin(this.walkTime) * 0.035;
      this.body.scale.set(flip, 1);
      this.shadow.scale.set(1 - bob / (g * 0.4), 1);
    } else {
      // Respiração: o peito "sobe" a partir dos pés.
      const breath = Math.sin(this.time * 2.1);
      this.body.y = this.footY;
      this.body.rotation *= 0.8;
      this.body.scale.set(flip * (1 - breath * 0.004), 1 + breath * 0.012);
      this.shadow.scale.set(1, 1);
    }
  }

  animateProp() {
    const anim = this.sprite.anim || 'none';
    // Força do vento do clima atual (0 a 1) e para que lado sopra.
    const wind = this.engine.atmosphere?.windStrength ?? 0.1;
    const windDir = this.engine.atmosphere?.windDir ?? 1;

    if (anim === 'sway') {
      // Vento: a copa balança, a base fica parada (âncora nos pés).
      // Com vento forte, balança mais rápido e fica inclinada para o lado do vento.
      const speed = 1.1 + wind * 2.2;
      const amplitude = 0.02 + wind * 0.05;
      const lean = windDir * wind * 0.06;
      const gust = Math.sin(this.time * 0.37) * 0.5 + 0.5; // rajadas
      this.body.skew.x = -(lean * (0.7 + gust * 0.3) + Math.sin(this.time * speed) * amplitude);
    } else if (anim === 'flicker') {
      const flicker = (Math.sin(this.time * 13) + Math.sin(this.time * 7.3)) * 0.03;
      this.body.scale.set(1 + flicker * 0.4, 1 + flicker);
      this.body.alpha = 0.92 + Math.sin(this.time * 17) * 0.08;
      this.body.skew.x = -windDir * wind * 0.25; // a chama deita para o lado do vento
    }
    // Espelhar o item (sprite.flip).
    const flip = this.sprite.flip ? -1 : 1;
    this.updateCastShadow(flip);
    if (Math.sign(this.body.scale.x) !== flip) this.body.scale.x = Math.abs(this.body.scale.x) * flip;
  }

  // ---------------------------------------------------------------
  // Movimento (arrastar)
  // ---------------------------------------------------------------

  /** Centraliza na célula do grid mais próxima. */
  snapToGrid(value) {
    const g = this.gridSize;
    return Math.floor(value / g) * g + g / 2;
  }

  setupInteractivity() {
    this.container.on('pointerdown', (event) => {
      // Só o botão esquerdo (ou toque) move. O direito é do menu de contexto.
      if (event.button !== 0) return;
      // Escondido na névoa (para o jogador): como se não existisse; o arraste move a câmera.
      if (this.engine.fog?.hidesToken(this)) return;
      this.tapStart = { x: event.global.x, y: event.global.y };

      // Mira de ataque aberta: o clique escolhe o alvo (não move nada).
      if (this.engine.targeting?.isActive) {
        event.stopPropagation();
        this.engine.targeting.clickToken(this);
        return;
      }

      const planner = this.engine.planner;

      // Modo "caminho" aberto: tocar no próprio token cancela; em outro token, marca o bloco.
      if (planner?.isTapMode) {
        event.stopPropagation();
        if (planner.plan.token === this) planner.cancel();
        else {
          const p = event.getLocalPosition(this.engine.viewport);
          planner.handleTap(p.x, p.y);
        }
        return;
      }

      // Sem permissão: não move o token, e o arraste cai na câmera.
      if (!this.engine.canMoveToken(this.data)) return;

      // Item de cenário: o Mestre arrasta livre (sem turno, sem caminho, sem andar).
      // Cenário travado: o arraste vira movimento da câmera (não mexe sem querer).
      if (this.mode === 'prop') {
        if (this.engine.propsLocked) return;
        event.stopPropagation();
        const pointer = event.getLocalPosition(this.engine.viewport);
        this.moveOrigin = { x: this.container.x, y: this.container.y };
        this.isDragging = true;
        this.propDrag = true;
        this.target = null;
        this.pathQueue = [];
        this.dragOffset = { x: this.container.x - pointer.x, y: this.container.y - pointer.y };
        return;
      }
      event.stopPropagation();

      // Regras de movimento (turno, blocos disponíveis). Se não pode, nem começa a arrastar.
      this.moveOrigin = { x: this.container.x, y: this.container.y };
      if (planner && !planner.start(this)) return;

      const pointer = event.getLocalPosition(this.engine.viewport);
      this.isDragging = true;
      this.target = null;
      this.pathQueue = [];
      this.dragOffset = { x: this.container.x - pointer.x, y: this.container.y - pointer.y };
    });

    // Toque/clique sem arrastar: mostra o card do personagem (Room.jsx).
    this.container.on('pointertap', (event) => {
      if (!this.tapStart || this.engine.targeting?.isActive) return;
      const moved = Math.hypot(event.global.x - this.tapStart.x, event.global.y - this.tapStart.y);
      this.tapStart = null;
      if (moved < 8) this.engine.onTokenTap?.(this.data);
    });

    // Mira de ataque: mostra o arco até o token sob o mouse.
    this.container.on('pointerover', () => {
      if (!this.engine.fog?.hidesToken(this)) this.engine.targeting?.hoverToken(this);
    });
    this.container.on('pointerout', () => {
      if (this.engine.targeting?.active?.hover === this) this.engine.targeting.hoverToken(null);
    });

    // globalpointermove: continua acompanhando mesmo se o mouse sair do token.
    this.container.on('globalpointermove', (event) => {
      if (!this.isDragging) return;

      const pointer = event.getLocalPosition(this.engine.viewport);
      const nextX = pointer.x + this.dragOffset.x;
      if (Math.abs(nextX - this.container.x) > 0.5) this.direction = nextX > this.container.x ? 1 : -1;

      this.container.x = nextX;
      this.container.y = pointer.y + this.dragOffset.y;
      this.lastMoveAt = performance.now();
      this.updateDepth();
      if (!this.propDrag) this.engine.planner?.preview(this.container.x, this.container.y);
    });

    const stopDrag = () => {
      if (!this.isDragging || this.container.destroyed) return;
      this.isDragging = false;
      this.dragOffset = null;

      // Item de cenário: encaixa no bloco e salva, sem caminhar.
      if (this.propDrag) {
        this.propDrag = false;
        const final = { x: this.snapToGrid(this.container.x), y: this.snapToGrid(this.container.y) };
        const moved = Math.abs(final.x - this.moveOrigin.x) > 0.5 || Math.abs(final.y - this.moveOrigin.y) > 0.5;
        this.walkPath([final], { save: moved, direct: true });
        return;
      }

      const planner = this.engine.planner;
      if (!planner) {
        // Sem planejador: comportamento antigo (encaixa e salva).
        this.walkPath([{ x: this.snapToGrid(this.container.x), y: this.snapToGrid(this.container.y) }], { save: true, direct: true });
        return;
      }
      const result = planner.finishDrag(this.container.x, this.container.y);
      if (result.tapMode) {
        // Soltou no mesmo bloco: volta para o centro e espera os toques do caminho.
        this.container.position.set(this.moveOrigin.x, this.moveOrigin.y);
        this.updateDepth();
      }
    };

    this.container.on('pointerup', stopDrag);
    this.container.on('pointerupoutside', stopDrag);
  }

  /**
   * Anda pelo caminho (lista de pontos no centro dos blocos).
   *  - points vazio: volta para onde estava antes de arrastar.
   *  - save: grava a posição final (e o caminho, para os outros verem o mesmo trajeto).
   *  - direct: coloca direto no destino, sem andar.
   */
  walkPath(points, { save = false, direct = false } = {}) {
    if (this.container.destroyed) return;
    const origin = this.moveOrigin || { x: this.container.x, y: this.container.y };

    if (!points.length) {
      this.pathQueue = [];
      this.target = origin;
      return;
    }

    const final = points[points.length - 1];
    if (direct || this.mode === 'disc') {
      this.container.position.set(final.x, final.y);
      this.pathQueue = [];
      this.target = null;
      this.updateDepth();
    } else {
      // Volta para o ponto de partida e anda bloco a bloco pelo caminho.
      this.container.position.set(origin.x, origin.y);
      this.pathQueue = points.slice(1);
      this.target = points[0];
      this.updateDepth();
    }
    this.pendingFinal = final;
    if (save) this.savePosition(final, points);
  }

  async savePosition(final, points) {
    const path = points.length > 1 ? points.map((p) => [Math.round(p.x), Math.round(p.y)]) : null;
    let { error } = await supabase
      .from('map_tokens')
      .update({ x: final.x, y: final.y, move_path: path })
      .eq('id', this.data.id);

    // Banco sem a coluna move_path (SQL ainda não rodado): salva só a posição.
    if (error && /move_path/.test(error.message || '')) {
      ({ error } = await supabase.from('map_tokens').update({ x: final.x, y: final.y }).eq('id', this.data.id));
    }
    if (error) console.error('Erro ao salvar posição do token:', error);
  }

  // ---------------------------------------------------------------
  // Atualização vinda do Realtime / edição
  // ---------------------------------------------------------------

  updateData(newData) {
    this.data = newData;
    this.applyVisual();
    this.refreshHud();

    if (this.isDragging) return;

    const x = Number(newData.x || 0);
    const y = Number(newData.y || 0);
    const moved = Math.abs(x - this.container.x) > 0.5 || Math.abs(y - this.container.y) > 0.5;
    if (!moved) return;

    // Eco do nosso próprio movimento: já estamos andando até lá.
    if (this.pendingFinal && Math.abs(this.pendingFinal.x - x) < 1 && Math.abs(this.pendingFinal.y - y) < 1) {
      this.pendingFinal = null;
      return;
    }

    // Personagens "andam" até o destino; itens de cenário e tokens antigos pulam direto.
    if (this.mode === 'disc' || this.mode === 'prop') {
      this.target = null;
      this.pathQueue = [];
      this.container.position.set(x, y);
      this.updateDepth();
    } else {
      // Se veio o caminho junto, anda pelo mesmo trajeto que o jogador traçou.
      const path = Array.isArray(newData.move_path) ? newData.move_path : null;
      const last = path?.[path.length - 1];
      if (path && last && Math.abs(last[0] - x) < 1 && Math.abs(last[1] - y) < 1) {
        const points = path.map(([px, py]) => ({ x: px, y: py }));
        this.target = points[0];
        this.pathQueue = points.slice(1);
      } else {
        this.target = { x, y };
        this.pathQueue = [];
      }
    }
  }
}
