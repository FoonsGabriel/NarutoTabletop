import * as PIXI from 'pixi.js';

const GRID_Z = -1e9 + 1; // logo acima do mapa, atrás de personagens e itens

export class Grid {
  constructor(engine, gridSize = 64) {
    this.engine = engine;
    this.gridSize = gridSize;
    this.container = null;
  }

  draw(width, height) {
    this.destroy();

    const graphics = new PIXI.Graphics();

    // Todas as linhas num único traço: mais leve, mesmo em mapas enormes.
    for (let x = 0; x <= width; x += this.gridSize) {
      graphics.moveTo(x, 0);
      graphics.lineTo(x, height);
    }
    for (let y = 0; y <= height; y += this.gridSize) {
      graphics.moveTo(0, y);
      graphics.lineTo(width, y);
    }
    graphics.stroke({ width: 1, color: 0xffffff, alpha: 0.1 });

    this.container = new PIXI.Container();
    this.container.addChild(graphics);
    this.container.zIndex = GRID_Z;
    this.engine.viewport.addChild(this.container);
  }

  destroy() {
    this.container?.destroy({ children: true });
    this.container = null;
  }
}