import * as PIXI from 'pixi.js';
import { Grid } from './Grid.js';
import { Token } from './Token.js';
import { TiledMap } from './TiledMap.js';
import { Atmosphere, parseColor } from './Atmosphere.js';
import { MovePlanner } from './MovePlanner.js';
import { Terrain } from './Terrain.js';
import { Fog } from './Fog.js';
import { Marks } from './Marks.js';
import { playAttackSound } from '../services/Sfx';
import { DangerZone } from './DangerZone.js';
import { AttackFx } from './AttackFx.js';
import { Blood } from './Blood.js';
import { PropFx } from './PropFx.js';
import { groundLimit, isMobileDevice, loadGroundTexture, releaseGroundTexture } from './Textures.js';
import { TargetPicker } from './TargetPicker.js';
import { clearActiveEngine, lightOnMap, setActiveEngine, terrainFor } from './Spawn.js';

// zIndex do chão (mapa e grid): sempre atrás de tudo.
export const GROUND_Z = -1e9;
// zIndex da camada de HUD: sempre na frente de tudo.
export const HUD_Z = 1e9;

export class CanvasEngine {
  constructor(container) {
    this.app = null;
    this.container = container;
    this.viewport = null;
    this.grid = null;
    this.tokens = {};
    this.characters = {}; // fichas da sala, por id (fonte do HP dos tokens vinculados)
    this.tokenRows = {};  // todas as linhas de map_tokens (inclusive de outros mapas)
    this.activeMapId = null; // rooms.scene_env.active_map_id
    this.gridSize = 64;

    // Callback definido pelo Room.jsx: (tokenData, { x, y }) => void
    this.onTokenContextMenu = null;

    // Callback definido pelo Room.jsx: toque/clique num token (abre o card do personagem).
    this.onTokenTap = null;

    // Regra de permissão definida pelo Room.jsx: (tokenData) => boolean
    this.canMoveToken = () => true;

    // Destaque de turno no combate: token do combatente da vez.
    this.turnTarget = { characterId: null, tokenId: null };

    // HUD dos tokens: o Mestre escolhe o que os jogadores veem (rooms.hud_settings).
    this.hudSettings = { show_hp: true, show_names: true, show_chakra: false };
    this.isGM = false;

    // Pontos de luz: o Mestre posiciona e arrasta (callbacks definidos pelo Room.jsx).
    this.lightEdit = { editing: false, placing: false };
    this.onPlaceLight = null;  // ({ x, y }) => void
    this.onMoveLight = null;   // (id, { x, y }) => void
    this.onSelectLight = null; // (id) => void
    this.lightMarkers = {};    // id → Container
    this.draggingLightId = null;

    // Movimento em blocos: regras definidas pelo Room.jsx (turno, blocos disponíveis).
    this.moveRules = null; // (tokenData) => null | { canMove, reason, remaining, strict, commit }
    this.planner = null;
    this.targeting = null; // mira de ataque (TargetPicker)
    this.terrain = null;    // terreno difícil (rooms.scene_env.terrain)
    this.dangerZone = null; // onde os inimigos alcançam no próximo turno
    this.onTerrainChange = null; // (cells) => void — o Mestre pintou terreno
    this.fog = null;        // névoa de guerra (rooms.scene_env.fog_maps)
    this.onFogChange = null; // (mapKey, cells) => void — salvar a névoa (só o Mestre)
    this.isVisionToken = () => false; // personagem de jogador (descobre a névoa)? definido pelo Room.jsx
    this.propsLocked = false; // cenário travado (rooms.scene_env.props_locked): não arrasta sem querer
    this.floaters = [];    // números de dano subindo

    // Modo leve (por aparelho): menos efeitos para máquinas fracas.
    this.lowPower = readLowPower();

    this.tickTokens = this.tickTokens.bind(this);
    this.fps = { frames: 0, time: 0, value: 60, slowSince: 0, warned: false };
    this.onSlow = null; // (fps) => void — o Room mostra a sugestão de modo leve

    // Estado do arraste da câmera
    this.isDragging = false;
    this.lastPos = null;

    // Controle de ciclo de vida (o React StrictMode monta/desmonta 2x em dev)
    this.isReady = false;
    this.isDestroyed = false;

    this.handleContextMenu = this.handleContextMenu.bind(this);
    this.handleWheel = this.handleWheel.bind(this);
  }

