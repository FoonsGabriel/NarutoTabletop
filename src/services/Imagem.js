/**
 * Prepara imagens de personagem e de cenário antes de enviar:
 *  1. Reduz para no máximo 1024 px (o celular carrega bem mais rápido).
 *  2. Fundo verde (chroma key): se as bordas forem verdes, apaga o verde que
 *     encosta na borda. O verde DENTRO do desenho (colete de chunin, folhas)
 *     fica, porque só some o que está ligado à borda.
 *  3. Suaviza a borda e tira o "brilho verde" que sobra no contorno.
 * Mapas não passam por aqui (têm o próprio tratamento em canvas/Textures.js).
 */
const MAX = 1024;

const isGreen = (r, g, b) => g > 70 && g > r * 1.3 && g > b * 1.3;

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
    img.src = url;
  });
}

/** Quantas bordas são verdes (0 a 1). */
function borderGreenRatio(data, w, h) {
  let green = 0;
  let total = 0;
  const step = Math.max(1, Math.floor((w + h) / 200));
  const test = (x, y) => {
    const i = (y * w + x) * 4;
    total += 1;
    if (data[i + 3] > 0 && isGreen(data[i], data[i + 1], data[i + 2])) green += 1;
  };
  for (let x = 0; x < w; x += step) { test(x, 0); test(x, h - 1); }
  for (let y = 0; y < h; y += step) { test(0, y); test(w - 1, y); }
  return total ? green / total : 0;
}

/** Apaga o verde ligado às bordas (preenchimento a partir da borda). */
function removeGreenFromEdges(data, w, h) {
  const seen = new Uint8Array(w * h);
  const stack = [];
  const pushIf = (x, y) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const p = y * w + x;
    if (seen[p]) return;
    seen[p] = 1;
    const i = p * 4;
    if (isGreen(data[i], data[i + 1], data[i + 2])) stack.push(p);
  };
  for (let x = 0; x < w; x += 1) { pushIf(x, 0); pushIf(x, h - 1); }
  for (let y = 0; y < h; y += 1) { pushIf(0, y); pushIf(w - 1, y); }

  const removed = new Uint8Array(w * h);
  while (stack.length) {
    const p = stack.pop();
    removed[p] = 1;
    data[p * 4 + 3] = 0;
    const x = p % w;
    const y = (p - x) / w;
    pushIf(x + 1, y); pushIf(x - 1, y); pushIf(x, y + 1); pushIf(x, y - 1);
  }

  // Contorno: pixels encostados no fundo apagado ficam meio transparentes
  // e perdem o reflexo verde (o verde vira a média de vermelho e azul).
  for (let y = 1; y < h - 1; y += 1) {
    for (let x = 1; x < w - 1; x += 1) {
      const p = y * w + x;
      if (removed[p]) continue;
      const near = removed[p - 1] + removed[p + 1] + removed[p - w] + removed[p + w];
      if (!near) continue;
      const i = p * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const cap = Math.max(r, b);
      if (g > cap) data[i + 1] = Math.round((cap + (r + b) / 2) / 2);
      if (g > cap * 1.15) data[i + 3] = Math.min(data[i + 3], near >= 2 ? 110 : 190);
    }
  }
}

function toBlob(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * Devolve { file, removedGreen, resized }. Se algo falhar, devolve o arquivo original.
 */
export async function prepareSprite(file) {
  try {
    if (!file?.type?.startsWith('image/') || file.type === 'image/gif' || file.type === 'image/svg+xml') {
      return { file, removedGreen: false, resized: false };
    }
    const img = await loadImage(file);
    const scale = Math.min(1, MAX / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, w, h);

    const imageData = ctx.getImageData(0, 0, w, h);
    const removedGreen = borderGreenRatio(imageData.data, w, h) > 0.5;
    if (removedGreen) {
      removeGreenFromEdges(imageData.data, w, h);
      ctx.putImageData(imageData, 0, 0);
    }
    const resized = scale < 1;
    if (!removedGreen && !resized) return { file, removedGreen, resized };

    // WebP é bem menor; se o navegador não souber gerar, vai PNG (os dois guardam transparência).
    let blob = await toBlob(canvas, 'image/webp', 0.9);
    if (!blob || blob.type !== 'image/webp') blob = await toBlob(canvas, 'image/png');
    if (!blob) return { file, removedGreen: false, resized: false };
    const ext = blob.type === 'image/webp' ? 'webp' : 'png';
    const name = file.name.replace(/\.[^.]+$/, '') + '.' + ext;
    return { file: new File([blob], name, { type: blob.type }), removedGreen, resized };
  } catch (error) {
    console.warn('Não deu para preparar a imagem, enviando a original:', error);
    return { file, removedGreen: false, resized: false };
  }
}
