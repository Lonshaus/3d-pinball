import * as THREE from 'three';
import type { LevelDef } from '../levels/levels';

/** Playfield area covered by the floor texture, in table units. */
export const FLOOR_BOUNDS = { x0: -9.6, x1: 11.2, y0: -1.5, y1: 42.4 };

type Painter = (ctx: CanvasRenderingContext2D, w: number, h: number, level: LevelDef, rand: () => number) => void;

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Table coordinates -> canvas pixels. */
function px(w: number, h: number) {
  const { x0, x1, y0, y1 } = FLOOR_BOUNDS;
  return (x: number, y: number): [number, number] => [((x - x0) / (x1 - x0)) * w, (1 - (y - y0) / (y1 - y0)) * h];
}

function title(ctx: CanvasRenderingContext2D, w: number, h: number, level: LevelDef, color: string, glow: string) {
  const p = px(w, h);
  const [cx, cy] = p(0, 14.5);
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = glow;
  ctx.shadowBlur = 24;
  ctx.fillStyle = color;
  ctx.font = `900 ${w * 0.1}px "Noto Sans TC", "PingFang TC", "Microsoft JhengHei", sans-serif`;
  ctx.fillText(level.name, cx, cy);
  ctx.font = `700 ${w * 0.045}px "Orbitron", "Arial Black", sans-serif`;
  ctx.globalAlpha = 0.8;
  ctx.fillText(level.subtitle.split('').join(' '), cx, cy + w * 0.085);
  ctx.restore();
}

const neon: Painter = (ctx, w, h, level, rand) => {
  const t = level.theme;
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#05010f');
  g.addColorStop(0.5, t.floorBase);
  g.addColorStop(1, '#22063f');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // Synthwave sun.
  const p = px(w, h);
  const [sx, sy] = p(0, 24);
  const sr = w * 0.3;
  const sg = ctx.createLinearGradient(0, sy - sr, 0, sy + sr);
  sg.addColorStop(0, '#ffe14d');
  sg.addColorStop(0.55, t.floorAccent);
  sg.addColorStop(1, '#5b0d8a');
  ctx.save();
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = sg;
  ctx.beginPath();
  ctx.arc(sx, sy, sr, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 7; i++) {
    const y = sy + sr * 0.05 + i * sr * 0.14;
    ctx.fillRect(sx - sr, y, sr * 2, 3 + i * 2.2);
  }
  ctx.restore();

  // Grid.
  ctx.save();
  ctx.lineWidth = 2;
  ctx.shadowBlur = 10;
  for (let y = 0; y <= 42; y += 2) {
    ctx.strokeStyle = t.floorAccent;
    ctx.shadowColor = t.floorAccent;
    ctx.globalAlpha = 0.25 + 0.25 * (1 - y / 42);
    const [, cy] = p(0, y);
    ctx.beginPath();
    ctx.moveTo(0, cy);
    ctx.lineTo(w, cy);
    ctx.stroke();
  }
  for (let x = -10; x <= 12; x += 2) {
    ctx.strokeStyle = t.floorAccent2;
    ctx.shadowColor = t.floorAccent2;
    ctx.globalAlpha = 0.25;
    const [cx] = p(x, 0);
    ctx.beginPath();
    ctx.moveTo(cx, 0);
    ctx.lineTo(cx, h);
    ctx.stroke();
  }
  ctx.restore();

  // City skyline silhouettes at the top.
  ctx.save();
  ctx.fillStyle = '#0a0220';
  let x = 0;
  const [, horizon] = p(0, 33.5);
  while (x < w) {
    const bw = w * (0.03 + rand() * 0.05);
    const bh = h * (0.02 + rand() * 0.06);
    ctx.fillRect(x, horizon - bh, bw, bh + 6);
    ctx.fillStyle = rand() > 0.5 ? t.floorAccent2 : '#ffe14d';
    for (let wy = horizon - bh + 6; wy < horizon - 4; wy += 9) {
      for (let wx = x + 3; wx < x + bw - 3; wx += 7) if (rand() > 0.6) ctx.fillRect(wx, wy, 3, 4);
    }
    ctx.fillStyle = '#0a0220';
    x += bw + 2;
  }
  ctx.restore();

  title(ctx, w, h, level, '#ffffff', t.floorAccent);
};