  async init(roomData) {
    const app = new PIXI.Application();
    this.app = app;

    // Celular: tela de densidade 3 = 9× mais pixels. Limitar a densidade é o que mais alivia.
    this.isMobile = isMobileDevice();
    await app.init({
      resizeTo: this.container, // acompanha o tamanho da div automaticamente
      background: 0x111111,
      preference: 'webgl',
      antialias: !this.isMobile, // no celular o antialias custa caro e quase não se vê
      autoDensity: true,
      resolution: this.pickResolution(),
      powerPreference: 'high-performance',
    });

    // Se o componente foi desmontado enquanto o Pixi iniciava, descarta tudo.
    if (this.isDestroyed) {
      app.destroy(true, { children: true });
      return;
    }

    const canvas = app.canvas;
    canvas.style.position = 'absolute';
    canvas.style.inset = '0';
    canvas.style.touchAction = 'none'; // evita scroll/zoom do navegador no celular
    canvas.style.userSelect = 'none';
    canvas.style.webkitUserSelect = 'none';
    canvas.style.webkitTouchCallout = 'none'; // sem o menu "salvar imagem" ao segurar o dedo
    this.container.appendChild(canvas);

    // Render group: mover/zoom da câmera vira uma única transformação na GPU (PixiJS v8).
    this.viewport = new PIXI.Container({ isRenderGroup: true });
    this.viewport.eventMode = 'static';
    this.viewport.hitArea = new PIXI.Rectangle(-200000, -200000, 400000, 400000);
    this.viewport.sortableChildren = true; // profundidade: zIndex = posição dos pés

    // Camada dos HUDs (nomes e barras): sempre por cima de personagens e cenário.
    this.hudLayer = new PIXI.Container();
    this.hudLayer.zIndex = HUD_Z;
    this.hudLayer.eventMode = 'none';
    this.viewport.addChild(this.hudLayer);
    app.stage.addChild(this.viewport);

    // Planejador de movimento (área alcançável, caminho, contador de blocos).
    this.planner = new MovePlanner(this);
    this.targeting = new TargetPicker(this);
    this.terrain = new Terrain(this);
    this.terrain.onChange = (cells) => this.onTerrainChange?.(cells);
    this.marks = new Marks(this); // ping e seta no mapa
    this.fog = new Fog(this);
    this.fog.onChange = (key, cells) => {
      this.onFogChange?.(key, cells);
      this.emitFlags();
    };
    this.dangerZone = new DangerZone(this);
    this.attackFx = new AttackFx(this);
    this.propFx = new PropFx(this);
    this.blood = new Blood(this); // sangue dos golpes (gotas e manchas no chão)
    app.ticker.maxFPS = this.pickMaxFps();

    // Clima e horário (chuva, neve, noite…), entre os tokens e o HUD.
    this.atmosphere = new Atmosphere(this);
    this.atmosphere.setEnv(roomData?.scene_env);

    // Marcadores das luzes (só o Mestre vê, enquanto edita as luzes).
    this.lightMarkerLayer = new PIXI.Container();
    this.lightMarkerLayer.zIndex = HUD_Z + 1;
    this.lightMarkerLayer.visible = false;
    this.viewport.addChild(this.lightMarkerLayer);
    this.handleResize = () => this.atmosphere?.resize();
    app.renderer.on('resize', this.handleResize);

    this.gridSize = roomData?.grid_size || 64;
    this.activeMapId = roomData?.scene_env?.active_map_id || null;
    this.terrain.setCells(terrainFor(roomData?.scene_env, this.activeMapId));
    this.propsLocked = Boolean(roomData?.scene_env?.props_locked);
    this.fog.setMaps(roomData?.scene_env?.fog_maps);

    await this.loadGround(roomData);
    if (this.isDestroyed) return;

    this.setupCamera();
    canvas.addEventListener('contextmenu', this.handleContextMenu);
    app.ticker.add(this.tickTokens);

    this.isReady = true;
    setActiveEngine(this); // o que for adicionado aparece no meio desta tela
  }

  // ---------------------------------------------------------------
  // Chão: imagem única (rooms.map_url), mapa por pedaços (rooms.map_layout)
  // ou o tabuleiro padrão. Pode ser trocado sem recarregar a sala.
  // ---------------------------------------------------------------

  async loadGround(roomData) {
    this.blood?.clear(); // mapa novo, chão limpo
    const layout = roomData?.map_layout;
    const hasTiles = layout && Object.keys(layout.tiles || {}).length > 0;

    if (hasTiles) {
      this.tiledMap = new TiledMap(this, layout, GROUND_Z);
      this.drawGrid(this.tiledMap.width, this.tiledMap.height);
      this.tiledMap.update(true); // carrega já o que está na tela
      return;
    }

    if (roomData?.map_url) {
      // Imagem única: reduzida para o limite do aparelho (maior que isso fica PRETA no celular),
      // mas desenhada no tamanho original para os tokens continuarem no lugar.
      try {
        const maxSize = groundLimit(this.app.renderer, { lowPower: this.lowPower });
        const result = await loadGroundTexture(roomData.map_url, { maxSize });
        if (this.isDestroyed) { releaseGroundTexture(result.key); return; }
        const sprite = new PIXI.Sprite(result.texture);
        sprite.width = result.width;
        sprite.height = result.height;
        sprite.zIndex = GROUND_Z; // chão: sempre atrás de personagens e itens
        this.viewport.addChild(sprite);
        this.groundSprite = sprite;
        this.groundTextureKey = result.key;
        this.drawGrid(result.width, result.height);
        return;
      } catch (error) {
        console.warn('Mapa: usando o carregamento antigo.', error);
        if (this.isDestroyed) return;
      }

      try {
        const texture = await PIXI.Assets.load(roomData.map_url);
        if (this.isDestroyed) return;

        const sprite = new PIXI.Sprite(texture);
        sprite.zIndex = GROUND_Z; // chão: sempre atrás de personagens e itens
        this.viewport.addChild(sprite);
        this.groundSprite = sprite;
        this.drawGrid(sprite.width, sprite.height);
        return;
      } catch (error) {
        console.warn('Erro ao carregar mapa:', error);
        if (this.isDestroyed) return;
      }
    }

    this.drawDefaultBoard();
  }

