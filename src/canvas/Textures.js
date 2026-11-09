import * as PIXI from 'pixi.js';

/**
 * Texturas otimizadas para o chão do mapa.
 *
 *  - Reduz imagens grandes para caber no limite do aparelho (celulares costumam
 *    aceitar no máximo 4096 px; imagem maior que isso aparece PRETA).
 *  - "Assa" o degradê das emendas dentro da própria imagem, em vez de usar máscara
 *    (máscara é refeita a cada quadro e pesa muito no celular).
 *  - Conta quem está usando cada textura para liberar a memória de vídeo.
 */

export function isMobileDevice() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(pointer: coarse)').matches || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

let cachedMax = null;
/** Maior textura que a placa de vídeo aceita. */
export function maxTextureSize(renderer) {
  if (cachedMax) return cachedMax;
  try {
    const gl = renderer?.gl;
    cachedMax = gl ? gl.getParameter(gl.MAX_TEXTURE_SIZE) : 4096;
  } catch {
    cachedMax = 4096;
  }
  return cachedMax || 4096;
}

/** Limite de lado (px) para o chão, conforme o aparelho e o modo leve. */
export function groundLimit(renderer, { lowPower = false, tile = false } = {}) {
  const hw = maxTextureSize(renderer);
  if (isMobileDevice()) return Math.min(hw, tile ? (lowPower ? 1024 : 1536) : (lowPower ? 2048 : 4096));
  return Math.min(hw, tile ? (lowPower ? 1536 : 4096) : (lowPower ? 4096 : 8192));
}

const cache = new Map(); // chave → { promise, texture, refs, width, height }

/**
 * Carrega a imagem já reduzida (e com degradê, se pedido).
 * feather: { left: bool, top: bool, fraction: 0..0.25 } — parte da borda que some.
 * Retorna { texture, width, height } (width/height = tamanho ORIGINAL da imagem).
 */
export async function loadGroundTexture(url, { maxSize = 4096, feather = null } = {}) {
  const key = `${url}|${maxSize}|${feather ? `${feather.left ? 1 : 0}${feather.top ? 1 : 0}${feather.fraction}` : ''}`;
  let entry = cache.get(key);
  if (!entry) {
    entry = { refs: 0, promise: build(url, maxSize, feather) };
    cache.set(key, entry);
    entry.promise.then((result) => Object.assign(entry, result)).catch(() => cache.delete(key));
  }
  entry.refs += 1;
  try {
    const result = await entry.promise;
    return { ...result, key };
  } catch (error) {
    entry.refs -= 1;
    throw error;
  }
}

/** Devolve a textura; quando ninguém mais usa, sai da memória de vídeo. */
export function releaseGroundTexture(key) {
  const entry = cache.get(key);
  if (!entry) return;
  entry.refs -= 1;
  if (entry.refs > 0) return;
  cache.delete(key);
  entry.texture?.destroy(true);
}

async function build(url, maxSize, feather) {
  const response = await fetch(url, { mode: 'cors' });
  if (!response.ok) throw new Error(`HTTP ${response.status} em ${url}`);
  const blob = await response.blob();
  const bitmap = await createImageBitmap(blob);
  const width = bitmap.width;
  const height = bitmap.height;
  const scale = Math.min(1, maxSize / Math.max(width, height));
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));

  // Sem redução e sem degradê: usa a imagem como está.
  if (scale === 1 && !feather) {
    const texture = new PIXI.Texture({ source: new PIXI.ImageSource({ resource: bitmap, autoGenerateMipmaps: true }) });
    return { texture, width, height };
  }

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();

  if (feather && (feather.left || feather.top)) {
    // Mantém só o que está "dentro" do degradê (as bordas que sobrepõem o vizinho somem).
    ctx.globalCompositeOperation = 'destination-in';
    const fw = Math.max(1, Math.round(w * feather.fraction));
    const fh = Math.max(1, Math.round(h * feather.fraction));
    const mask = document.createElement('canvas');
    mask.width = w;
    mask.height = h;
    const m = mask.getContext('2d');
    m.fillStyle = '#fff';
    m.fillRect(0, 0, w, h);
    m.globalCompositeOperation = 'destination-in';
    if (feather.left) {
      const g = m.createLinearGradient(0, 0, fw, 0);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(1, 'rgba(255,255,255,1)');
      m.fillStyle = g;
      m.fillRect(0, 0, w, h);
    }
    if (feather.top) {
      const g = m.createLinearGradient(0, 0, 0, fh);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(1, 'rgba(255,255,255,1)');
      m.fillStyle = g;
      m.fillRect(0, 0, w, h);
    }
    ctx.drawImage(mask, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
  }

  const texture = new PIXI.Texture({ source: new PIXI.CanvasSource({ resource: canvas, autoGenerateMipmaps: true }) });
  return { texture, width, height };
}
