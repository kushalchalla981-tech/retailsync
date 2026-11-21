import * as THREE from 'three';
import { TeamMember } from '../data/team';

const hex = (h: string) => {
  h = h.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) || 0);
};

const toHex = (c: number[]) =>
  '#' + c.map((x) => Math.round(Math.max(0, Math.min(255, x))).toString(16).padStart(2, '0')).join('');

export const mix = (a: string, b: string, t: number) => toHex(hex(a).map((x, i) => x + (hex(b)[i] - x) * t));

const luma = (h: string) => {
  const [r, g, b] = hex(h);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
};

export type CategoryKind = 'tech' | 'fashion' | 'grocery' | 'books' | 'beauty' | 'home' | 'sports' | 'custom';

export function detectCategory(cat = '', name = ''): CategoryKind {
  const s = `${cat} ${name}`.toLowerCase();
  if (/tech|electron|circu|gadget|hardw|device|pcb|comput|phone|audio|mcu|noki/i.test(s)) return 'tech';
  if (/fashion|apparel|thread|cloth|garment|streetwear|wear|shoe|sneaker|couture/i.test(s)) return 'fashion';
  if (/grocer|food|beverag|peel|pour|pantry|organic|fruit|juice|coffee|tea|cafe|bakery/i.test(s)) return 'grocery';
  if (/book|folio|spine|station|literat|journal|print|paper|read|art|quill/i.test(s)) return 'books';
  if (/beauty|lumi|cosmetic|skincare|fragran|makeup|wellness|glow|salon|derm/i.test(s)) return 'beauty';
  if (/home|hearth|decor|furnitur|kitchen|living|ceramic|pottery|stoneware|interi/i.test(s)) return 'home';
  if (/sport|fit|gym|active|athlet|workout/i.test(s)) return 'sports';
  return 'custom';
}

/** Palette derivation for fallback compatibility and card background accents. */
export function cardPalette(m: TeamMember) {
  const P = m.avatarTheme?.primaryColor || '#ff5c35';
  const A = luma(m.avatarTheme?.accentColor || '#ffd600') > 0.15
    ? (m.avatarTheme?.accentColor || '#ffd600')
    : mix(P, '#ffffff', 0.5);

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

/** Helper to draw crisp rounded rectangles in Canvas 2D. */
function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number | [number, number, number, number]
) {
  ctx.beginPath();
  if (typeof r === 'number') {
    ctx.roundRect(x, y, w, h, r);
  } else {
    ctx.roundRect(x, y, w, h, r);
  }
}

/** Truncate long strings with ellipsis. */
function truncate(s: string, maxLen: number) {
  return s.length > maxLen ? s.slice(0, maxLen - 1).trim() + '…' : s;
}

interface DisplayProduct {
  name: string;
  price: string;
  emoji: string;
  tag?: string;
}