  /** Troca o mapa ao vivo (o Mestre mudou o mapa). Tokens continuam no lugar. */
  async reloadGround(roomData) {
    if (!this.isReady) return;

    // Imagens que o mapa novo continua usando ficam na memória.
    const keepUrls = new Set(Object.values(roomData?.map_layout?.tiles || {}));
    if (roomData?.map_url) keepUrls.add(roomData.map_url);

    this.clearGround(keepUrls);
    await this.loadGround(roomData);
  }

  clearGround(keepUrls = null) {
    this.tiledMap?.destroy(keepUrls);
    this.tiledMap = null;
    this.groundSprite?.destroy();
    this.groundSprite = null;
    if (this.groundTextureKey) releaseGroundTexture(this.groundTextureKey);
    this.groundTextureKey = null;
    this.grid?.destroy();
  }

  drawGrid(width, height) {
    if (!this.grid) this.grid = new Grid(this, this.gridSize);
    this.grid.draw(width, height);
    this.fog?.setBounds(width, height); // a névoa cobre o mapa inteiro
  }

  drawDefaultBoard() {
    const mapWidth = 3000;
    const mapHeight = 3000;

    const background = new PIXI.Graphics();
    background.rect(0, 0, mapWidth, mapHeight);
    background.fill(0x1a2e1a);
    background.stroke({ width: 4, color: 0xff0000, alpha: 0.5 });
    background.zIndex = GROUND_Z;
    this.viewport.addChild(background);
    this.groundSprite = background;

    this.drawGrid(mapWidth, mapHeight);
  }

  // ---------------------------------------------------------------
  // Identificação de token sob o cursor
  // ---------------------------------------------------------------

  /**
   * Usa o hit test do próprio PixiJS (o mesmo que faz o clique esquerdo
   * funcionar) para descobrir qual token está sob a posição da tela.
   */
  getTokenAt(clientX, clientY) {
    if (!this.isReady) return null;

    const point = new PIXI.Point();
    this.app.renderer.events.mapPositionToPoint(point, clientX, clientY);

    let target = this.app.renderer.events.rootBoundary.hitTest(point.x, point.y);

    // Sobe na árvore até achar o container marcado como token.
    while (target) {
      if (target.tokenId) return this.tokens[target.tokenId] ?? null;
      target = target.parent;
    }

    return null;
  }

  handleContextMenu(event) {
    this.lastContextMenuAt = performance.now(); // Android dispara isto ao segurar o dedo
    // Mira de ataque aberta: o clique direito cancela.
    if (this.targeting?.isActive) {
      event.preventDefault();
      this.targeting.cancel();
      return;
    }

    // Modo "caminho": o clique direito desfaz a última curva.
    if (this.planner?.isTapMode) {
      event.preventDefault();
      this.planner.undoWaypoint();
      return;
    }

    const token = this.getTokenAt(event.clientX, event.clientY);

    // Área vazia ou token sem permissão: menu normal do navegador.
    if (!token || !this.canMoveToken(token.data)) return;

    event.preventDefault();

    this.isDragging = false;
    this.lastPos = null;

    this.onTokenContextMenu?.(token.data, {
      x: event.clientX,
      y: event.clientY,
    });
  }

  // ---------------------------------------------------------------
  // Tokens
  // ---------------------------------------------------------------

  /**
   * Itens de cenário e NPCs pertencem a um mapa (sprite.mapId); só aparecem quando
   * esse mapa está em uso. Sem mapId (personagens dos jogadores, itens antigos):
   * aparecem em qualquer mapa.
   */
  onActiveMap(row) {
    const mapId = row?.sprite?.mapId;
    return !mapId || !this.activeMapId || mapId === this.activeMapId;
  }

  /** Troca o mapa em uso: mostra os tokens dele e esconde os dos outros. */
  setActiveMap(mapId) {
    const next = mapId || null;
    if (next === this.activeMapId) return;
    this.activeMapId = next;
    Object.values(this.tokenRows).forEach((row) => this.upsertToken(row));
    // Luzes e terreno também são de cada mapa.
    this.refreshLightMarkers?.();
    window.dispatchEvent(new CustomEvent('vtt:active-map', { detail: { id: next } }));
    if (this.atmosphere?.env) this.terrain?.setCells(terrainFor(this.atmosphere.env, next));
    this.fog?.load(true); // cada mapa tem a sua névoa
    this.emitFlags();
  }

