import * as THREE from 'three';
import { TeamMember } from '../data/team';

const hex = (h: string) => { h = h.replace('#', ''); return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)); };
const toHex = (c: number[]) => '#' + c.map((x) => Math.round(Math.max(0, Math.min(255, x))).toString(16).padStart(2, '0')).join('');
export const mix = (a: string, b: string, t: number) => toHex(hex(a).map((x, i) => x + (hex(b)[i] - x) * t));
const luma = (h: string) => { const [r, g, b] = hex(h); return (0.299 * r + 0.587 * g + 0.114 * b) / 255; };

/** Same palette derivation as hyperframes/cards/index.html so preview → video reveal is seamless. */
export function cardPalette(m: TeamMember) {
  const P = m.avatarTheme.primaryColor;
  const A = luma(m.avatarTheme.accentColor) > 0.15 ? m.avatarTheme.accentColor : mix(P, '#ffffff', 0.5);
  return {
    skyTop: mix(P, '#ffffff', 0.62),
    skyBot: mix(A, '#f4f0ed', 0.72),
    sun: mix(A, '#ffffff', 0.15),
    hill1: mix(P, '#ffffff', 0.5),
    hill2: mix(P, '#ffffff', 0.22),
    hill3: P,
    body: mix(P, '#252422', 0.18),
    title: mix(P, '#1a1918', 0.62),
  };
}

function finish(canvas: HTMLCanvasElement) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.NoColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  return tex;
}

/** Static poster used as uPreview until the HyperFrames video is decodable. */
export function createPreviewTexture(m: TeamMember, index: number) {
  const W = 768, H = 1024;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d')!;
  const p = cardPalette(m);

  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, p.skyTop); g.addColorStop(1, p.skyBot);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = p.sun;
  ctx.beginPath(); ctx.arc(550, 480, 150, 0, Math.PI * 2); ctx.fill();

  const hill = (color: string, top: number, d: string) => {
    ctx.save(); ctx.translate(-40, H - top); ctx.fillStyle = color; ctx.fill(new Path2D(d)); ctx.restore();
  };
  hill(p.hill1, 520, 'M0 220 C120 120 240 110 360 190 C480 270 600 120 848 150 L848 520 L0 520Z');
  hill(p.hill2, 400, 'M0 170 C150 60 300 80 420 150 C540 220 680 90 848 120 L848 400 L0 400Z');
  ctx.save(); ctx.translate(W / 2 - 125, H - 210 - 250);
  ctx.fillStyle = p.body; ctx.fill(new Path2D('M30 250 C10 160 40 60 125 55 C210 60 240 160 220 250Z'));
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.ellipse(95, 140, 17, 22, 0, 0, Math.PI * 2); ctx.ellipse(155, 140, 17, 22, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#252422';
  ctx.beginPath(); ctx.arc(98, 145, 8, 0, Math.PI * 2); ctx.arc(158, 145, 8, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  hill(p.hill3, 260, 'M0 90 C170 20 330 40 440 80 C560 120 700 30 848 60 L848 260 L0 260Z');

  const title = m.name.toLowerCase();
  const size = title.length > 6 ? Math.round((190 * 6) / title.length) : 190;
  ctx.fillStyle = p.title; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.font = `${size}px Modak`; ctx.fillText(title, W / 2, 96 - size * 0.12);
  ctx.font = '700 26px Inter'; ctx.textAlign = 'left'; ctx.globalAlpha = 0.55; ctx.fillText(String(index + 1).padStart(2, '0'), 44, 40);
  ctx.font = '700 20px Inter'; ctx.textAlign = 'right'; ctx.fillText(m.superpower.name.toLowerCase(), W - 44, 42);
  ctx.globalAlpha = 1; ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
  ctx.font = '800 30px Inter'; ctx.fillText(m.role.toLowerCase(), W / 2, H - 92);

  return finish(c);
}

/** Procedural stand-in for the reference's "paper-normals-map": fibrous height noise → tangent normals. */
export function createPaperNormalTexture(size = 512) {
  const h = new Float32Array(size * size);
  const rnd = (x: number, y: number) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
  const noise = (x: number, y: number, period: number) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const w = (a: number) => ((a % period) + period) % period;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = rnd(w(xi), w(yi)), b = rnd(w(xi + 1), w(yi)), c = rnd(w(xi), w(yi + 1)), d = rnd(w(xi + 1), w(yi + 1));
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let v = 0, amp = 0.5, f = 8;
      for (let o = 0; o < 5; o++) { v += noise((x / size) * f, (y / size) * f * 0.35, f) * amp; amp *= 0.5; f *= 2; } // stretched = fibres
      v += (rnd(x, y) - 0.5) * 0.08; // tooth
      h[y * size + x] = v;
    }
  }
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  const at = (x: number, y: number) => h[((y + size) % size) * size + ((x + size) % size)];
  const strength = 2.2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * size + x) * 4;
      img.data[i] = ((-dx / len) * 0.5 + 0.5) * 255;
      img.data[i + 1] = ((-dy / len) * 0.5 + 0.5) * 255;
      img.data[i + 2] = ((1 / len) * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = finish(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}