/** Returns 2-3 category-authentic products for display on the card face. */
function getCardProducts(m: TeamMember, kind: CategoryKind): DisplayProduct[] {
  if (m.products && m.products.length >= 2) {
    return m.products.slice(0, 3).map((p, i) => ({
      name: p.name,
      price: p.price,
      emoji: p.emoji || (i === 0 ? '✦' : '📦'),
      tag: i === 0 ? 'BESTSELLER' : i === 1 ? 'TOP PICK' : 'IN STOCK',
    }));
  }

  // Fallback defaults tailored to category
  switch (kind) {
    case 'tech':
      return [
        { name: 'Noise-Cancelling Headphones', price: '₹8,999', emoji: '🎧', tag: 'BESTSELLER' },
        { name: 'Wireless Keyboard', price: '₹5,499', emoji: '⌨️', tag: '4K AUDIO' },
        { name: 'Smartwatch Pro', price: '₹12,999', emoji: '⌚', tag: 'GENUINE' },
      ];
    case 'fashion':
      return [
        { name: 'Oxford Linen Shirt', price: '₹3,299', emoji: '👔', tag: 'NEW DROP' },
        { name: 'Flyknit Runners', price: '₹6,999', emoji: '👟', tag: 'PREMIUM' },
        { name: 'Classic Sunglasses', price: '₹1,999', emoji: '🕶️', tag: 'UV400' },
      ];
    case 'grocery':
      return [
        { name: 'Cold-Brew Coffee (500ml)', price: '₹349', emoji: '☕', tag: 'FARM FRESH' },
        { name: 'Farm Watermelon', price: '₹129', emoji: '🍉', tag: 'ORGANIC' },
        { name: 'Cold-Pressed Juice', price: '₹159', emoji: '🍊', tag: 'ZERO SUGAR' },
      ];
    case 'books':
      return [
        { name: 'Hardcover Journal', price: '₹899', emoji: '📚', tag: 'FIRST EDITION' },
        { name: 'Brass Fountain Pen', price: '₹2,499', emoji: '✒️', tag: 'ARCHIVAL' },
        { name: "Collector's Bookstand", price: '₹3,799', emoji: '📖', tag: 'SOLID OAK' },
      ];
    case 'beauty':
      return [
        { name: 'Botanical Face Serum', price: '₹1,899', emoji: '🧴', tag: 'DERM TESTED' },
        { name: 'Rose Quartz Roller', price: '₹1,299', emoji: '✨', tag: 'GLOW' },
        { name: 'Velvet Matte Lip', price: '₹1,499', emoji: '💄', tag: 'CLEAN' },
      ];
    case 'home':
      return [
        { name: 'Ceramic Pour-Over', price: '₹1,899', emoji: '🏺', tag: 'HAND THROWN' },
        { name: 'Linen Table Runner', price: '₹1,499', emoji: '🧺', tag: 'NATURAL' },
        { name: 'Cast Iron Skillet', price: '₹3,499', emoji: '🍳', tag: 'LIFETIME' },
      ];
    case 'sports':
      return [
        { name: 'High-Density Foam Roller', price: '₹1,499', emoji: '🧘', tag: 'RECOVERY' },
        { name: 'Insulated Grip Bottle', price: '₹899', emoji: '🏋️', tag: 'TITANIUM' },
        { name: 'Performance Speed Rope', price: '₹699', emoji: '⚡', tag: 'PRO' },
      ];
    default:
      return [
        { name: `${m.name} Signature Product`, price: '₹2,499', emoji: m.superpower?.icon || '✨', tag: 'FLAGSHIP' },
        { name: 'Essential Starter Pack', price: '₹1,299', emoji: '📦', tag: 'BEST VALUE' },
        { name: 'Collector Member Pass', price: '₹3,499', emoji: '⭐', tag: 'LIMITED' },
      ];
  }
}

/**
 * Draws category-specific background artwork onto the card canvas.
 */