  upsertToken(tokenData) {
    if (!this.viewport || !tokenData?.id) return;
    this.tokenRows[tokenData.id] = tokenData;

    if (!this.onActiveMap(tokenData)) {
      this.destroyTokenVisual(tokenData.id);
      return;
    }

    const existing = this.tokens[tokenData.id];

    if (existing) {
      existing.updateData(tokenData);
    } else {
      this.tokens[tokenData.id] = new Token(this, tokenData, this.gridSize);
      if (tokenData.character_id) window.dispatchEvent(new CustomEvent('vtt:character')); // retrato na barra
    }

    const token = this.tokens[tokenData.id];
    token.setTurnHighlight(this.isTurnToken(token));
    if (this.fog) token.hud.renderable = !this.fog.hidesToken(token); // nome/barra de quem está na névoa
  }

  // ---------------------------------------------------------------
  // Destaque de turno (combate)
  // ---------------------------------------------------------------

  /** target: { characterId, tokenId } do combatente da vez, ou null para apagar. */
  setTurnHighlight(target) {
    this.turnTarget = {
      characterId: target?.characterId || null,
      tokenId: target?.tokenId || null,
    };
    Object.values(this.tokens).forEach((token) => token.setTurnHighlight(this.isTurnToken(token)));
  }

  isTurnToken(token) {
    const { characterId, tokenId } = this.turnTarget;
    if (tokenId && token.data.id === tokenId) return true;
    return Boolean(characterId && token.data.character_id === characterId);
  }

  removeToken(tokenId) {
    delete this.tokenRows[tokenId];
    this.destroyTokenVisual(tokenId);
  }

  destroyTokenVisual(tokenId) {
    const token = this.tokens[tokenId];
    if (!token) return;

    token.destroy();
    delete this.tokens[tokenId];
  }

  /** Animações (respirar, andar, vento, fogo) — roda a cada quadro. */
  tickTokens(ticker) {
    this.measureFps(ticker.deltaMS);
    const deltaMS = Math.min(ticker.deltaMS, 100); // evita "pulos" ao voltar de outra aba
    Object.values(this.tokens).forEach((token) => token.tick(deltaMS));
    this.tiledMap?.update(); // carrega/descarrega pedaços do mapa conforme a câmera
    this.atmosphere?.tick(deltaMS);
    this.tickFloaters(deltaMS);
    this.dangerZone?.tick(deltaMS);
    this.attackFx?.tick(deltaMS);
    this.propFx?.tick(deltaMS);
    this.blood?.tick(deltaMS);
    this.fog?.tick(deltaMS);
    this.marks?.tick(deltaMS);
  }

  // ---------------------------------------------------------------
  // Mira de ataque e números de dano
  // ---------------------------------------------------------------

  /** opts: { attackerTokenId, rangeBlocks, isValid, onPick, onCancel } */
  startTargeting(opts) {
    this.planner?.cancel();
    return this.targeting?.start(opts) ?? false;
  }

  cancelTargeting() {
    this.targeting?.clear();
  }

  /** Texto que sobe em cima do token e some (ex.: "−9", "Esquivou!"). */
  showFloatingText(tokenId, text, color = 0xff4444) {
    const token = this.tokens[tokenId];
    if (!token || !this.hudLayer) return;
    const label = new PIXI.Text({
      text,
      style: { fontSize: 26, fontWeight: '900', fill: color, stroke: { color: 0x000000, width: 5 } },
    });
    label.anchor.set(0.5, 1);
    label.position.set(token.container.x, token.container.y - token.heightPx * 0.9);
    this.hudLayer.addChild(label);
    this.floaters.push({ label, life: 0 });
  }

  tickFloaters(deltaMS) {
    if (!this.floaters.length) return;
    this.floaters = this.floaters.filter((f) => {
      f.life += deltaMS;
      f.label.y -= deltaMS * 0.04;
      f.label.alpha = Math.max(0, 1 - Math.max(0, f.life - 700) / 700);
      if (f.life < 1400) return true;
      f.label.destroy();
      return false;
    });
  }

  // ---------------------------------------------------------------
  // Clima e horário (rooms.scene_env)
  // ---------------------------------------------------------------

  setSceneEnv(env) {
    if (env && 'active_map_id' in env) this.setActiveMap(env.active_map_id);
    this.atmosphere?.setEnv(env);
    this.refreshLightMarkers();
    this.terrain?.setCells(terrainFor(env, this.activeMapId));
    this.applyFlags(env);
  }

  /**
   * Trava do cenário e névoa. Só mexe se o campo veio junto
   * (o painel de clima manda o scene_env sem estes campos).
   */
  applyFlags(env) {
    if (!env) return;
    if ('props_locked' in env) this.propsLocked = Boolean(env.props_locked);
    if ('fog_maps' in env) this.fog?.setMaps(env.fog_maps);
    if ('props_locked' in env || 'fog_maps' in env) this.emitFlags();
  }