const ocean: Painter = (ctx, w, h, level, rand) => {
  const t = level.theme;
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#021a2b');
  g.addColorStop(0.55, t.floorBase);
  g.addColorStop(0.85, '#0b6a73');
  g.addColorStop(1, '#c9a86a');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // Caustics: lots of soft wobbly loops.
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 260; i++) {
    const cx = rand() * w;
    const cy = rand() * h;
    const r = 8 + rand() * 26;
    ctx.strokeStyle = `rgba(150, 255, 240, ${0.05 + rand() * 0.12})`;
    ctx.lineWidth = 1 + rand() * 2.5;
    ctx.beginPath();
    for (let a = 0; a <= Math.PI * 2 + 0.01; a += 0.3) {
      const rr = r * (0.75 + 0.35 * Math.sin(a * 3 + i));
      const x = cx + Math.cos(a) * rr;
      const y = cy + Math.sin(a) * rr * 0.8;
      if (a === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.restore();

  // Light rays from the surface.
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 7; i++) {
    const x = rand() * w;
    const rg = ctx.createLinearGradient(0, 0, 0, h * 0.7);
    rg.addColorStop(0, 'rgba(190,255,250,0.18)');
    rg.addColorStop(1, 'rgba(190,255,250,0)');
    ctx.fillStyle = rg;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + w * 0.08, 0);
    ctx.lineTo(x + w * 0.25, h * 0.7);
    ctx.lineTo(x + w * 0.05, h * 0.7);
    ctx.fill();
  }
  ctx.restore();

  // Coral & kelp along the sides.
  const p = px(w, h);
  ctx.save();
  for (let i = 0; i < 18; i++) {
    const side = i % 2 === 0 ? -8.2 : 8.2;
    const [bx, by] = p(side + (rand() - 0.5) * 1.5, 6 + rand() * 26);
    ctx.strokeStyle = rand() > 0.5 ? 'rgba(255,143,184,0.55)' : 'rgba(95,242,224,0.45)';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    const branches = 3 + Math.floor(rand() * 3);
    for (let b = 0; b < branches; b++) {
      ctx.beginPath();
      ctx.moveTo(bx, by);
      let x = bx;
      let y = by;
      for (let s = 0; s < 4; s++) {
        x += (rand() - 0.5) * 18;
        y -= 8 + rand() * 10;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }
  ctx.restore();

  title(ctx, w, h, level, '#e9fffb', t.floorAccent);
};

const lava: Painter = (ctx, w, h, level, rand) => {
  const t = level.theme;
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#0d0403');
  g.addColorStop(0.6, t.floorBase);
  g.addColorStop(1, '#3a1206');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // Rock speckles.
  for (let i = 0; i < 2500; i++) {
    const v = 20 + rand() * 30;
    ctx.fillStyle = `rgba(${v + 20},${v * 0.6},${v * 0.4},0.35)`;
    ctx.fillRect(rand() * w, rand() * h, 2 + rand() * 4, 2 + rand() * 4);
  }

  // Glowing lava cracks: random walks that branch.
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const crack = (x: number, y: number, ang: number, len: number, width: number, depth: number) => {
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let i = 0; i < len; i++) {
      ang += (rand() - 0.5) * 0.9;
      x += Math.cos(ang) * 12;
      y += Math.sin(ang) * 12;
      ctx.lineTo(x, y);
      if (depth < 2 && rand() < 0.08) {
        ctx.stroke();
        crack(x, y, ang + (rand() - 0.5) * 2, len / 2, width * 0.6, depth + 1);
        ctx.beginPath();
        ctx.moveTo(x, y);
      }
    }
    ctx.stroke();
  };
  for (const [color, lw, blur] of [
    [t.floorAccent, 7, 22],
    [t.floorAccent2, 2.5, 6],
  ] as const) {
    const r2 = mulberry32(level.id * 77 + 5);
    const saved = rand;
    rand = r2;
    ctx.strokeStyle = color;
    ctx.shadowColor = t.floorAccent;
    ctx.shadowBlur = blur;
    ctx.lineWidth = lw;
    for (let i = 0; i < 14; i++) crack(r2() * w, r2() * h, r2() * Math.PI * 2, 18 + r2() * 20, lw, 0);
    rand = saved;
  }
  ctx.restore();

  // Volcano glow behind the title.
  const p = px(w, h);
  const [cx, cy] = p(0, 24);
  const rg = ctx.createRadialGradient(cx, cy, 0, cx, cy, w * 0.45);
  rg.addColorStop(0, 'rgba(255,120,30,0.45)');
  rg.addColorStop(1, 'rgba(255,60,10,0)');
  ctx.fillStyle = rg;
  ctx.fillRect(0, 0, w, h);

  title(ctx, w, h, level, '#fff1d6', t.floorAccent);
};

const PAINTERS: Record<LevelDef['theme']['floorStyle'], Painter> = { neon, ocean, lava };

export function makeFloorTexture(level: LevelDef, maxAniso: number): THREE.CanvasTexture {
  const w = 1024;
  const h = Math.round((w * (FLOOR_BOUNDS.y1 - FLOOR_BOUNDS.y0)) / (FLOOR_BOUNDS.x1 - FLOOR_BOUNDS.x0));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  PAINTERS[level.theme.floorStyle](ctx, w, h, level, mulberry32(level.id * 1013 + 7));
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAniso;
  return tex;
}

/** Small round glow sprite used for particles. */
export function makeGlowTexture(): THREE.CanvasTexture {
  const s = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = s;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.3, 'rgba(255,255,255,0.6)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