function drawCategoryWorld(
  ctx: CanvasRenderingContext2D,
  kind: CategoryKind,
  W: number,
  H: number,
  P: string,
  A: string
) {
  switch (kind) {
    case 'tech': {
      // Dark cybernetic PCB grid with glowing cyan circuit traces
      const bg = ctx.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, '#071018');
      bg.addColorStop(0.5, '#0b1d2c');
      bg.addColorStop(1, '#08131e');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);

      // Dot matrix
      ctx.fillStyle = 'rgba(0, 229, 255, 0.12)';
      const step = 32;
      for (let x = 20; x < W; x += step) {
        for (let y = 20; y < H; y += step) {
          ctx.beginPath();
          ctx.arc(x, y, 1.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // PCB Circuit traces
      ctx.save();
      ctx.strokeStyle = 'rgba(0, 229, 255, 0.35)';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';

      const traces = [
        [[60, 180], [140, 180], [180, 220], [180, 340]],
        [[W - 60, 160], [W - 130, 160], [W - 190, 220], [W - 190, 310]],
        [[80, H - 240], [150, H - 240], [190, H - 280], [280, H - 280]],
        [[W - 80, H - 220], [W - 160, H - 220], [W - 210, H - 270], [W - 270, H - 270]],
        [[70, 480], [130, 480], [170, 520], [170, 620]],
        [[W - 70, 490], [W - 140, 490], [W - 170, 520], [W - 170, 610]],
      ];

      traces.forEach((pts) => {
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i++) {
          ctx.lineTo(pts[i][0], pts[i][1]);
        }
        ctx.stroke();

        // Solder pad via rings
        const last = pts[pts.length - 1];
        ctx.fillStyle = '#00e5ff';
        ctx.beginPath();
        ctx.arc(last[0], last[1], 4, 0, Math.PI * 2);
        ctx.fill();
      });

      // Microchip schematic badge outline
      ctx.strokeStyle = 'rgba(123, 78, 255, 0.4)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(W / 2 - 120, 275, 240, 35);
      ctx.fillStyle = 'rgba(0, 229, 255, 0.7)';
      ctx.font = '600 12px Inter';
      ctx.textAlign = 'center';
      ctx.fillText('IC-8904 · ZERO-LATENCY BUS · 4K HDR', W / 2, 297);

      ctx.restore();
      break;
    }

    case 'fashion': {
      // Warm sunset coral/amber gradient with diagonal twill weave
      const bg = ctx.createLinearGradient(0, 0, W, H);
      bg.addColorStop(0, '#ff5c35');
      bg.addColorStop(0.55, '#f0743b');
      bg.addColorStop(1, '#ffd600');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);

      // Tactile twill diagonal lines
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.lineWidth = 1.5;
      for (let i = -H; i < W + H; i += 18) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i + H, H);
        ctx.stroke();
      }

      // Streetwear hangtag grommet and stitching
      ctx.strokeStyle = 'rgba(26, 25, 24, 0.25)';
      ctx.lineWidth = 2.5;
      ctx.setLineDash([8, 6]);
      ctx.strokeRect(36, 120, W - 72, H - 240);
      ctx.setLineDash([]);

      // Hangtag eyelet ring at top
      ctx.fillStyle = '#1a1918';
      ctx.beginPath();
      ctx.arc(W / 2, 105, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fdfaf6';
      ctx.beginPath();
      ctx.arc(W / 2, 105, 4.5, 0, Math.PI * 2);
      ctx.fill();

      // Funky starbursts
      const drawStar = (cx: number, cy: number, size: number) => {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
        ctx.beginPath();
        for (let a = 0; a < 8; a++) {
          const r = a % 2 === 0 ? size : size * 0.35;
          const angle = (a * Math.PI) / 4;
          const x = cx + Math.cos(angle) * r;
          const y = cy + Math.sin(angle) * r;
          if (a === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fill();
      };
      drawStar(90, 240, 22);
      drawStar(W - 90, 250, 20);
      drawStar(W - 80, H - 260, 26);
      drawStar(85, H - 250, 18);

      ctx.restore();
      break;
    }

    case 'grocery': {
      // Fresh matcha and citrus sunshine botanical gradient
      const bg = ctx.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, '#78c828');
      bg.addColorStop(0.4, '#a7f432');
      bg.addColorStop(1, '#ffc020');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);

      // Concentric organic botanical rings / citrus slices
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)';
      ctx.lineWidth = 3;

      // Top-right citrus slice
      ctx.beginPath();
      ctx.arc(W + 20, 200, 160, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(W + 20, 200, 120, 0, Math.PI * 2);
      ctx.stroke();
      for (let a = 0; a < 8; a++) {
        const rad = (a * Math.PI) / 4;
        ctx.beginPath();
        ctx.moveTo(W + 20 + Math.cos(rad) * 40, 200 + Math.sin(rad) * 40);
        ctx.lineTo(W + 20 + Math.cos(rad) * 120, 200 + Math.sin(rad) * 120);
        ctx.stroke();
      }

      // Floating splash droplets
      const drawDroplet = (x: number, y: number, r: number) => {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      };
      drawDroplet(80, 220, 14);
      drawDroplet(120, 250, 8);
      drawDroplet(60, 280, 10);
      drawDroplet(W - 70, H - 280, 16);
      drawDroplet(W - 110, H - 250, 9);

      // Farm stamp watermark
      ctx.fillStyle = 'rgba(26, 25, 24, 0.08)';
      ctx.beginPath();
      ctx.arc(W / 2, 500, 200, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
      break;
    }

    case 'books': {
      // Warm vintage vellum and antique leather
      const bg = ctx.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, '#2c1e14');
      bg.addColorStop(0.5, '#412b1d');
      bg.addColorStop(1, '#1e140d');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);

      ctx.save();
      // Double ornate bookplate gold border
      ctx.strokeStyle = '#d4af37';
      ctx.lineWidth = 2.5;
      roundRect(ctx, 40, 40, W - 80, H - 80, 12);
      ctx.stroke();

      ctx.strokeStyle = 'rgba(212, 175, 55, 0.4)';
      ctx.lineWidth = 1;
      roundRect(ctx, 48, 48, W - 96, H - 96, 8);
      ctx.stroke();

      // Corner florets
      const floret = (x: number, y: number) => {
        ctx.fillStyle = '#d4af37';
        ctx.beginPath();
        ctx.arc(x, y, 5, 0, Math.PI * 2);
        ctx.fill();
      };
      floret(58, 58);
      floret(W - 58, 58);
      floret(58, H - 58);
      floret(W - 58, H - 58);

      // Draped red satin bookmark ribbon from top
      ctx.fillStyle = '#9b1c2e';
      ctx.beginPath();
      ctx.moveTo(W - 120, 40);
      ctx.lineTo(W - 80, 40);
      ctx.lineTo(W - 80, 170);
      ctx.lineTo(W - 100, 150);
      ctx.lineTo(W - 120, 170);
      ctx.closePath();
      ctx.fill();

      ctx.restore();
      break;
    }

    case 'beauty': {
      // Pearlescent blush rose & champagne gold glow
      const bg = ctx.createRadialGradient(W / 2, H * 0.4, 60, W / 2, H / 2, W * 0.8);
      bg.addColorStop(0, '#ffeef2');
      bg.addColorStop(0.5, '#f4d2db');
      bg.addColorStop(1, '#e2acc0');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);

      ctx.save();
      // Concentric contour fluid ripples
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
      ctx.lineWidth = 2;
      for (let r = 80; r < 360; r += 55) {
        ctx.beginPath();
        ctx.ellipse(W / 2, 490, r * 1.1, r * 0.75, 0.1, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Luxury fine line border
      ctx.strokeStyle = 'rgba(120, 50, 75, 0.2)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(36, 36, W - 72, H - 72);

      ctx.restore();
      break;
    }

    case 'home': {
      // Warm terracotta, raw sandstone, and pottery glaze
      const bg = ctx.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, '#cf6a4c');
      bg.addColorStop(0.6, '#e08264');
      bg.addColorStop(1, '#eed2b6');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);

      ctx.save();
      // Modernist architectural arch
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(W / 2, 380, 170, Math.PI, 0, false);
      ctx.lineTo(W / 2 + 170, 680);
      ctx.lineTo(W / 2 - 170, 680);
      ctx.closePath();
      ctx.stroke();

      // Ceramic speckles
      ctx.fillStyle = 'rgba(60, 30, 20, 0.15)';
      for (let i = 0; i < 90; i++) {
        const x = (Math.sin(i * 123.4) * 0.5 + 0.5) * W;
        const y = (Math.cos(i * 456.7) * 0.5 + 0.5) * H;
        ctx.beginPath();
        ctx.arc(x, y, 1.8, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
      break;
    }

    case 'sports': {
      // High-voltage lime to dark graphite with speed chevrons
      const bg = ctx.createLinearGradient(0, 0, W, H);
      bg.addColorStop(0, '#0f172a');
      bg.addColorStop(0.65, '#1e293b');
      bg.addColorStop(1, '#a7f432');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);

      ctx.save();
      // Dynamic speed chevrons
      ctx.strokeStyle = 'rgba(167, 244, 50, 0.25)';
      ctx.lineWidth = 6;
      ctx.lineCap = 'round';
      for (let y = 140; y < H - 150; y += 90) {
        ctx.beginPath();
        ctx.moveTo(W - 120, y);
        ctx.lineTo(W - 70, y + 30);
        ctx.lineTo(W - 120, y + 60);
        ctx.stroke();
      }

      ctx.restore();
      break;
    }

    default: {
      // Custom / Merchant store dynamic pop-art world using store's brand colors
      const bg = ctx.createLinearGradient(0, 0, W, H);
      bg.addColorStop(0, P);
      bg.addColorStop(0.6, mix(P, A, 0.5));
      bg.addColorStop(1, A);
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);

      ctx.save();
      // Neo-brutalist pop grid
      ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
      for (let x = 24; x < W; x += 36) {
        for (let y = 24; y < H; y += 36) {
          ctx.beginPath();
          ctx.arc(x, y, 2, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Diagonal racing stripes
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.lineWidth = 4;
      for (let i = -H; i < W + H; i += 40) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i + H, H);
        ctx.stroke();
      }

      ctx.restore();
      break;
    }
  }
}