  /** Avisa os painéis (trava do cenário, névoa) que algo mudou. */
  emitFlags() {
    window.dispatchEvent(new CustomEvent('vtt:scene-flags'));
  }

  /** Mestre pintando a névoa: { editing, mode: 'reveal' | 'hide', brush: 1 | 3 | 5 }. */
  setFogEditing(opts) {
    if (opts?.editing) this.terrain?.setEditing({ editing: false });
    this.fog?.setEditing(opts);
    if (this.app?.canvas) this.app.canvas.style.cursor = this.fog?.editing ? 'crosshair' : '';
  }

  // ---------------------------------------------------------------
  // Terreno difícil e zona de perigo
  // ---------------------------------------------------------------

  /** Mestre pintando terreno: { editing, mode: 'add' | 'erase' }. */
  setTerrainEditing(opts) {
    if (opts?.editing) this.fog?.setEditing({ editing: false });
    this.terrain?.setEditing(opts);
    if (this.app?.canvas) this.app.canvas.style.cursor = this.terrain?.editing ? 'cell' : '';
  }

  /** Animação de ataque: { from, to: [tokenIds], element, shape, hit: [bool] } (ver AttackFx.js). */
  playAttack(opts) {
    try { this.attackFx?.play(opts); } catch (error) { console.warn('Animação de ataque falhou:', error); }
    try { playAttackSound(opts); } catch { /* sem som neste aparelho */ }
  }

  setDangerZone(on) {
    this.dangerZone?.setEnabled(on);
  }

  // ---------------------------------------------------------------
  // Modo leve (salvo no aparelho, não na sala)
  // ---------------------------------------------------------------

  setLowPower(on) {
    this.lowPower = Boolean(on);
    try { window.localStorage.setItem('vtt_modo_leve', this.lowPower ? '1' : '0'); } catch { /* sem localStorage */ }
    if (this.app) {
      this.app.ticker.maxFPS = this.pickMaxFps();
      // Densidade da tela também muda (modo leve = 1×).
      const resolution = this.pickResolution();
      if (this.app.renderer.resolution !== resolution) {
        this.app.renderer.resolution = resolution;
        this.app.resize();
      }
    }
    this.fps.slowSince = 0;
    this.atmosphere?.rebuildWeather();
  }

  /** Densidade de pixels: PC até 2×, celular até 1,5×, modo leve 1×. */
  pickResolution() {
    const dpr = window.devicePixelRatio || 1;
    if (this.lowPower) return 1;
    return Math.min(dpr, this.isMobile ? 1.5 : 2);
  }

  /** Quadros por segundo: PC livre (até a taxa da tela), celular 60, modo leve 30. */
  pickMaxFps() {
    return this.lowPower ? 30 : this.isMobile ? 60 : 0;
  }

  /**
   * Medidor de desempenho: se ficar abaixo de ~22 FPS por 6 s seguidos (fora do modo leve),
   * avisa o Room para sugerir o modo leve.
   */
  measureFps(deltaMS) {
    const fps = this.fps;
    fps.frames += 1;
    fps.time += deltaMS;
    if (fps.time < 1000) return;
    fps.value = Math.round((fps.frames * 1000) / fps.time);
    fps.frames = 0;
    fps.time = 0;
    if (this.lowPower || document.hidden) { fps.slowSince = 0; return; }
    const now = performance.now();
    if (fps.value < 22) {
      if (!fps.slowSince) fps.slowSince = now;
      else if (now - fps.slowSince > 6000 && !fps.warned) {
        fps.warned = true;
        this.onSlow?.(fps.value);
      }
    } else {
      fps.slowSince = 0;
    }
  }

  // ---------------------------------------------------------------
  // Pontos de luz (edição do Mestre)
  // ---------------------------------------------------------------

  /** editing: mostra os marcadores; placing: o próximo clique no mapa cria uma luz. */
  setLightEditing({ editing = false, placing = false } = {}) {
    this.lightEdit = { editing, placing: editing && placing };
    if (this.app?.canvas) this.app.canvas.style.cursor = this.lightEdit.placing ? 'crosshair' : '';
    this.refreshLightMarkers();
  }

  refreshLightMarkers() {
    if (!this.lightMarkerLayer) return;
    const lights = (this.atmosphere?.env.lights || []).filter((l) => lightOnMap(l, this.activeMapId));
    this.lightMarkerLayer.visible = this.lightEdit.editing;

    const seen = new Set();
    lights.forEach((light, index) => {
      seen.add(light.id);
      let marker = this.lightMarkers[light.id];
      if (!marker) {
        marker = this.createLightMarker(light.id);
        this.lightMarkers[light.id] = marker;
      }
      // Durante o arraste a posição local manda (evita "pular" com o eco do banco).
      if (this.draggingLightId !== light.id) marker.position.set(Number(light.x) || 0, Number(light.y) || 0);
      this.drawLightMarker(marker, light, index + 1);
    });

    Object.keys(this.lightMarkers).forEach((id) => {
      if (seen.has(id)) return;
      this.lightMarkers[id].destroy({ children: true });
      delete this.lightMarkers[id];
    });
  }

