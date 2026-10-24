import * as THREE from 'three';

export const ASSET_BASE = (() => {
  if (typeof window !== 'undefined' && window.HM_ASSET_BASE) return new URL(window.HM_ASSET_BASE, document.baseURI).href;
  return new URL('.', document.baseURI).href;
})();

export function assetUrl(p) { return new URL(p, ASSET_BASE).href; }

const imgCache = new Map();
export function loadImage(path) {
  if (imgCache.has(path)) return imgCache.get(path);
  const p = new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('failed to load ' + path));
    img.src = assetUrl(path);
  });
  imgCache.set(path, p);
  return p;
}

export class TextureBank {
  constructor(renderer) {
    this.renderer = renderer;
    this.aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    this.tex = {};
  }

  async load(name, path, { srgb = true, repeat = true, flipY = true, aniso = true, mip = true } = {}) {
    const img = await loadImage(path);
    const t = new THREE.Texture(img);
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.flipY = flipY;
    t.anisotropy = aniso ? this.aniso : 1;
    t.generateMipmaps = mip;
    t.minFilter = mip ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
    t.needsUpdate = true;
    this.tex[name] = t;
    return t;
  }

  async loadAll(list, onEach) {
    let done = 0;
    await Promise.all(list.map(async (e) => {
      await this.load(e[0], e[1], e[2] || {});
      done++; onEach && onEach(done / list.length);
    }));
  }

  // 2D array texture from several equally sized images (terrain layers)
  async array(name, paths, size, srgb) {
    const imgs = await Promise.all(paths.map(loadImage));
    const layer = size * size * 4;
    const data = new Uint8Array(layer * paths.length);
    const cv = document.createElement('canvas'); cv.width = cv.height = size;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    imgs.forEach((img, i) => {
      ctx.clearRect(0, 0, size, size);
      ctx.drawImage(img, 0, 0, size, size);
      data.set(ctx.getImageData(0, 0, size, size).data, i * layer);
    });
    const t = new THREE.DataArrayTexture(data, size, size, paths.length);
    t.format = THREE.RGBAFormat; t.type = THREE.UnsignedByteType;
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
    t.anisotropy = this.aniso;
    t.needsUpdate = true;
    this.tex[name] = t;
    return t;
  }
}

function smooth(a, b, x) { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); }

// Procedural flashlight cookie: bright hotspot, reflector rings, soft wide spill.
export function makeFlashlightCookie(size = 256) {
  const cv = document.createElement('canvas'); cv.width = cv.height = size;
  const g = cv.getContext('2d');
  const c = size / 2;
  const img = g.createImageData(size, size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const r = Math.hypot(x - c + 0.5, y - c + 0.5) / c;
    let v = 0.32 * Math.max(0, 1 - r) ** 0.5;
    v += 0.5 * Math.exp(-((r / 0.55) ** 2));
    v += 0.45 * Math.exp(-((r / 0.24) ** 2));
    v += 0.06 * Math.exp(-(((r - 0.6) / 0.05) ** 2));
    v += 0.04 * Math.exp(-(((r - 0.36) / 0.04) ** 2));
    const ang = Math.atan2(y - c, x - c);
    v *= 1 + 0.03 * Math.sin(ang * 7 + r * 20);
    v *= 1 - smooth(0.8, 1.0, r);
    const k = (y * size + x) * 4;
    const w = Math.min(255, v * 255);
    img.data[k] = w; img.data[k + 1] = w * 0.97; img.data[k + 2] = w * 0.9; img.data[k + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Canvas text texture (signs, notes, monument)
export function makeTextTexture(lines, { w = 512, h = 256, bg = '#e8e2d0', fg = '#222', font = 'bold 40px Inter, sans-serif', align = 'center', pad = 24, lineH = 1.25, border = null, emboss = false } = {}) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const g = cv.getContext('2d');
  if (bg) { g.fillStyle = bg; g.fillRect(0, 0, w, h); }
  if (border) { g.strokeStyle = border; g.lineWidth = 8; g.strokeRect(8, 8, w - 16, h - 16); }
  g.textAlign = align; g.textBaseline = 'top';
  let y = pad;
  for (const ln of lines) {
    const f = ln.font || font;
    g.font = f;
    const size = parseInt(/(\d+)px/.exec(f)?.[1] || 32, 10);
    const x = align === 'center' ? w / 2 : pad;
    if (emboss) { g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillText(ln.text, x + 1.5, y + 1.5); g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillText(ln.text, x - 1, y - 1); }
    g.fillStyle = ln.color || fg;
    g.fillText(ln.text, x, y);
    y += size * (ln.lh || lineH);
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
