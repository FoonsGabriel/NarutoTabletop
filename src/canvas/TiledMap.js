import * as PIXI from 'pixi.js';
import { groundLimit, loadGroundTexture, releaseGroundTexture } from './Textures.js';

/**
 * Mapa montado por pedaços (rooms.map_layout):
 *   { cols, rows, tileSize, overlap, tiles: { "col,row": url } }
 *
 * - Cada pedaço é uma imagem separada (qualidade alta e sem passar do limite
 *   de textura dos celulares, ~4096 px).
 * - Pedaços vizinhos se sobrepõem `overlap` px; a borda do de cima ganha um
 *   degradê suave para esconder a emenda.
 * - Só os pedaços perto da câmera ficam carregados na memória de vídeo.
 */

const CHECK_EVERY_MS = 250;   // de quanto em quanto tempo conferir o que está visível
const LOAD_MARGIN = 0.5;      // carrega pedaços até meio pedaço fora da tela
const UNLOAD_MARGIN = 1.5;    // descarrega os que estão a mais de 1,5 pedaço da tela

export class TiledMap {
  constructor(engine, layout, zIndex) {
    this.engine = engine;
    this.cols = Math.max(1, Number(layout.cols) || 1);
    this.rows = Math.max(1, Number(layout.rows) || 1);
    this.tileSize = Math.max(256, Number(layout.tileSize) || 2048);
    this.overlap = Math.max(0, Math.min(Number(layout.overlap) || 0, this.tileSize / 4));
    this.urls = layout.tiles || {};

    this.step = this.tileSize - this.overlap; // distância entre o início de dois pedaços
    this.width = this.cols * this.step + this.overlap;
    this.height = this.rows * this.step + this.overlap;

    this.container = new PIXI.Container();
    this.container.zIndex = zIndex;
    this.container.sortableChildren = true;
    this.engine.viewport.addChild(this.container);

    this.tiles = {};        // "col,row" → { sprite, loading }
    this.masks = {};        // texturas de degradê reaproveitadas
    this.lastCheck = 0;
    this.destroyed = false;

    this.drawPlaceholders();
  }

  /** Fundo escuro com o contorno de cada pedaço (aparece enquanto carrega). */
  drawPlaceholders() {
    const g = new PIXI.Graphics();
    g.rect(0, 0, this.width, this.height);
    g.fill(0x16241a);
    for (let row = 0; row < this.rows; row += 1) {
      for (let col = 0; col < this.cols; col += 1) {
        if (!this.urls[`${col},${row}`]) continue;
        g.rect(col * this.step, row * this.step, this.tileSize, this.tileSize);
        g.stroke({ width: 2, color: 0xffffff, alpha: 0.06 });
      }
    }
    g.zIndex = -1;
    this.container.addChild(g);
  }

  // ---------------------------------------------------------------
  // Degradê nas emendas (só nas bordas que encostam num pedaço anterior)
  // ---------------------------------------------------------------