  createLightMarker(id) {
    const marker = new PIXI.Container();
    marker.eventMode = 'static';
    marker.cursor = 'grab';
    marker.lightId = id;
    marker.ring = new PIXI.Graphics();
    marker.dot = new PIXI.Graphics();
    marker.label = new PIXI.Text({ text: '', style: { fontSize: 13, fontWeight: 'bold', fill: 0x111111 } });
    marker.label.anchor.set(0.5);
    marker.ring.eventMode = 'none';
    marker.addChild(marker.ring, marker.dot, marker.label);
    marker.hitArea = new PIXI.Circle(0, 0, 16);

    marker.on('pointerdown', (event) => {
      if (event.button !== 0) return;
      event.stopPropagation(); // não arrasta a câmera
      this.draggingLightId = id;
      marker.cursor = 'grabbing';
      this.onSelectLight?.(id);
    });
    marker.on('globalpointermove', (event) => {
      if (this.draggingLightId !== id) return;
      const point = this.viewport.toLocal(event.global);
      marker.position.set(point.x, point.y);
    });
    const drop = () => {
      if (this.draggingLightId !== id) return;
      this.draggingLightId = null;
      marker.cursor = 'grab';
      const x = Math.round(marker.x);
      const y = Math.round(marker.y);
      // Mostra a luz no lugar novo na hora, antes do banco responder.
      const lights = this.atmosphere?.env.lights || [];
      const light = lights.find((l) => l.id === id);
      if (light) { light.x = x; light.y = y; }
      this.onMoveLight?.(id, { x, y });
    };
    marker.on('pointerup', drop);
    marker.on('pointerupoutside', drop);

    this.lightMarkerLayer.addChild(marker);
    return marker;
  }

  drawLightMarker(marker, light, number) {
    const color = parseColor(light.color);
    const radiusPx = (Number(light.radius) || 4) * this.gridSize;
    marker.ring.clear()
      .circle(0, 0, radiusPx)
      .stroke({ width: 2, color, alpha: 0.6 });
    marker.dot.clear()
      .circle(0, 0, 14)
      .fill({ color, alpha: 0.95 })
      .stroke({ width: 3, color: 0x111111, alpha: 0.9 });
    marker.label.text = String(number);
  }

  // ---------------------------------------------------------------
  // HUD: o que cada um vê acima dos tokens
  // ---------------------------------------------------------------

  setHud(settings, isGM = this.isGM) {
    this.hudSettings = { ...this.hudSettings, ...(settings || {}) };
    this.isGM = isGM;
    Object.values(this.tokens).forEach((token) => {
      token.refreshHud();
      // Marcador de efeito solto: só o Mestre vê.
      if (token.sprite.builtin === 'vazio' && token.visual) token.visual.alpha = isGM ? 0.45 : 0;
    });
    this.fog?.draw(); // Mestre vê a névoa translúcida; jogador, preta
  }

  /** O Mestre sempre vê tudo; os jogadores veem o que ele liberou. */
  canSeeHud(key) {
    return this.isGM || Boolean(this.hudSettings[key]);
  }

  // ---------------------------------------------------------------
  // Fichas (characters) — quando uma ficha muda, os tokens dela redesenham
  // ---------------------------------------------------------------

  setCharacters(characterList) {
    this.characters = Object.fromEntries(
      (characterList || []).map((character) => [character.id, character])
    );
    Object.values(this.tokens).forEach((token) => {
      token.applyVisual();
      token.refreshHud();
    });
    window.dispatchEvent(new CustomEvent('vtt:character')); // barra de iniciativa
  }

  upsertCharacter(character) {
    if (!character?.id) return;
    this.characters[character.id] = character;
    this.refreshTokensOf(character.id);
    window.dispatchEvent(new CustomEvent('vtt:character', { detail: character.id })); // barra de iniciativa
  }

  removeCharacter(characterId) {
    delete this.characters[characterId];
    this.refreshTokensOf(characterId);
  }

  refreshTokensOf(characterId) {
    Object.values(this.tokens)
      .filter((token) => token.data.character_id === characterId)
      .forEach((token) => {
        token.applyVisual(); // o Tamanho pode ter mudado a altura da figura
        token.refreshHud();
      });
  }

  // ---------------------------------------------------------------
  // Câmera (pan com botão esquerdo no vazio + zoom na roda)
  // ---------------------------------------------------------------

  handleWheel(event) {
    event.preventDefault();

    const direction = event.deltaY < 0 ? 1 : -1;
    const newScale = this.viewport.scale.x * (1 + 0.1 * direction);
    if (newScale < 0.1 || newScale > 4) return;

    const mouseX = event.offsetX;
    const mouseY = event.offsetY;

    const worldX = (mouseX - this.viewport.x) / this.viewport.scale.x;
    const worldY = (mouseY - this.viewport.y) / this.viewport.scale.y;

    this.viewport.scale.set(newScale);
    this.viewport.x = mouseX - worldX * newScale;
    this.viewport.y = mouseY - worldY * newScale;
  }