/**
 * Draws the complete, collectible, product-driven funky card canvas.
 * Used for both the 3D WebGL cylinder and the 2D flat carousel fallback.
 */
export function drawPreviewCanvas(m: TeamMember, index: number): HTMLCanvasElement {
  const W = 768;
  const H = 1024;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;

  const P = m.avatarTheme?.primaryColor || '#ff5c35';
  const A = m.avatarTheme?.accentColor || '#ffd600';
  const kind = detectCategory(m.category, m.name);
  const products = getCardProducts(m, kind);

  // 1. Draw Bespoke Category Visual World
  drawCategoryWorld(ctx, kind, W, H, P, A);

  // 2. Outer Neo-Brutalist Frame
  ctx.save();
  ctx.strokeStyle = '#1a1918';
  ctx.lineWidth = 5;
  roundRect(ctx, 16, 16, W - 32, H - 32, 28);
  ctx.stroke();

  // Corner punch accents
  const punchCorner = (x: number, y: number) => {
    ctx.fillStyle = '#1a1918';
    ctx.beginPath();
    ctx.arc(x, y, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fdfaf6';
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fill();
  };
  punchCorner(40, 40);
  punchCorner(W - 40, 40);
  punchCorner(40, H - 40);
  punchCorner(W - 40, H - 40);

  // 3. Header Strip (Category badge & Store #)
  const catLabel = (m.category || m.role?.replace(/ store$/i, '') || 'Retail').toUpperCase();
  const icon = m.superpower?.icon || '✦';

  // Left category pill
  ctx.fillStyle = '#1a1918';
  roundRect(ctx, 48, 54, 210, 38, 19);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 13px Inter';
  ctx.textAlign = 'left';
  ctx.fillText(`${icon}  ${catLabel}`, 66, 78);

  // Right Edition badge
  ctx.fillStyle = '#1a1918';
  roundRect(ctx, W - 180, 54, 132, 38, 19);
  ctx.fill();
  ctx.fillStyle = '#a7f432';
  ctx.font = '800 13px Inter';
  ctx.textAlign = 'center';
  ctx.fillText(`№ 0${index + 1} / '26`, W - 114, 78);

  // 4. Store Title Display (Big Modak Typography with bold drop shadow)
  const title = m.name.toLowerCase();
  const titleLen = title.length;
  const titleSize = titleLen > 11 ? 82 : titleLen > 8 ? 104 : titleLen > 6 ? 128 : 148;

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `${titleSize}px Modak`;

  // Drop shadow
  ctx.fillStyle = '#1a1918';
  ctx.fillText(title, W / 2 + 5, 172 + 5);

  // Title face
  const titleColor = kind === 'tech' ? '#00e5ff' : kind === 'books' ? '#ffd778' : '#ffffff';
  ctx.fillStyle = titleColor;
  ctx.fillText(title, W / 2, 172);

  // 5. Store Tagline Marquee Strip
  const pitch = (m.superpower?.name || m.quote || m.role || 'Curated storefront').toUpperCase();
  ctx.fillStyle = '#1a1918';
  roundRect(ctx, 48, 240, W - 96, 36, 18);
  ctx.fill();
  ctx.fillStyle = '#ffd600';
  ctx.font = '700 12px Inter';
  ctx.textAlign = 'center';
  ctx.fillText(truncate(pitch, 52), W / 2, 263);

  // 6. HERO PRODUCT SHOWCASE STAGE
  const hero = products[0];
  const prod2 = products[1];
  const prod3 = products[2];

  // Primary Hero Card (Top Featured Item)
  const heroX = 48;
  const heroY = 296;
  const heroW = W - 96;
  const heroH = 196;

  // Solid neo-brutalist shadow
  ctx.fillStyle = '#1a1918';
  roundRect(ctx, heroX + 6, heroY + 6, heroW, heroH, 22);
  ctx.fill();

  // White Card Face
  ctx.fillStyle = '#ffffff';
  roundRect(ctx, heroX, heroY, heroW, heroH, 22);
  ctx.fill();
  ctx.strokeStyle = '#1a1918';
  ctx.lineWidth = 3.5;
  roundRect(ctx, heroX, heroY, heroW, heroH, 22);
  ctx.stroke();

  // Emoji circular badge on left
  const emojiX = heroX + 22;
  const emojiY = heroY + 28;
  const emojiSize = 88;
  ctx.fillStyle = kind === 'tech' ? '#e0f7fa' : kind === 'fashion' ? '#fff3e0' : kind === 'grocery' ? '#f1f8e9' : '#f5f5f5';
  roundRect(ctx, emojiX, emojiY, emojiSize, emojiSize, 20);
  ctx.fill();
  ctx.strokeStyle = '#1a1918';
  ctx.lineWidth = 2.5;
  roundRect(ctx, emojiX, emojiY, emojiSize, emojiSize, 20);
  ctx.stroke();

  // Render Emoji inside badge
  ctx.font = '48px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(hero.emoji, emojiX + emojiSize / 2, emojiY + emojiSize / 2 + 4);

  // Hero Product Content (Middle & Right)
  const textLeft = emojiX + emojiSize + 22;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';

  // Sticker tag pill
  ctx.fillStyle = '#1a1918';
  roundRect(ctx, textLeft, heroY + 28, 105, 24, 12);
  ctx.fill();
  ctx.fillStyle = '#a7f432';
  ctx.font = '800 11px Inter';
  ctx.fillText(`★ ${hero.tag || 'FLAGSHIP'}`, textLeft + 14, heroY + 34);

  // Product Name
  ctx.fillStyle = '#1a1918';
  ctx.font = '800 23px Inter';
  ctx.fillText(truncate(hero.name, 26), textLeft, heroY + 60);

  // Subtitle / Specs
  ctx.fillStyle = '#5c544d';
  ctx.font = '500 13px Inter';
  ctx.fillText('Genuine Curated SKU · Same-Day Dispatch', textLeft, heroY + 94);

  // Price tag badge
  ctx.fillStyle = '#1a1918';
  roundRect(ctx, textLeft, heroY + 124, 140, 42, 12);
  ctx.fill();
  ctx.fillStyle = '#a7f432';
  ctx.font = '800 20px Inter';
  ctx.fillText(hero.price, textLeft + 16, heroY + 134);

  // "IN STOCK" green status pill next to price
  ctx.fillStyle = '#e8f5e9';
  roundRect(ctx, textLeft + 152, heroY + 128, 108, 34, 17);
  ctx.fill();
  ctx.strokeStyle = '#2e7d32';
  ctx.lineWidth = 1.5;
  roundRect(ctx, textLeft + 152, heroY + 128, 108, 34, 17);
  ctx.stroke();
  ctx.fillStyle = '#2e7d32';
  ctx.beginPath();
  ctx.arc(textLeft + 168, heroY + 145, 4.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#1b5e20';
  ctx.font = '700 11px Inter';
  ctx.fillText('IN STOCK', textLeft + 180, heroY + 138);

  // Secondary Product Badges (Pills #2 & #3 side by side)
  const drawMiniBadge = (prod: DisplayProduct, x: number, y: number, w: number, h: number) => {
    // Shadow
    ctx.fillStyle = '#1a1918';
    roundRect(ctx, x + 5, y + 5, w, h, 18);
    ctx.fill();

    // Face
    ctx.fillStyle = '#ffffff';
    roundRect(ctx, x, y, w, h, 18);
    ctx.fill();
    ctx.strokeStyle = '#1a1918';
    ctx.lineWidth = 3;
    roundRect(ctx, x, y, w, h, 18);
    ctx.stroke();

    // Emoji icon box
    ctx.fillStyle = '#f4f0ed';
    roundRect(ctx, x + 14, y + 16, 54, 54, 14);
    ctx.fill();
    ctx.strokeStyle = '#1a1918';
    ctx.lineWidth = 2;
    roundRect(ctx, x + 14, y + 16, 54, 54, 14);
    ctx.stroke();

    ctx.font = '30px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(prod.emoji, x + 41, y + 45);

    // Text details
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#1a1918';
    ctx.font = '700 15px Inter';
    ctx.fillText(truncate(prod.name, 17), x + 78, y + 18);

    ctx.fillStyle = '#ff5c35';
    ctx.font = '800 18px Inter';
    ctx.fillText(prod.price, x + 78, y + 42);

    ctx.fillStyle = '#6b7280';
    ctx.font = '600 11px Inter';
    ctx.fillText(prod.tag || 'READY TO SHIP', x + 78, y + 66);
  };

  const miniY = 512;
  const miniW = (heroW - 16) / 2;
  const miniH = 96;

  if (prod2) {
    drawMiniBadge(prod2, heroX, miniY, miniW, miniH);
  }
  if (prod3) {
    drawMiniBadge(prod3, heroX + miniW + 16, miniY, miniW, miniH);
  }

  // 7. COLLECTIBLE TICKET FOOTER & BARCODE
  const footerY = 642;

  // Perforated ticket punch line
  ctx.save();
  ctx.strokeStyle = 'rgba(26, 25, 24, 0.45)';
  ctx.lineWidth = 2.5;
  ctx.setLineDash([8, 8]);
  ctx.beginPath();
  ctx.moveTo(32, footerY);
  ctx.lineTo(W - 32, footerY);
  ctx.stroke();
  ctx.restore();

  // Ticket notch circles at perforation edges
  ctx.fillStyle = '#1a1918';
  ctx.beginPath();
  ctx.arc(16, footerY, 14, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(W - 16, footerY, 14, 0, Math.PI * 2);
  ctx.fill();

  // Live Inventory Status Strip
  const catalogCount = m.products && m.products.length > 0 ? m.products.length : 8;
  ctx.fillStyle = '#1a1918';
  roundRect(ctx, 48, footerY + 24, W - 96, 42, 14);
  ctx.fill();

  // Glowing status dot
  ctx.fillStyle = '#a7f432';
  ctx.beginPath();
  ctx.arc(76, footerY + 45, 6, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.font = '700 13px Inter';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${catalogCount} SKUS IN STOCK · AIVEN POSTGRESQL LOCKED · ZERO OVERSELL`, 96, footerY + 45);

  // Collectible Barcode Box
  const barcodeY = footerY + 84;
  ctx.fillStyle = '#ffffff';
  roundRect(ctx, 48, barcodeY, W - 96, 110, 16);
  ctx.fill();
  ctx.strokeStyle = '#1a1918';
  ctx.lineWidth = 3;
  roundRect(ctx, 48, barcodeY, W - 96, 110, 16);
  ctx.stroke();

  // Barcode vertical stripes
  ctx.fillStyle = '#1a1918';
  const barStartX = 78;
  const barW = W - 156;
  const barPattern = [
    3, 1, 4, 2, 1, 5, 2, 3, 1, 2, 4, 1, 3, 2, 5, 1, 2, 3, 1, 4,
    2, 1, 3, 5, 1, 2, 4, 1, 3, 2, 1, 4, 2, 3, 1, 5, 2, 1, 3, 2,
    4, 1, 2, 3, 5, 1, 2, 4, 1, 3, 2, 1, 4, 3, 2, 5, 1, 2, 4, 1
  ];
  let curX = barStartX;
  barPattern.forEach((w, i) => {
    if (i % 2 === 0 && curX + w < barStartX + barW) {
      ctx.fillRect(curX, barcodeY + 16, w * 1.8, 48);
    }
    curX += w * 2.1;
  });

  // Alphanumeric barcode serial string
  const storeSlug = (m.id || `st-${index + 1}`).replace(/[^a-z0-9]/gi, '').toUpperCase();
  ctx.fillStyle = '#1a1918';
  ctx.font = '700 12px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(`RS-${storeSlug}-#00${index + 1}-AIVEN-CLOUD-LIVE-AUTH`, W / 2, barcodeY + 82);

  // Security trust footer
  ctx.fillStyle = '#6b7280';
  ctx.font = '600 10px Inter';
  ctx.fillText('RETAILSYNC MULTI-TENANT CLOUD · POSTGRESQL · KAFKA · OPENSEARCH', W / 2, barcodeY + 98);

  ctx.restore();
  return c;
}

export function createPreviewTexture(m: TeamMember, index: number) {
  return finish(drawPreviewCanvas(m, index));
}

/** Procedural stand-in for paper-normals-map: fibrous height noise → tangent normals. */
export function createPaperNormalTexture(size = 512) {
  const h = new Float32Array(size * size);
  const rnd = (x: number, y: number) => {
    const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };
  const noise = (x: number, y: number, period: number) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const w = (a: number) => ((a % period) + period) % period;
    const u = xf * xf * (3 - 2 * xf);
    const v = yf * yf * (3 - 2 * yf);
    const a = rnd(w(xi), w(yi));
    const b = rnd(w(xi + 1), w(yi));
    const c = rnd(w(xi), w(yi + 1));
    const d = rnd(w(xi + 1), w(yi + 1));
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let v = 0;
      let amp = 0.5;
      let f = 8;
      for (let o = 0; o < 5; o++) {
        v += noise((x / size) * f, (y / size) * f * 0.35, f) * amp;
        amp *= 0.5;
        f *= 2;
      }
      v += (rnd(x, y) - 0.5) * 0.08;
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