  featherMask(left, top) {
    const key = `${left ? 1 : 0}${top ? 1 : 0}`;
    if (this.masks[key]) return this.masks[key];

    // A máscara é pequena (256 px) e esticada: o degradê é suave, não precisa de mais.
    const size = 256;
    const fade = Math.max(1, Math.round((this.overlap / this.tileSize) * size));
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const image = ctx.createImageData(size, size);

    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        let alpha = 1;
        if (left && x < fade) alpha = Math.min(alpha, x / fade);
        if (top && y < fade) alpha = Math.min(alpha, y / fade);
        const i = (y * size + x) * 4;
        image.data[i] = 255;
        image.data[i + 1] = 255;
        image.data[i + 2] = 255;
        image.data[i + 3] = Math.round(alpha * 255);
      }
    }
    ctx.putImageData(image, 0, 0);

    this.masks[key] = PIXI.Texture.from(canvas);
    return this.masks[key];
  }

  // ---------------------------------------------------------------
  // Carregar / descarregar conforme a câmera
  // ---------------------------------------------------------------

  /** Retângulo do mundo que está na tela agora. */
  visibleWorldRect() {
    const { viewport, app } = this.engine;
    const scale = viewport.scale.x || 1;
    return {
      x: -viewport.x / scale,
      y: -viewport.y / scale,
      width: app.screen.width / scale,
      height: app.screen.height / scale,
    };
  }

  tileRect(col, row) {
    return { x: col * this.step, y: row * this.step, width: this.tileSize, height: this.tileSize };
  }

  static intersects(a, b, margin) {
    return a.x < b.x + b.width + margin && a.x + a.width > b.x - margin &&
      a.y < b.y + b.height + margin && a.y + a.height > b.y - margin;
  }

  /** force = confere agora, sem esperar o intervalo (usado na primeira carga). */
  update(force = false) {
    const now = performance.now();
    if (this.destroyed || (!force && now - this.lastCheck < CHECK_EVERY_MS)) return;
    this.lastCheck = now;

    const view = this.visibleWorldRect();
    for (let row = 0; row < this.rows; row += 1) {
      for (let col = 0; col < this.cols; col += 1) {
        const key = `${col},${row}`;
        if (!this.urls[key]) continue;
        const rect = this.tileRect(col, row);

        if (TiledMap.intersects(rect, view, this.tileSize * LOAD_MARGIN)) this.loadTile(col, row);
        else if (!TiledMap.intersects(rect, view, this.tileSize * UNLOAD_MARGIN)) this.unloadTile(key);
      }
    }
  }

  async loadTile(col, row) {
    const key = `${col},${row}`;
    if (this.tiles[key]) return;
    const url = this.urls[key];
    this.tiles[key] = { loading: true };

    // Degradê nas bordas que sobrepõem um pedaço vizinho já existente.
    const left = this.overlap > 0 && col > 0 && Boolean(this.urls[`${col - 1},${row}`]);
    const top = this.overlap > 0 && row > 0 && Boolean(this.urls[`${col},${row - 1}`]);
    const place = (sprite) => {
      sprite.position.set(col * this.step, row * this.step);
      sprite.width = this.tileSize;  // estica/encolhe para o tamanho do pedaço
      sprite.height = this.tileSize;
      sprite.zIndex = row * this.cols + col; // os seguintes ficam por cima (cobrem a emenda)
    };

    // Caminho rápido: imagem já reduzida para o aparelho e com o degradê "assado" (sem máscara).
    try {
      const maxSize = groundLimit(this.engine.app?.renderer, { lowPower: this.engine.lowPower, tile: true });
      const feather = left || top ? { left, top, fraction: this.overlap / this.tileSize } : null;
      const result = await loadGroundTexture(url, { maxSize, feather });
      if (this.destroyed || !this.tiles[key]) {
        releaseGroundTexture(result.key);
        return;
      }
      const sprite = new PIXI.Sprite(result.texture);
      place(sprite);
      this.tiles[key] = { sprite, url, textureKey: result.key };
      this.container.addChild(sprite);
      return;
    } catch (error) {
      console.warn(`Pedaço ${key}: usando o carregamento antigo (${error.message}).`);
    }

    try {
      const texture = await PIXI.Assets.load({ src: url, data: { autoGenerateMipmaps: true } });
      if (this.destroyed || !this.tiles[key]) return;

      const sprite = new PIXI.Sprite(texture);
      place(sprite);
      if (left || top) {
        const mask = new PIXI.Sprite(this.featherMask(left, top));
        mask.position.copyFrom(sprite.position);
        mask.width = this.tileSize;
        mask.height = this.tileSize;
        this.container.addChild(mask);
        sprite.mask = mask;
        this.tiles[key] = { sprite, mask, url };
      } else {
        this.tiles[key] = { sprite, url };
      }

      this.container.addChild(sprite);
    } catch (error) {
      console.warn(`Pedaço ${key} do mapa não carregou:`, error);
      delete this.tiles[key];
    }
  }

  /** keepUrls: imagens que NÃO podem sair da memória (o mapa novo ainda usa). */
  unloadTile(key, keepUrls = null) {
    const tile = this.tiles[key];
    if (!tile) return;
    if (tile.loading) {
      delete this.tiles[key]; // o carregamento em andamento será descartado ao terminar
      return;
    }

    tile.sprite.destroy();
    tile.mask?.destroy();
    delete this.tiles[key];

    // Textura otimizada: o contador libera a memória quando ninguém mais usa.
    if (tile.textureKey) {
      releaseGroundTexture(tile.textureKey);
      return;
    }

    // Libera a memória de vídeo (volta a carregar quando a câmera se aproximar),
    // a menos que outro pedaço carregado use a mesma imagem.
    const stillUsed = Object.values(this.tiles).some((other) => other.url === tile.url) || keepUrls?.has(tile.url);
    if (!stillUsed) PIXI.Assets.unload(tile.url).catch(() => {});
  }

  /**
   * keepUrls: ao trocar o mapa ao vivo, as imagens que continuam no mapa novo
   * não são liberadas (senão o mapa novo receberia uma textura já destruída).
   */
  destroy(keepUrls = null) {
    this.destroyed = true;
    Object.keys(this.tiles).forEach((key) => this.unloadTile(key, keepUrls));
    Object.values(this.masks).forEach((texture) => texture.destroy(true));
    this.container.destroy({ children: true });
  }
}