  setupCamera() {
    this.app.canvas.addEventListener('wheel', this.handleWheel, { passive: false });
    this.setupTouch();

    this.viewport.on('pointerdown', (event) => {
      if (event.button !== 0) return;

      // Modo "colocar luz": o clique cria um ponto de luz em vez de mover a câmera.
      if (this.lightEdit.placing) {
        const point = this.viewport.toLocal(event.global);
        this.onPlaceLight?.({ x: Math.round(point.x), y: Math.round(point.y) });
        return;
      }

      // Marcar (📍): tocar = ping, arrastar = seta.
      if (this.marks?.mode) {
        const point = this.viewport.toLocal(event.global);
        this.marks.begin(point.x, point.y);
        return;
      }

      // Toque duplo no mapa: ping rápido (sem precisar ligar o 📍).
      const now = performance.now();
      const last = this.lastTap;
      this.lastTap = { t: now, x: event.global.x, y: event.global.y };
      if (last && now - last.t < 350 && Math.hypot(event.global.x - last.x, event.global.y - last.y) < 14
        && !this.fog?.editing && !this.terrain?.editing && !this.planner?.isTapMode && this.marks) {
        this.lastTap = null;
        const point = this.viewport.toLocal(event.global);
        this.marks.begin(point.x, point.y);
        this.marks.end();
        return;
      }

      // Pintando a névoa: arrastar revela (ou cobre) os blocos.
      if (this.fog?.editing) {
        const point = this.viewport.toLocal(event.global);
        this.fog.begin(point.x, point.y);
        return;
      }

      // Pintando terreno difícil: arrastar marca (ou apaga) os blocos.
      if (this.terrain?.editing) {
        const point = this.viewport.toLocal(event.global);
        this.terrain.begin(point.x, point.y);
        return;
      }

      this.isDragging = true;
      this.lastPos = { x: event.global.x, y: event.global.y };
      this.downPos = { x: event.global.x, y: event.global.y };
    });

    // Modo "caminho": um toque (sem arrastar a câmera) marca o bloco.
    this.viewport.on('pointerup', (event) => {
      if (!this.planner?.isTapMode || !this.downPos || event.button !== 0) return;
      const moved = Math.hypot(event.global.x - this.downPos.x, event.global.y - this.downPos.y);
      this.downPos = null;
      if (moved > 6) return;
      const point = this.viewport.toLocal(event.global);
      this.planner.handleTap(point.x, point.y);
    });

    this.viewport.on('pointermove', (event) => {
      if (this.terrain?.isPainting) {
        const point = this.viewport.toLocal(event.global);
        this.terrain.paint(point.x, point.y);
        return;
      }
      if (this.fog?.isPainting) {
        const point = this.viewport.toLocal(event.global);
        this.fog.paint(point.x, point.y);
        return;
      }
      if (this.marks?.isDrawing) {
        const point = this.viewport.toLocal(event.global);
        this.marks.move(point.x, point.y);
        return;
      }
      if (this.planner?.isTapMode && !this.isDragging) {
        const point = this.viewport.toLocal(event.global);
        this.planner.preview(point.x, point.y);
      }
      if (!this.isDragging || !this.lastPos) return;

      this.viewport.x += event.global.x - this.lastPos.x;
      this.viewport.y += event.global.y - this.lastPos.y;
      this.lastPos = { x: event.global.x, y: event.global.y };
    });

    const stopDrag = () => {
      this.terrain?.end();
      this.fog?.end();
      this.marks?.end();
      this.isDragging = false;
      this.lastPos = null;
    };

    this.viewport.on('pointerup', stopDrag);
    this.viewport.on('pointerupoutside', stopDrag);
  }

  /** Põe o ponto (do mapa) no meio da tela. */
  centerOn(x, y) {
    if (!this.viewport || !this.app || !Number.isFinite(x) || !Number.isFinite(y)) return;
    const { width, height } = this.app.screen;
    this.viewport.x = width / 2 - x * this.viewport.scale.x;
    this.viewport.y = height / 2 - y * this.viewport.scale.y;
  }

  // ---------------------------------------------------------------
  // Toque (celular): zoom com dois dedos e segurar o dedo no token = menu
  // ---------------------------------------------------------------

