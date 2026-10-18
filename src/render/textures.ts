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

const nightmarket: Painter = (ctx, w, h, level, rand) => {
  const t = level.theme;
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#120404');
  g.addColorStop(0.5, t.floorBase);
  g.addColorStop(1, '#3a120c');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // Tiled pavement.
  ctx.save();
  ctx.strokeStyle = 'rgba(255,190,120,0.08)';
  ctx.lineWidth = 2;
  const tile = w / 14;
  for (let y = 0; y < h; y += tile) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
    const off = (Math.round(y / tile) % 2) * tile * 0.5;
    for (let x = off; x < w; x += tile) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + tile);
      ctx.stroke();
    }
  }
  ctx.restore();

  const p = px(w, h);
  // Strings of red lanterns.
  const lanternRow = (y: number, sag: number) => {
    const [x0, y0] = p(-9.5, y);
    const [x1] = p(11, y);
    ctx.save();
    ctx.strokeStyle = 'rgba(255,210,150,0.45)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.quadraticCurveTo((x0 + x1) / 2, y0 + sag, x1, y0);
    ctx.stroke();
    for (let i = 1; i < 9; i++) {
      const u = i / 9;
      const x = x0 + (x1 - x0) * u;
      const yy = y0 + sag * 2 * u * (1 - u) + 14;
      ctx.shadowColor = t.floorAccent;
      ctx.shadowBlur = 26;
      const lg = ctx.createRadialGradient(x - 4, yy - 4, 2, x, yy, 18);
      lg.addColorStop(0, '#ffd27a');
      lg.addColorStop(0.45, '#ff3b30');
      lg.addColorStop(1, '#8a0f0f');
      ctx.fillStyle = lg;
      ctx.beginPath();
      ctx.ellipse(x, yy, 15, 19, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#ffcc33';
      ctx.fillRect(x - 7, yy - 22, 14, 4);
      ctx.fillRect(x - 7, yy + 18, 14, 4);
      ctx.fillRect(x - 1, yy + 22, 2, 10);
    }
    ctx.restore();
  };
  lanternRow(38.5, 40);
  lanternRow(31, 60);

  // Stall signs.
  const signs = ['珍珠奶茶', '大雞排', '臭豆腐', '蚵仔煎', '夾娃娃', '射氣球', '烤香腸', '刈包'];
  const colors = ['#ff3b30', '#ffcc33', '#4dd2ff', '#ff5fd2', '#7dff6a'];
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let i = 0; i < signs.length; i++) {
    const left = i % 2 === 0;
    // Right column starts lower so the claw-machine saucer doesn't cover a sign.
    const [x, y] = p(left ? -7.4 + rand() * 0.6 : 6.0 + rand() * 0.4, (left ? 26 : 23.2) - Math.floor(i / 2) * 3.0);
    const c = colors[Math.floor(rand() * colors.length)];
    const bw = w * 0.15;
    const bh = w * 0.055;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.strokeStyle = c;
    ctx.lineWidth = 3;
    ctx.shadowColor = c;
    ctx.shadowBlur = 16;
    ctx.beginPath();
    ctx.roundRect(x - bw / 2, y - bh / 2, bw, bh, 8);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = c;
    ctx.font = `900 ${bh * 0.55}px "Noto Sans TC", "PingFang TC", "Microsoft JhengHei", sans-serif`;
    ctx.fillText(signs[i], x, y + 1);
  }
  ctx.restore();

  // Warm bokeh from the stalls.
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 70; i++) {
    const x = rand() * w;
    const y = rand() * h;
    const r = 6 + rand() * 18;
    const bg = ctx.createRadialGradient(x, y, 0, x, y, r);
    bg.addColorStop(0, `rgba(255,${150 + rand() * 80},80,0.18)`);
    bg.addColorStop(1, 'rgba(255,120,60,0)');
    ctx.fillStyle = bg;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  ctx.restore();

  title(ctx, w, h, level, '#fff4d6', t.floorAccent);
};

