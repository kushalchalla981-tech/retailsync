import * as THREE from 'three';
import { TeamMember } from '../data/team';

export function createCardTexture(member: TeamMember, index: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1440;
  const ctx = canvas.getContext('2d')!;

  const w = canvas.width;
  const h = canvas.height;

  // 1. Draw rounded card background with shadow/border
  ctx.save();
  
  // Card base fill (Warm cream/paper with distinct card border)
  ctx.fillStyle = '#fdfaf6';
  roundRect(ctx, 30, 30, w - 60, h - 60, 48);
  ctx.fill();

  // Dark outline border
  ctx.lineWidth = 14;
  ctx.strokeStyle = '#1a1918';
  ctx.stroke();

  // Top header strip with accent color
  ctx.save();
  ctx.clip(); // clip to card round rect
  
  // Top Banner
  const gradient = ctx.createLinearGradient(0, 0, w, 400);
  gradient.addColorStop(0, member.avatarTheme.primaryColor);
  gradient.addColorStop(1, member.avatarTheme.accentColor);
  ctx.fillStyle = gradient;
  ctx.fillRect(30, 30, w - 60, 520);

  // Decorative grid lines on top banner
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
  ctx.lineWidth = 2;
  for (let x = 60; x < w - 60; x += 40) {
    ctx.beginPath();
    ctx.moveTo(x, 30);
    ctx.lineTo(x, 550);
    ctx.stroke();
  }
  for (let y = 60; y < 550; y += 40) {
    ctx.beginPath();
    ctx.moveTo(30, y);
    ctx.lineTo(w - 30, y);
    ctx.stroke();
  }

  // Large Index Number watermark (e.g. 01)
  ctx.fillStyle = 'rgba(255, 255, 255, 0.28)';
  ctx.font = '900 160px Inter, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(String(index + 1).padStart(2, '0'), w - 70, 200);

  // Member Avatar Area (Stylized contribution emblem)
  drawContributionEmblem(ctx, w / 2, 330, member);

  ctx.restore(); // end clip

  // 2. Card Content (Typography & Badges)
  // Superpower Pill Badge
  ctx.save();
  const superText = `${member.superpower.icon} ${member.superpower.name.toUpperCase()}`;
  ctx.font = '800 28px Inter, monospace';
  const superWidth = ctx.measureText(superText).width + 60;
  
  ctx.fillStyle = '#1a1918';
  roundRect(ctx, (w - superWidth) / 2, 580, superWidth, 64, 32);
  ctx.fill();

  ctx.fillStyle = member.avatarTheme.accentColor;
  ctx.textAlign = 'center';
  ctx.fillText(superText, w / 2, 622);
  ctx.restore();

  // Member Name (Bold chunky display)
  ctx.fillStyle = '#1a1918';
  ctx.font = '900 76px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(member.name, w / 2, 730);

  // Squiggly line under name
  ctx.strokeStyle = member.avatarTheme.primaryColor;
  ctx.lineWidth = 8;
  ctx.lineCap = 'round';
  ctx.beginPath();
  const lineW = 340;
  const startX = (w - lineW) / 2;
  const lineY = 765;
  for (let x = 0; x <= lineW; x += 20) {
    const yOffset = Math.sin((x / lineW) * Math.PI * 4) * 8;
    if (x === 0) ctx.moveTo(startX, lineY + yOffset);
    else ctx.lineTo(startX + x, lineY + yOffset);
  }
  ctx.stroke();

  // Role Title
  ctx.fillStyle = '#655e58';
  ctx.font = '700 36px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(member.role, w / 2, 840);

  // Contribution Card Box
  ctx.fillStyle = '#f0e5d8';
  roundRect(ctx, 80, 890, w - 160, 260, 28);
  ctx.fill();
  ctx.strokeStyle = 'rgba(26, 25, 24, 0.15)';
  ctx.lineWidth = 3;
  ctx.stroke();

  // Contribution Title & Summary
  ctx.fillStyle = '#1a1918';
  ctx.font = '800 30px Inter, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText("PART CONTRIBUTED:", 110, 945);

  ctx.font = '600 28px Inter, sans-serif';
  ctx.fillStyle = '#3c3732';
  wrapText(ctx, member.contribution.title, 110, 990, w - 220, 38);

  ctx.font = '400 24px Inter, sans-serif';
  ctx.fillStyle = '#786f66';
  wrapText(ctx, member.contribution.summary, 110, 1070, w - 220, 32);

  // Tools / Tech Tags (Row of pills)
  let tagX = 80;
  const tagY = 1200;
  ctx.font = '700 22px Inter, monospace';
  
  member.tools.slice(0, 4).forEach(tool => {
    const tw = ctx.measureText(tool).width + 36;
    ctx.fillStyle = '#ffffff';
    roundRect(ctx, tagX, tagY, tw, 46, 23);
    ctx.fill();
    ctx.strokeStyle = '#1a1918';
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.fillStyle = '#1a1918';
    ctx.textAlign = 'center';
    ctx.fillText(tool, tagX + tw / 2, tagY + 31);
    tagX += tw + 14;
  });

  // Footer "CLICK TO EXPLORE ✦" Button
  ctx.fillStyle = member.avatarTheme.primaryColor;
  roundRect(ctx, 80, 1290, w - 160, 76, 38);
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#1a1918';
  ctx.stroke();

  ctx.fillStyle = '#ffffff';
  ctx.font = '900 28px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText("VIEW SQUAD DOSSIER ➔", w / 2, 1338);

  ctx.restore();

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

function drawContributionEmblem(ctx: CanvasRenderingContext2D, cx: number, cy: number, member: TeamMember) {
  ctx.save();
  
  // Outer glowing aura circle
  ctx.beginPath();
  ctx.arc(cx, cy, 140, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
  ctx.fill();

  // White base disc with pop outline
  ctx.beginPath();
  ctx.arc(cx, cy, 115, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.lineWidth = 8;
  ctx.strokeStyle = '#1a1918';
  ctx.stroke();

  // Core icon or graphic
  ctx.font = '110px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(member.superpower.icon, cx, cy + 6);

  // Rotating badge orbit dots
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    const px = cx + Math.cos(angle) * 135;
    const py = cy + Math.sin(angle) * 135;
    ctx.beginPath();
    ctx.arc(px, py, 6, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
  }

  ctx.restore();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number) {
  const words = text.split(' ');
  let line = '';
  let curY = y;

  for (let n = 0; n < words.length; n++) {
    const testLine = line + words[n] + ' ';
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && n > 0) {
      ctx.fillText(line, x, curY);
      line = words[n] + ' ';
      curY += lineHeight;
    } else {
      line = testLine;
    }
  }
  ctx.fillText(line, x, curY);
}