  setupTouch() {
    const canvas = this.app.canvas;
    this.touches = new Map();
    this.pinch = null;
    this.longPress = null;

    const local = (e) => {
      const rect = canvas.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    this.handleTouchDown = (e) => {
      if (e.pointerType !== 'touch') return;
      this.touches.set(e.pointerId, local(e));

      if (this.touches.size === 2) {
        // Dois dedos: começa o zoom e cancela qualquer arraste em andamento.
        this.cancelLongPress();
        this.abortDrags();
        const [a, b] = [...this.touches.values()];
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        this.pinch = {
          dist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
          scale: this.viewport.scale.x,
          world: {
            x: (mid.x - this.viewport.x) / this.viewport.scale.x,
            y: (mid.y - this.viewport.y) / this.viewport.scale.y,
          },
        };
        return;
      }

      // Um dedo parado ~0,55 s em cima de um token abre o menu (no lugar do clique direito).
      if (this.touches.size === 1) {
        const start = { clientX: e.clientX, clientY: e.clientY, at: local(e) };
        this.cancelLongPress();
        this.longPress = {
          start,
          timer: setTimeout(() => this.fireLongPress(start), 550),
        };
      }
    };

    this.handleTouchMove = (e) => {
      if (!this.touches.has(e.pointerId)) return;
      const point = local(e);
      this.touches.set(e.pointerId, point);

      if (this.longPress && Math.hypot(point.x - this.longPress.start.at.x, point.y - this.longPress.start.at.y) > 10) {
        this.cancelLongPress();
      }

      if (this.pinch && this.touches.size >= 2) {
        const [a, b] = [...this.touches.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const scale = Math.min(4, Math.max(0.1, this.pinch.scale * (dist / this.pinch.dist)));
        this.viewport.scale.set(scale);
        // O ponto do mapa entre os dedos continua entre os dedos (zoom + arrastar juntos).
        this.viewport.x = mid.x - this.pinch.world.x * scale;
        this.viewport.y = mid.y - this.pinch.world.y * scale;
        this.isDragging = false;
        this.lastPos = null;
      }
    };

    this.handleTouchUp = (e) => {
      this.touches.delete(e.pointerId);
      if (this.touches.size < 2) this.pinch = null;
      this.cancelLongPress();
    };

    canvas.addEventListener('pointerdown', this.handleTouchDown);
    canvas.addEventListener('pointermove', this.handleTouchMove);
    canvas.addEventListener('pointerup', this.handleTouchUp);
    canvas.addEventListener('pointercancel', this.handleTouchUp);
  }

  cancelLongPress() {
    if (this.longPress) clearTimeout(this.longPress.timer);
    this.longPress = null;
  }

  fireLongPress(start) {
    this.longPress = null;
    if (this.touches.size !== 1) return;
    // O Android já abre o menu sozinho (evento contextmenu): não abre duas vezes.
    if (performance.now() - (this.lastContextMenuAt || 0) < 800) return;
    if (this.targeting?.isActive) return;

    const token = this.getTokenAt(start.clientX, start.clientY);
    if (!token || !this.canMoveToken(token.data)) return;
    this.abortDrags();
    navigator.vibrate?.(30);
    this.onTokenContextMenu?.(token.data, { x: start.clientX, y: start.clientY });
  }

  /** Cancela arrastes de token em andamento (o token volta para onde estava). */
  abortDrags() {
    Object.values(this.tokens).forEach((token) => {
      if (!token.isDragging) return;
      token.isDragging = false;
      token.dragOffset = null;
    });
    if (this.planner?.isPlanning) this.planner.cancel();
    this.isDragging = false;
    this.lastPos = null;
  }

  // ---------------------------------------------------------------

  destroy() {
    this.isDestroyed = true;
    clearActiveEngine(this);

    // Se o init ainda não terminou, ele mesmo descarta o app ao retomar.
    if (!this.isReady || !this.app) return;

    this.app.canvas.removeEventListener('contextmenu', this.handleContextMenu);
    this.app.canvas.removeEventListener('wheel', this.handleWheel);
    this.app.canvas.removeEventListener('pointerdown', this.handleTouchDown);
    this.app.canvas.removeEventListener('pointermove', this.handleTouchMove);
    this.app.canvas.removeEventListener('pointerup', this.handleTouchUp);
    this.app.canvas.removeEventListener('pointercancel', this.handleTouchUp);
    this.cancelLongPress();
    this.app.ticker.remove(this.tickTokens);
    this.app.renderer.off('resize', this.handleResize);
    this.planner?.destroy();
    this.planner = null;
    this.targeting?.destroy();
    this.targeting = null;
    this.terrain?.destroy();
    this.terrain = null;
    this.fog?.destroy();
    this.fog = null;
    this.marks?.destroy();
    this.marks = null;
    this.dangerZone?.destroy();
    this.dangerZone = null;
    this.attackFx?.destroy();
    this.attackFx = null;
    this.propFx?.destroy();
    this.blood?.destroy();
    this.propFx = null;
    this.clearGround();
    this.atmosphere?.destroy();
    this.atmosphere = null;

    try {
      this.app.destroy(true, { children: true });
    } catch (error) {
      console.warn('Erro ao destruir canvas:', error);
    }

    this.app = null;
    this.viewport = null;
    this.tokens = {};
    this.isReady = false;
  }
}

function readLowPower() {
  try { return window.localStorage.getItem('vtt_modo_leve') === '1'; } catch { return false; }
}