const candy: Painter = (ctx, w, h, level, rand) => {
  const t = level.theme;
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#8fdcf5');
  g.addColorStop(0.45, t.floorBase);
  g.addColorStop(1, '#ffd98f');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // Polka dots.
  for (let i = 0; i < 160; i++) {
    ctx.fillStyle = `rgba(255,255,255,${0.2 + rand() * 0.2})`;
    ctx.beginPath();
    ctx.arc(rand() * w, rand() * h, 4 + rand() * 9, 0, Math.PI * 2);
    ctx.fill();
  }

  const p = px(w, h);
  // Lollipop swirls.
  const lollipop = (x: number, y: number, r: number, c1: string, c2: string) => {
    const [cx, cy] = p(x, y);
    const rr = (r / (FLOOR_BOUNDS.x1 - FLOOR_BOUNDS.x0)) * w;
    ctx.save();
    ctx.fillStyle = '#f7f0e6';
    ctx.fillRect(cx - 4, cy, 8, rr * 2.2);
    ctx.fillStyle = c1;
    ctx.beginPath();
    ctx.arc(cx, cy, rr, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = c2;
    ctx.lineWidth = rr * 0.18;
    ctx.beginPath();
    for (let a = 0; a < Math.PI * 7; a += 0.1) {
      const r2 = (a / (Math.PI * 7)) * rr * 0.92;
      const x2 = cx + Math.cos(a) * r2;
      const y2 = cy + Math.sin(a) * r2;
      if (a === 0) ctx.moveTo(x2, y2);
      else ctx.lineTo(x2, y2);
    }
    ctx.stroke();
    ctx.restore();
  };
  lollipop(-6.6, 33, 1.6, '#ff5fa2', '#ffffff');
  lollipop(7.4, 30, 1.3, '#5fd6c8', '#ffffff');
  lollipop(-6.8, 19.5, 1.1, '#a77bff', '#fff27a');
  lollipop(6.8, 13.5, 1.2, '#fff27a', '#ff5fa2');

  // Candy-cane stripes along the bottom.
  ctx.save();
  const [, by] = p(0, 4.5);
  ctx.beginPath();
  ctx.rect(0, by, w, h - by);
  ctx.clip();
  for (let x = -h; x < w + h; x += 46) {
    ctx.fillStyle = 'rgba(255,95,162,0.35)';
    ctx.beginPath();
    ctx.moveTo(x, h);
    ctx.lineTo(x + 22, h);
    ctx.lineTo(x + 22 + (h - by), by);
    ctx.lineTo(x + (h - by), by);
    ctx.fill();
  }
  ctx.restore();

  // Sprinkles.
  const cols = ['#ff5fa2', '#5fd6c8', '#fff27a', '#a77bff', '#ff9a4d'];
  for (let i = 0; i < 420; i++) {
    ctx.save();
    ctx.translate(rand() * w, rand() * h);
    ctx.rotate(rand() * Math.PI);
    ctx.fillStyle = cols[Math.floor(rand() * cols.length)];
    ctx.beginPath();
    ctx.roundRect(-7, -2.5, 14, 5, 2.5);
    ctx.fill();
    ctx.restore();
  }

  // Title with a chocolate outline so it reads on the bright floor.
  const [cx, cy] = p(0, 14.5);
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `900 ${w * 0.1}px "Noto Sans TC", "PingFang TC", "Microsoft JhengHei", sans-serif`;
  ctx.lineWidth = 12;
  ctx.strokeStyle = '#7a3b2e';
  ctx.strokeText(level.name, cx, cy);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(level.name, cx, cy);
  ctx.font = `700 ${w * 0.045}px "Orbitron", "Arial Black", sans-serif`;
  ctx.fillStyle = t.floorAccent;
  ctx.fillText(level.subtitle.split('').join(' '), cx, cy + w * 0.085);
  ctx.restore();
};

const space: Painter = (ctx, w, h, level, rand) => {
  const t = level.theme;
  ctx.fillStyle = t.floorBase;
  ctx.fillRect(0, 0, w, h);

  // Nebula clouds.
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const nebula = ['rgba(138,92,255,', 'rgba(61,232,255,', 'rgba(255,92,200,'];
  for (let i = 0; i < 26; i++) {
    const x = rand() * w;
    const y = rand() * h;
    const r = w * (0.12 + rand() * 0.3);
    const ng = ctx.createRadialGradient(x, y, 0, x, y, r);
    const c = nebula[i % nebula.length];
    ng.addColorStop(0, c + (0.1 + rand() * 0.12) + ')');
    ng.addColorStop(1, c + '0)');
    ctx.fillStyle = ng;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  ctx.restore();

  // Stars.
  for (let i = 0; i < 900; i++) {
    const s = rand() < 0.94 ? 1 + rand() * 1.5 : 2.5 + rand() * 2;
    ctx.fillStyle = `rgba(255,255,255,${0.4 + rand() * 0.6})`;
    ctx.fillRect(rand() * w, rand() * h, s, s);
  }

  const p = px(w, h);
  // Ringed planet.
  const [plx, ply] = p(-5.6, 9.8);
  const pr = w * 0.09;
  ctx.save();
  const pg = ctx.createRadialGradient(plx - pr * 0.4, ply - pr * 0.4, pr * 0.1, plx, ply, pr);
  pg.addColorStop(0, '#ffd6a0');
  pg.addColorStop(0.6, '#e0743a');
  pg.addColorStop(1, '#4a1a10');
  ctx.fillStyle = pg;
  ctx.beginPath();
  ctx.arc(plx, ply, pr, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,220,170,0.6)';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.ellipse(plx, ply, pr * 1.8, pr * 0.45, -0.35, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  // Spiral galaxy around the top saucer.
  const [gx, gy] = p(0.9, 33);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let arm = 0; arm < 2; arm++) {
    for (let i = 0; i < 260; i++) {
      const u = i / 260;
      const a = arm * Math.PI + u * Math.PI * 3;
      const r = 10 + u * w * 0.17;
      const x = gx + Math.cos(a) * r + (rand() - 0.5) * 10;
      const y = gy + Math.sin(a) * r * 0.75 + (rand() - 0.5) * 10;
      ctx.fillStyle = `rgba(${150 + rand() * 100},${160 + rand() * 90},255,${0.5 * (1 - u)})`;
      ctx.fillRect(x, y, 2.5, 2.5);
    }
  }
  const core = ctx.createRadialGradient(gx, gy, 0, gx, gy, w * 0.07);
  core.addColorStop(0, 'rgba(255,240,255,0.55)');
  core.addColorStop(1, 'rgba(138,92,255,0)');
  ctx.fillStyle = core;
  ctx.fillRect(gx - w * 0.07, gy - w * 0.07, w * 0.14, w * 0.14);
  ctx.restore();

  // Constellation lines.
  ctx.save();
  ctx.strokeStyle = 'rgba(61,232,255,0.35)';
  ctx.fillStyle = t.floorAccent2;
  ctx.lineWidth = 1.5;
  const [sx, sy] = p(5.5, 16);
  let x = sx;
  let y = sy;
  ctx.beginPath();
  ctx.moveTo(x, y);
  for (let i = 0; i < 6; i++) {
    x += (rand() - 0.3) * 60;
    y -= 20 + rand() * 40;
    ctx.lineTo(x, y);
    ctx.fillRect(x - 3, y - 3, 6, 6);
  }
  ctx.stroke();
  ctx.restore();

  title(ctx, w, h, level, '#f0ecff', t.floorAccent);
};

const PAINTERS: Record<LevelDef['theme']['floorStyle'], Painter> = { neon, ocean, lava, nightmarket, candy, space };

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
