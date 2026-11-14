import * as THREE from 'three';
import { rand } from './util';

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')!] as const;
}
function srgb(t: THREE.Texture) { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; }

let _glow: THREE.Texture | null = null;
export function glowTexture() {
  if (_glow) return _glow;
  const [c, g] = canvas(64, 64);
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)');
  r.addColorStop(0.35, 'rgba(255,255,255,.55)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  return (_glow = new THREE.CanvasTexture(c));
}

/** Procedural moon used until the real LROC textures are placed in /public/textures/moon. */
export function moonFallbackTexture() {
  const [c, g] = canvas(2048, 1024);
  g.fillStyle = '#8e8e8c'; g.fillRect(0, 0, 2048, 1024);
  for (let i = 0; i < 24; i++) {
    g.fillStyle = `rgba(55,55,58,${rand(0.15, 0.3)})`;
    g.beginPath(); g.ellipse(rand(0, 2048), rand(180, 840), rand(60, 260), rand(40, 150), rand(0, Math.PI), 0, Math.PI * 2); g.fill();
  }
  for (let i = 0; i < 2600; i++) {
    const x = rand(0, 2048), y = rand(0, 1024), r = Math.pow(Math.random(), 3) * 40 + 1.2;
    const sx = 1 / Math.max(0.2, Math.sin((y / 1024) * Math.PI)); // compensate equirect stretch
    g.save(); g.translate(x, y); g.scale(Math.min(sx, 5), 1);
    g.fillStyle = 'rgba(40,40,42,.33)'; g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(190,190,186,.2)'; g.beginPath(); g.arc(-r * 0.18, -r * 0.18, r * 0.82, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(120,120,118,.5)'; g.beginPath(); g.arc(0, 0, r * 0.62, 0, Math.PI * 2); g.fill();
    g.restore();
  }
  return srgb(new THREE.CanvasTexture(c));
}

export function earthTexture() {
  const [c, g] = canvas(1024, 512);
  g.fillStyle = '#1b4f7d'; g.fillRect(0, 0, 1024, 512);
  const land = (x: number, y: number, rx: number, ry: number, col: string) => {
    g.fillStyle = col; g.beginPath(); g.ellipse(x, y, rx, ry, rand(0, Math.PI), 0, Math.PI * 2); g.fill();
  };
  for (let i = 0; i < 40; i++) land(rand(0, 1024), rand(60, 450), rand(20, 90), rand(15, 60), Math.random() < 0.6 ? '#3d6a35' : '#7b6a46');
  for (let i = 0; i < 60; i++) land(rand(380, 515), rand(170, 340), rand(10, 45), rand(10, 45), Math.random() < 0.75 ? '#41703a' : '#5d7a3f');
  g.fillStyle = '#c9b98a'; g.fillRect(514, 200, 3, 112);
  for (let i = 0; i < 70; i++) {
    const x = rand(0, 1024), y = rand(0, 512);
    if (Math.abs(x - 512) < 70 && Math.abs(y - 256) < 70) continue;
    g.fillStyle = `rgba(255,255,255,${rand(0.15, 0.45)})`;
    g.beginPath(); g.ellipse(x, y, rand(15, 70), rand(6, 22), rand(-0.3, 0.3), 0, Math.PI * 2); g.fill();
  }
  return srgb(new THREE.CanvasTexture(c));
}

/** Tileable regolith for the surface terrain. */
export function regolithTexture() {
  const [c, g] = canvas(512, 512);
  g.fillStyle = '#7d7c78'; g.fillRect(0, 0, 512, 512);
  const img = g.getImageData(0, 0, 512, 512);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 38;
    img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
  for (let i = 0; i < 260; i++) {
    const x = rand(0, 512), y = rand(0, 512), r = Math.pow(Math.random(), 2.5) * 22 + 1;
    for (const [dx, dy] of [[0, 0], [512, 0], [-512, 0], [0, 512], [0, -512]]) {
      g.fillStyle = 'rgba(50,50,50,.25)'; g.beginPath(); g.arc(x + dx, y + dy, r, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(170,170,165,.18)'; g.beginPath(); g.arc(x + dx - r * 0.2, y + dy - r * 0.2, r * 0.8, 0, Math.PI * 2); g.fill();
    }
  }
  const t = srgb(new THREE.CanvasTexture(c));
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export function solarCellTexture() {
  const [c, g] = canvas(256, 128);
  g.fillStyle = '#0d1d3a'; g.fillRect(0, 0, 256, 128);
  g.strokeStyle = 'rgba(160,190,255,.35)'; g.lineWidth = 2;
  for (let x = 0; x <= 256; x += 32) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 128); g.stroke(); }
  for (let y = 0; y <= 128; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(256, y); g.stroke(); }
  return srgb(new THREE.CanvasTexture(c));
}

const loader = new THREE.TextureLoader();
/** Loads an image texture; resolves null (instead of throwing) if the file is missing. */
export function tryLoad(url: string): Promise<THREE.Texture | null> {
  return new Promise((resolve) => {
    loader.load(url, (t) => resolve(srgb(t)), undefined, () => resolve(null));
  });
}
