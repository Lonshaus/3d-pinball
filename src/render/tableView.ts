import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Game } from '../game/game';
import type { DeckDef, Theme } from '../levels/levels';
import { BALL_RADIUS, type Ball, type Collider, type Flipper, type Vec2 } from '../physics/world';
import {
  ARC_CENTER,
  ARC_RADIUS,
  BALL_START,
  FIELD_LEFT,
  FIELD_RIGHT,
  FLIPPER_PIVOT,
  guideLine,
  LANE_RIGHT,
  LANE_Y0,
  WALL_R,
  type KickbackEl,
  type RampEl,
  type SaucerEl,
  type SpinnerEl,
} from '../table/layout';
import { FLOOR_BOUNDS, makeFloorTexture, makeGlowTexture } from './textures';

export const TABLE_TILT = THREE.MathUtils.degToRad(6.5);
/** Table point used as the centre of the 3D group. */
export const TABLE_CENTER: Vec2 = { x: 0.8, y: 20.5 };
const WALL_H = 1.0;

/** 2D table coords -> local 3D coords of the playfield group. */
export function p3(x: number, y: number, h = 0) {
  return new THREE.Vector3(x, h, -y);
}

function capsuleShape(a: Vec2, b: Vec2, ra: number, rb: number, seg = 10) {
  const shape = new THREE.Shape();
  const ang = Math.atan2(b.y - a.y, b.x - a.x);
  if (Math.hypot(b.x - a.x, b.y - a.y) < 1e-6) {
    shape.absarc(a.x, a.y, ra, 0, Math.PI * 2, false);
    return shape;
  }
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= seg; i++) {
    const t = ang - Math.PI / 2 + (Math.PI * i) / seg;
    pts.push(new THREE.Vector2(b.x + Math.cos(t) * rb, b.y + Math.sin(t) * rb));
  }
  for (let i = 0; i <= seg; i++) {
    const t = ang + Math.PI / 2 + (Math.PI * i) / seg;
    pts.push(new THREE.Vector2(a.x + Math.cos(t) * ra, a.y + Math.sin(t) * ra));
  }
  shape.setFromPoints(pts);
  return shape;
}

/** Extrude a 2D table-space shape upward from height h0 to h1. */
function extrude(shape: THREE.Shape, h0: number, h1: number, curveSegments = 12) {
  const g = new THREE.ExtrudeGeometry(shape, { depth: h1 - h0, bevelEnabled: false, curveSegments });
  g.rotateX(-Math.PI / 2);
  g.translate(0, h0, 0);
  return g;
}

function std(color: number, opts: THREE.MeshStandardMaterialParameters = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.2, ...opts });
}

/** Global scale for every emissive (glowing) part of the table. */
const GLOW = 0.5;

function glow(color: number, intensity = 1.5, opts: THREE.MeshStandardMaterialParameters = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: intensity * GLOW,
    roughness: 0.35,
    metalness: 0,
    ...opts,
  });
}

/** A camera-facing text label (used to name holes and decks). */
function label(text: string, color: number, scale = 1) {
  const canvas = document.createElement('canvas');
  const fs = 64;
  const ctx = canvas.getContext('2d')!;
  ctx.font = `900 ${fs}px "Noto Sans TC", "PingFang TC", "Microsoft JhengHei", sans-serif`;
  canvas.width = Math.ceil(ctx.measureText(text).width + fs);
  canvas.height = fs * 1.5;
  ctx.font = `900 ${fs}px "Noto Sans TC", "PingFang TC", "Microsoft JhengHei", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const hex = '#' + color.toString(16).padStart(6, '0');
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.beginPath();
  ctx.roundRect(4, 4, canvas.width - 8, canvas.height - 8, fs * 0.4);
  ctx.fill();
  ctx.strokeStyle = hex;
  ctx.lineWidth = 5;
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = hex;
  ctx.shadowBlur = 16;
  ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 2);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  // Drawn on top of everything so ramps never hide a label.
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false }));
  sprite.renderOrder = 10;
  const h = 1.35 * scale;
  sprite.scale.set((h * canvas.width) / canvas.height, h, 1);
  return sprite;
}

/** Triangle strip between two equally long rows of points. */
function ribbon(a: THREE.Vector3[], b: THREE.Vector3[]) {
  const pos: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i < a.length; i++) pos.push(a[i].x, a[i].y, a[i].z, b[i].x, b[i].y, b[i].z);
  for (let i = 0; i < a.length - 1; i++) {
    const k = i * 2;
    idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

interface BallVisual {
  mesh: THREE.Mesh;
  trail: THREE.Points;
  trailPos: Float32Array;
}

interface Flashable {
  mat: THREE.MeshStandardMaterial;
  base: number;
  boost: number;
  get: () => number;
  mesh?: THREE.Object3D;
}

export class TableView {
  readonly root = new THREE.Group();
  readonly field = new THREE.Group();
  private flippers: { obj: THREE.Object3D; flipper: Flipper }[] = [];
  private flashables: Flashable[] = [];
  private targets: { obj: THREE.Object3D; drop: () => number; base: number }[] = [];
  private laneLights: { mat: THREE.MeshStandardMaterial; lit: () => boolean }[] = [];
  private spinners: { pivot: THREE.Object3D; el: SpinnerEl }[] = [];
  private spinning: { obj: THREE.Object3D; speed: number }[] = [];
  private locks: { mat: THREE.MeshStandardMaterial; el: SaucerEl }[] = [];
  private beams: { obj: THREE.Mesh; el: SaucerEl }[] = [];
  private kickback?: { head: THREE.Object3D; mat: THREE.MeshStandardMaterial; el: KickbackEl; y: number };
  private plunger: THREE.Object3D;
  private balls = new Map<Ball, BallVisual>();
  private ballGeo = new THREE.SphereGeometry(BALL_RADIUS, 40, 24);
  private ballMat = new THREE.MeshStandardMaterial({ color: 0xf2f4f8, metalness: 1, roughness: 0.08 });
  private haloMat = new THREE.SpriteMaterial({ map: makeGlowTexture(), color: 0xffffff, transparent: true, opacity: 0.3, depthWrite: false, blending: THREE.AdditiveBlending });
  private disposables: { dispose(): void }[] = [];

  constructor(
    private readonly game: Game,
    maxAniso: number,
  ) {
    const theme = game.level.theme;
    const t = game.table;
    this.root.rotation.x = TABLE_TILT;
    this.root.add(this.field);
    this.field.position.set(-TABLE_CENTER.x, 0, TABLE_CENTER.y);

    this.buildFloor(theme, maxAniso);
    this.buildCabinet(theme);
    this.buildWalls(t.walls.filter((w) => w.tag !== 'ramp' && !w.layer), theme);
    this.buildPosts(t.posts, theme);

    const heightOf = (layer: number) => game.level.decks.find((d) => d.layer === layer)?.height ?? 0;
    t.bumpers.forEach((b) => this.buildBumper(b.pos, b.r, heightOf(b.layer), theme, () => b.flash));
    t.slings.forEach((s) => this.buildSling(s.tri, s.kicker, theme, () => s.flash));
    t.banks.forEach((bank) => bank.targets.forEach((tg) => this.buildTarget(tg.center, tg.dir, heightOf(bank.layer), theme, () => tg.drop)));
    t.saucers.forEach((s) => this.buildSaucer(s, theme));
    t.lanes.forEach((l) => this.buildLaneLight(l.x, theme, () => l.lit));
    [t.left, t.right].forEach((f) => this.buildFlipper(f, 0, theme));
    t.decks.forEach((d) => this.buildDeck(d.def, d.walls, theme));
    t.decks.forEach((d) => this.buildFlipper(d.flipper, d.def.height, theme));
    t.ramps.forEach((r) => this.buildRamp(r, theme));
    t.spinners.forEach((sp) => this.buildSpinner(sp, theme));
    if (t.kickback) this.buildKickback(t.kickback, theme);

    // Gate.
    const gate = new THREE.Mesh(extrude(capsuleShape({ x: t.gate.ax, y: t.gate.ay }, { x: t.gate.bx, y: t.gate.by }, 0.08, 0.08), 0.5, 0.75), std(0xc0c4cc, { metalness: 0.9, roughness: 0.25 }));
    this.field.add(gate);

    // Plunger.
    const rodMat = std(0xd0d4dc, { metalness: 1, roughness: 0.2 });
    this.plunger = new THREE.Group();
    const head = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.35, 20), glow(theme.accent, 1.2));
    head.rotation.x = Math.PI / 2;
    head.position.z = 0.175;
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 2.2, 10), rodMat);
    rod.rotation.x = Math.PI / 2;
    rod.position.z = 1.4;
    this.plunger.add(head, rod);
    this.field.add(this.plunger);

    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh || (o as THREE.Points).isPoints || (o as THREE.Sprite).isSprite) {
        this.disposables.push(m.geometry);
        const mats = Array.isArray(m.material) ? m.material : [m.material];
        for (const mat of mats) {
          this.disposables.push(mat);
          const map = (mat as THREE.MeshStandardMaterial).map;
          if (map) this.disposables.push(map);
        }
      }
    });
    this.disposables.push(this.ballGeo, this.ballMat, this.haloMat, this.haloMat.map!);
  }

  /** Shared ball material (the stage points its reflections at the environment). */
  get ballMaterial() {
    return this.ballMat;
  }

  /** Converts a table position to world space (accounts for tilt). */
  toWorld(x: number, y: number, h = 0.5, target = new THREE.Vector3()) {
    target.set(x, h, -y);
    return this.field.localToWorld(target);
  }

  private buildFloor(theme: Theme, maxAniso: number) {
    const { x0, x1, y0, y1 } = FLOOR_BOUNDS;
    const tex = makeFloorTexture(this.game.level, maxAniso);
    const geo = new THREE.PlaneGeometry(x1 - x0, y1 - y0);
    geo.rotateX(-Math.PI / 2);
    const floor = new THREE.Mesh(
      geo,
      new THREE.MeshStandardMaterial({
        map: tex,
        emissive: 0xffffff,
        emissiveMap: tex,
        emissiveIntensity: theme.floorGlow ?? 0.14,
        roughness: 0.32,
        metalness: 0.15,
      }),
    );
    floor.position.copy(p3((x0 + x1) / 2, (y0 + y1) / 2, 0));
    floor.receiveShadow = true;
    this.field.add(floor);

    // Underside so the cabinet doesn't look hollow from low angles.
    const under = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0 + 1.6, 1.2, y1 - y0 + 1.2), std(theme.rail, { roughness: 0.7 }));
    under.position.copy(p3((x0 + x1) / 2, (y0 + y1) / 2, -0.62));
    this.field.add(under);
  }

  private buildCabinet(theme: Theme) {
    const railMat = std(theme.rail, { metalness: 0.5, roughness: 0.35 });
    const trimMat = glow(theme.wallEmissive, 1.1);
    const { y0, y1 } = FLOOR_BOUNDS;
    const geos: THREE.BufferGeometry[] = [];
    const trims: THREE.BufferGeometry[] = [];

    // Side rails.
    const side = (xa: number, xb: number) => {
      const s = new THREE.Shape();
      s.moveTo(xa, y0 - 0.6);
      s.lineTo(xb, y0 - 0.6);
      s.lineTo(xb, ARC_CENTER.y);
      s.lineTo(xa, ARC_CENTER.y);
      s.closePath();
      geos.push(extrude(s, -0.2, 1.6));
    };
    side(FIELD_LEFT - 0.95, FIELD_LEFT - WALL_R);
    side(LANE_RIGHT + WALL_R, LANE_RIGHT + 0.95);

    // Top cap following the arc.
    const top = new THREE.Shape();
    top.moveTo(FIELD_LEFT - 0.95, ARC_CENTER.y);
    top.lineTo(FIELD_LEFT - WALL_R, ARC_CENTER.y);
    top.absarc(ARC_CENTER.x, ARC_CENTER.y, ARC_RADIUS + WALL_R, Math.PI, 0, true);
    top.lineTo(LANE_RIGHT + 0.95, ARC_CENTER.y);
    top.lineTo(LANE_RIGHT + 0.95, y1 + 0.6);
    top.lineTo(FIELD_LEFT - 0.95, y1 + 0.6);
    top.closePath();
    geos.push(extrude(top, -0.2, 1.6, 48));

    // Glowing trim along the rail tops.
    for (const x of [FIELD_LEFT - 0.55, LANE_RIGHT + 0.55]) {
      trims.push(extrude(capsuleShape({ x, y: y0 - 0.4 }, { x, y: ARC_CENTER.y }, 0.08, 0.08), 1.6, 1.66));
    }
    const arcTrim = new THREE.Shape();
    arcTrim.absarc(ARC_CENTER.x, ARC_CENTER.y, ARC_RADIUS + 0.63, 0, Math.PI, false);
    arcTrim.absarc(ARC_CENTER.x, ARC_CENTER.y, ARC_RADIUS + 0.47, Math.PI, 0, true);
    trims.push(extrude(arcTrim, 1.6, 1.66, 64));

    // Bottom apron and the dead zones under the inlane guides.
    const outlane = this.game.level.difficulty.outlane;
    const [la, lb] = guideLine(false, outlane);
    const [ra, rb] = guideLine(true, outlane);
    const apron = new THREE.Shape();
    apron.moveTo(FIELD_LEFT - WALL_R, la.y);
    apron.lineTo(lb.x, lb.y);
    apron.lineTo(-FLIPPER_PIVOT.x, FLIPPER_PIVOT.y);
    apron.lineTo(-FLIPPER_PIVOT.x, 1.0);
    apron.lineTo(FLIPPER_PIVOT.x, 1.0);
    apron.lineTo(FLIPPER_PIVOT.x, FLIPPER_PIVOT.y);
    apron.lineTo(rb.x, rb.y);
    apron.lineTo(FIELD_RIGHT, ra.y);
    apron.lineTo(FIELD_RIGHT, y0 - 0.6);
    apron.lineTo(FIELD_LEFT - WALL_R, y0 - 0.6);
    apron.closePath();
    const apronGeo = extrude(apron, -0.1, 0.55);
    const apronMesh = new THREE.Mesh(apronGeo, std(theme.wall, { metalness: 0.4, roughness: 0.4 }));
    apronMesh.receiveShadow = true;
    this.field.add(apronMesh);

    // Lane bottom block.
    const laneBlock = new THREE.Shape();
    laneBlock.moveTo(FIELD_RIGHT, y0 - 0.6);
    laneBlock.lineTo(LANE_RIGHT + WALL_R, y0 - 0.6);
    laneBlock.lineTo(LANE_RIGHT + WALL_R, 0.3);
    laneBlock.lineTo(FIELD_RIGHT, 0.3);
    laneBlock.closePath();
    geos.push(extrude(laneBlock, -0.1, 0.9));

    const rails = new THREE.Mesh(mergeGeometries(geos), railMat);
    rails.receiveShadow = true;
    this.field.add(rails);
    this.field.add(new THREE.Mesh(mergeGeometries(trims), trimMat));
    geos.forEach((g) => g.dispose());
    trims.forEach((g) => g.dispose());
  }

  private buildWalls(walls: Collider[], theme: Theme) {
    const body: THREE.BufferGeometry[] = [];
    const strip: THREE.BufferGeometry[] = [];
    for (const w of walls) {
      const a = { x: w.ax, y: w.ay };
      const b = { x: w.bx, y: w.by };
      body.push(extrude(capsuleShape(a, b, w.ra, w.rb, 6), 0, WALL_H));
      strip.push(extrude(capsuleShape(a, b, w.ra * 0.55, w.rb * 0.55, 4), WALL_H, WALL_H + 0.06));
    }
    const m = new THREE.Mesh(mergeGeometries(body), std(theme.wall, { metalness: 0.6, roughness: 0.3 }));
    m.castShadow = true;
    m.receiveShadow = true;
    this.field.add(m);
    this.field.add(new THREE.Mesh(mergeGeometries(strip), glow(theme.wallEmissive, 1.2)));
    body.forEach((g) => g.dispose());
    strip.forEach((g) => g.dispose());
  }

  private buildPosts(posts: Collider[], theme: Theme) {
    const body: THREE.BufferGeometry[] = [];
    const rubber: THREE.BufferGeometry[] = [];
    for (const p of posts) {
      const a = { x: p.ax, y: p.ay };
      const b = { x: p.bx, y: p.by };
      rubber.push(extrude(capsuleShape(a, b, p.ra, p.rb, 8), 0.2, 0.55));
      body.push(extrude(capsuleShape(a, b, p.ra * 0.6, p.rb * 0.6, 8), 0, 1.0));
    }
    this.field.add(new THREE.Mesh(mergeGeometries(body), std(0xd8dce4, { metalness: 0.9, roughness: 0.2 })));
    const rm = new THREE.Mesh(mergeGeometries(rubber), glow(theme.accent2, 1.2));
    rm.castShadow = true;
    this.field.add(rm);
  }

  private buildBumper(pos: Vec2, r: number, h: number, theme: Theme, flash: () => number) {
    const g = new THREE.Group();
    g.position.copy(p3(pos.x, pos.y, h));
    const base = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.1, r * 1.15, 0.2, 32), std(0x111111, { metalness: 0.8 }));
    base.position.y = 0.1;
    const skirt = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.92, r, 0.55, 32), std(theme.bumperBody, { metalness: 0.3, roughness: 0.25 }));
    skirt.position.y = 0.45;
    const ringMat = glow(theme.accent2, 1.5);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r * 0.98, 0.08, 10, 40), ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.28;
    const capMat = glow(theme.bumperCap, 1.0, { transparent: true, opacity: 0.95 });
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.78, r * 0.92, 0.32, 32), capMat);
    cap.position.y = 0.88;
    const top = new THREE.Mesh(new THREE.SphereGeometry(r * 0.35, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), std(0xffffff, { metalness: 0.9, roughness: 0.15 }));
    top.position.y = 1.04;
    g.add(base, skirt, ring, cap, top);
    [base, skirt, cap].forEach((m) => (m.castShadow = true));
    this.field.add(g);
    this.flashables.push({ mat: capMat, base: 1.0, boost: 5, get: flash, mesh: cap });
    this.flashables.push({ mat: ringMat, base: 1.5, boost: 4, get: flash });
  }

  private buildSling(tri: Vec2[], kicker: Collider, theme: Theme, flash: () => number) {
    const s = new THREE.Shape(tri.map((p) => new THREE.Vector2(p.x, p.y)));
    const body = new THREE.Mesh(extrude(s, 0, 0.75), std(theme.wall, { metalness: 0.5, roughness: 0.35 }));
    body.castShadow = true;
    this.field.add(body);
    const top = new THREE.Mesh(extrude(s, 0.75, 0.8), glow(theme.sling, 0.4, { transparent: true, opacity: 0.85 }));
    this.field.add(top);
    const mat = glow(theme.sling, 1.4);
    const rubber = new THREE.Mesh(
      extrude(capsuleShape({ x: kicker.ax, y: kicker.ay }, { x: kicker.bx, y: kicker.by }, 0.2, 0.2), 0.15, 0.6),
      mat,
    );
    this.field.add(rubber);
    this.flashables.push({ mat, base: 1.4, boost: 5, get: flash });
    this.flashables.push({ mat: top.material as THREE.MeshStandardMaterial, base: 0.4, boost: 3, get: flash });
  }

  private buildTarget(c: Vec2, dir: Vec2, h: number, theme: Theme, drop: () => number) {
    const g = new THREE.Group();
    g.position.copy(p3(c.x, c.y, h));
    g.rotation.y = Math.atan2(dir.y, dir.x);
    const face = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.75, 0.28), glow(theme.target, 1.1, { metalness: 0.2 }));
    face.position.y = 0.4;
    face.castShadow = true;
    g.add(face);
    // Slot in the floor the target drops into.
    const slot = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.4), new THREE.MeshBasicMaterial({ color: 0x000000 }));
    slot.rotation.x = -Math.PI / 2;
    slot.position.y = 0.012;
    g.add(slot);
    this.field.add(g);
    this.targets.push({ obj: face, drop, base: 0.4 });
  }

  private buildSaucer(el: SaucerEl, theme: Theme) {
    const def = el.def;
    const g = new THREE.Group();
    g.position.copy(p3(def.pos.x, def.pos.y));
    const hole = new THREE.Mesh(new THREE.CircleGeometry(0.62, 32), new THREE.MeshBasicMaterial({ color: 0x000000 }));
    hole.rotation.x = -Math.PI / 2;
    hole.position.y = 0.015;
    const color = def.lock ? theme.target : def.exits ? theme.accent2 : def.hold ? theme.bumperCap : theme.accent;
    const mat = glow(color, 1.2);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.09, 10, 40), mat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.06;
    const halo = new THREE.Mesh(new THREE.RingGeometry(0.85, 1.25, 40), glow(color, 0.6, { transparent: true, opacity: 0.35, depthWrite: false }));
    halo.rotation.x = -Math.PI / 2;
    halo.position.y = 0.02;
    g.add(hole, ring, halo);
    this.flashables.push({ mat, base: 1.2, boost: 5, get: () => el.flash });

    if (def.exit) {
      // Tunnel: a cave arch over the hole, opening toward the player.
      const cave = new THREE.Mesh(
        new THREE.CylinderGeometry(1.0, 1.15, 1.4, 20, 1, true, -Math.PI / 2, Math.PI),
        std(theme.wall, { side: THREE.DoubleSide, roughness: 0.9, metalness: 0.1, flatShading: true }),
      );
      cave.rotation.z = Math.PI / 2;
      cave.rotation.y = Math.PI / 2;
      cave.position.set(0, 0.05, -0.2);
      cave.castShadow = true;
      const mouth = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.1, 8, 20, Math.PI), glow(color, 1.4));
      mouth.position.set(0, 0.05, 0.5);
      g.add(cave, mouth);
      this.buildExitMarker(def.exit.pos, color);
    }
    if (def.exits) {
      // Teleporter: two tilted rings spinning in opposite directions.
      for (const [i, tilt] of [0.5, -0.5].entries()) {
        const r = new THREE.Mesh(new THREE.TorusGeometry(0.85 - i * 0.15, 0.05, 8, 40), glow(color, 2));
        r.position.y = 0.7;
        r.rotation.x = Math.PI / 2 + tilt;
        const holder = new THREE.Group();
        holder.add(r);
        g.add(holder);
        this.spinning.push({ obj: holder, speed: i ? -2.4 : 1.8 });
      }
      for (const e of def.exits) this.buildExitMarker(e.pos, color);
    }
    if (def.lock) {
      // Lock: a little cage; its light comes on while a ball is parked inside.
      const barMat = std(0xd0d4dc, { metalness: 1, roughness: 0.2 });
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        if (Math.sin(a) > 0.6) continue; // leave the front open
        const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.9, 6), barMat);
        bar.position.set(Math.cos(a) * 0.8, 0.45, Math.sin(a) * 0.8);
        g.add(bar);
      }
      const lamp = glow(color, 0.3);
      const top = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.07, 8, 30), lamp);
      top.rotation.x = Math.PI / 2;
      top.position.y = 0.92;
      g.add(top);
      this.locks.push({ mat: lamp, el });
    }
    if (def.hold) {
      // Bonus hole: a column of light while it holds the ball.
      const beam = new THREE.Mesh(
        new THREE.CylinderGeometry(0.55, 0.65, 3, 20, 1, true),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
      );
      beam.position.y = 1.5;
      g.add(beam);
      this.beams.push({ obj: beam, el });
    }
    const tag = label(def.name, color, 0.9);
    tag.position.y = def.exit ? 2.0 : 1.7;
    g.add(tag);
    this.field.add(g);
  }

  private buildExitMarker(pos: Vec2, color: number) {
    const g = new THREE.Group();
    g.position.copy(p3(pos.x, pos.y));
    const hole = new THREE.Mesh(new THREE.CircleGeometry(0.5, 24), new THREE.MeshBasicMaterial({ color: 0x000000 }));
    hole.rotation.x = -Math.PI / 2;
    hole.position.y = 0.014;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.56, 0.06, 8, 30), glow(color, 1.0));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.05;
    g.add(hole, ring);
    this.field.add(g);
  }

  private buildRamp(r: RampEl, theme: Theme) {
    const def = r.def;
    const color = def.layer >= 2 ? theme.accent2 : theme.accent;
    const half = def.width / 2;
    const off = half + WALL_R;
    const at = (rail: Vec2[], i: number, k: number, dh: number) => {
      const c = def.points[i];
      return p3(c.x + (rail[i].x - c.x) * k, c.y + (rail[i].y - c.y) * k, def.heights[i] + dh);
    };
    const n = def.points.length;
    const idx = [...Array(n).keys()];
    const inner = half / off;
    const floorTop = [idx.map((i) => at(r.rails[0], i, inner, 0)), idx.map((i) => at(r.rails[1], i, inner, 0))];
    const floorMat = glow(color, 0.25, { transparent: true, opacity: 0.72, side: THREE.DoubleSide, roughness: 0.2, metalness: 0.1 });
    const floor = new THREE.Mesh(ribbon(floorTop[0], floorTop[1]), floorMat);
    floor.castShadow = true;
    floor.receiveShadow = true;
    this.field.add(floor);
    this.flashables.push({ mat: floorMat, base: 0.25, boost: 2.5, get: () => r.flash });
    // Underside so the ramp has some thickness.
    const under = new THREE.Mesh(
      ribbon(idx.map((i) => at(r.rails[0], i, inner, -0.12)), idx.map((i) => at(r.rails[1], i, inner, -0.12))),
      std(theme.rail, { side: THREE.DoubleSide }),
    );
    this.field.add(under);
    // Clear side walls and a metal rail along the top of each.
    const wallMat = new THREE.MeshStandardMaterial({ color, transparent: true, opacity: 0.3, side: THREE.DoubleSide, roughness: 0.1, depthWrite: false });
    const railMat = std(0xd8dce4, { metalness: 1, roughness: 0.2 });
    for (const rail of r.rails) {
      const lo = idx.map((i) => at(rail, i, 1, -0.12));
      const hi = idx.map((i) => at(rail, i, 1, 0.6));
      this.field.add(new THREE.Mesh(ribbon(lo, hi), wallMat));
      const curve = new THREE.CatmullRomCurve3(hi, false, 'centripetal');
      this.field.add(new THREE.Mesh(new THREE.TubeGeometry(curve, n * 8, 0.07, 6, false), railMat));
    }
    // Support pillars wherever the ramp is high.
    const pillarMat = std(theme.rail, { metalness: 0.7, roughness: 0.3 });
    for (let i = 1; i < n; i++) {
      const h = def.heights[i];
      if (h < 1.2 || i % 2 === 1) continue;
      for (const rail of r.rails) {
        const p = rail[i];
        const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, h, 8), pillarMat);
        pillar.position.copy(p3(p.x, p.y, h / 2 - 0.1));
        this.field.add(pillar);
      }
    }
    if (!r.fromDeck) {
      const tag = label(def.name, color, 0.85);
      const m = def.points[Math.min(2, n - 1)];
      tag.position.copy(p3(m.x, m.y, def.heights[Math.min(2, n - 1)] + 1.3));
      this.field.add(tag);
    }
  }

  private buildDeck(def: DeckDef, walls: Collider[], theme: Theme) {
    const h = def.height;
    const shape = new THREE.Shape(def.polygon.map((p) => new THREE.Vector2(p.x, p.y)));
    const slabMat = std(theme.rail, { metalness: 0.3, roughness: 0.5 });
    const slab = new THREE.Mesh(extrude(shape, h - 0.25, h), slabMat);
    slab.receiveShadow = true;
    slab.castShadow = true;
    this.field.add(slab);
    // Glowing top surface just above the slab.
    const top = new THREE.Mesh(extrude(shape, h, h + 0.01), glow(theme.accent, 0.12, { transparent: true, opacity: 0.85 }));
    top.receiveShadow = true;
    this.field.add(top);
    const pillarMat = std(0xd8dce4, { metalness: 0.9, roughness: 0.25 });
    for (const p of def.polygon) {
      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, h, 10), pillarMat);
      pillar.position.copy(p3(p.x, p.y, h / 2));
      this.field.add(pillar);
    }
    const body: THREE.BufferGeometry[] = [];
    const strip: THREE.BufferGeometry[] = [];
    for (const w of walls) {
      const a = { x: w.ax, y: w.ay };
      const b = { x: w.bx, y: w.by };
      body.push(extrude(capsuleShape(a, b, w.ra, w.rb, 6), h, h + 0.9));
      strip.push(extrude(capsuleShape(a, b, w.ra * 0.55, w.rb * 0.55, 4), h + 0.9, h + 0.96));
    }
    const wm = new THREE.Mesh(mergeGeometries(body), std(theme.wall, { metalness: 0.6, roughness: 0.3 }));
    wm.castShadow = true;
    this.field.add(wm);
    this.field.add(new THREE.Mesh(mergeGeometries(strip), glow(theme.wallEmissive, 1.4)));
    body.forEach((g) => g.dispose());
    strip.forEach((g) => g.dispose());
    const c = def.polygon.reduce((acc, p) => ({ x: acc.x + p.x / def.polygon.length, y: acc.y + p.y / def.polygon.length }), { x: 0, y: 0 });
    const tag = label(def.name, theme.accent, 1.1);
    tag.position.copy(p3(c.x, c.y + 3.2, h + 1.6));
    this.field.add(tag);
  }

  private buildSpinner(el: SpinnerEl, theme: Theme) {
    const def = el.def;
    const g = new THREE.Group();
    g.position.copy(p3(def.pos.x, def.pos.y));
    g.rotation.y = def.angle;
    const postMat = std(0xd8dce4, { metalness: 1, roughness: 0.2 });
    for (const z of [-def.width / 2, def.width / 2]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.15, 8), postMat);
      post.position.set(0, 0.57, z);
      g.add(post);
    }
    const pivot = new THREE.Group();
    pivot.position.y = 1.05;
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.7, def.width - 0.15), glow(theme.accent2, 1.3, { metalness: 0.6 }));
    plate.position.y = -0.38;
    plate.castShadow = true;
    pivot.add(plate);
    g.add(pivot);
    this.field.add(g);
    this.spinners.push({ pivot, el });
  }

  private buildKickback(el: KickbackEl, theme: Theme) {
    // The sensor sits under the apron, so the visible kicker and its lamp go at the top of the outlane.
    const x = (el.x0 + el.x1) / 2;
    const mat = glow(theme.accent2, 1.5);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.35, 0.3), mat);
    const y = el.y1 + 0.5;
    head.position.copy(p3(x, y, 0.75));
    this.field.add(head);
    const arrow = new THREE.Shape();
    arrow.moveTo(x, y + 2.2);
    arrow.lineTo(x + 0.45, y + 1.4);
    arrow.lineTo(x - 0.45, y + 1.4);
    arrow.closePath();
    this.field.add(new THREE.Mesh(extrude(arrow, 0.005, 0.04), mat));
    this.kickback = { head, mat, el, y };
  }

  private buildLaneLight(x: number, theme: Theme, lit: () => boolean) {
    const s = new THREE.Shape();
    // Arrow pointing up the table.
    s.moveTo(x, LANE_Y0 - 0.2);
    s.lineTo(x + 0.5, LANE_Y0 - 1.0);
    s.lineTo(x + 0.2, LANE_Y0 - 1.0);
    s.lineTo(x + 0.2, LANE_Y0 - 1.7);
    s.lineTo(x - 0.2, LANE_Y0 - 1.7);
    s.lineTo(x - 0.2, LANE_Y0 - 1.0);
    s.lineTo(x - 0.5, LANE_Y0 - 1.0);
    s.closePath();
    const mat = glow(theme.accent2, 0.3);
    const m = new THREE.Mesh(extrude(s, 0.005, 0.04), mat);
    this.field.add(m);
    this.laneLights.push({ mat, lit });
  }

  private buildFlipper(f: Flipper, h: number, theme: Theme) {
    const { pivot, length: len, baseRadius: r0, tipRadius: r1 } = f;
    const g = new THREE.Group();
    g.position.copy(p3(pivot.x, pivot.y, h));
    const shape = capsuleShape({ x: 0, y: 0 }, { x: len, y: 0 }, r0, r1, 12);
    const body = new THREE.Mesh(extrude(shape, 0.05, 0.6), std(0xf4f4f6, { metalness: 0.1, roughness: 0.3 }));
    body.castShadow = true;
    const band = new THREE.Mesh(extrude(capsuleShape({ x: 0, y: 0 }, { x: len, y: 0 }, r0 + 0.02, r1 + 0.02, 12), 0.22, 0.42), glow(theme.accent, 1.6));
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.1, 16), std(0x999999, { metalness: 1, roughness: 0.2 }));
    cap.position.y = 0.65;
    g.add(body, band, cap);
    this.field.add(g);
    this.flippers.push({ obj: g, flipper: f });
  }

  private makeBallVisual(theme: Theme): BallVisual {
    const mesh = new THREE.Mesh(this.ballGeo, this.ballMat);
    mesh.castShadow = true;
    // Soft halo so the ball stays easy to track on small screens.
    const halo = new THREE.Sprite(this.haloMat);
    halo.scale.setScalar(BALL_RADIUS * 4.5);
    mesh.add(halo);
    const n = 18;
    const trailPos = new Float32Array(n * 3);
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.BufferAttribute(trailPos, 3));
    const trail = new THREE.Points(
      tg,
      new THREE.PointsMaterial({ color: theme.accent2, size: 0.55, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    trail.frustumCulled = false;
    this.field.add(mesh, trail);
    return { mesh, trail, trailPos };
  }

  private syncBalls() {
    const live = new Set(this.game.balls);
    for (const [b, v] of this.balls) {
      if (live.has(b)) continue;
      v.mesh.removeFromParent();
      v.trail.removeFromParent();
      v.trail.geometry.dispose();
      (v.trail.material as THREE.Material).dispose();
      this.balls.delete(b);
    }
    for (const b of live) {
      if (this.balls.has(b)) continue;
      const v = this.makeBallVisual(this.game.level.theme);
      for (let i = 0; i < v.trailPos.length; i += 3) v.trailPos.set([b.x, b.z + BALL_RADIUS, -b.y], i);
      this.balls.set(b, v);
    }
  }

  update(time: number, dt: number) {
    const game = this.game;
    const t = game.table;
    this.syncBalls();
    for (const [b, v] of this.balls) {
      const y = b.z + BALL_RADIUS;
      v.mesh.visible = b.active && !b.hidden;
      v.mesh.position.copy(p3(b.x, b.y, y));
      // Trail: shift positions.
      const tp = v.trailPos;
      for (let i = tp.length - 3; i >= 3; i -= 3) {
        tp[i] = tp[i - 3];
        tp[i + 1] = tp[i - 2];
        tp[i + 2] = tp[i - 1];
      }
      tp.set([b.x, y, -b.y], 0);
      v.trail.geometry.attributes.position.needsUpdate = true;
      const speed = Math.hypot(b.vx, b.vy);
      (v.trail.material as THREE.PointsMaterial).opacity = v.mesh.visible && !b.held ? Math.min(0.5, speed / 120) : 0;
    }

    for (const f of this.flippers) f.obj.rotation.y = f.flipper.angle;

    for (const f of this.flashables) {
      const v = f.get();
      f.mat.emissiveIntensity = (f.base + f.boost * v) * GLOW;
      if (f.mesh) f.mesh.scale.setScalar(1 + v * 0.12);
    }
    for (const tg of this.targets) tg.obj.position.y = tg.base - tg.drop() * 0.85;
    for (const l of this.laneLights) {
      l.mat.emissiveIntensity = (l.lit() ? 2.6 + Math.sin(time * 8) * 0.6 : 0.25) * GLOW;
    }
    for (const sp of this.spinners) sp.pivot.rotation.z = sp.el.angle;
    for (const s of this.spinning) s.obj.rotation.y += s.speed * dt;
    for (const l of this.locks) l.mat.emissiveIntensity = (l.el.locked.length ? 2.5 + Math.sin(time * 10) * 1.2 : 0.3) * GLOW;
    for (const b of this.beams) {
      const on = b.el.ball && b.el.holdTimer > 0;
      const m = b.obj.material as THREE.MeshBasicMaterial;
      m.opacity += ((on ? 0.45 + Math.sin(time * 12) * 0.15 : 0) - m.opacity) * Math.min(1, dt * 8);
    }
    if (this.kickback) {
      const k = this.kickback;
      k.mat.emissiveIntensity = (k.el.lit ? 2.2 + Math.sin(time * 6) * 0.8 : 0.15) * GLOW;
      k.head.position.copy(p3((k.el.x0 + k.el.x1) / 2, k.y + k.el.fire * 1.2, 0.75));
    }

    const py = t.plunger.ay + WALL_R;
    this.plunger.position.copy(p3(BALL_START.x, py, 0.45));
  }

  dispose() {
    this.root.removeFromParent();
    for (const v of this.balls.values()) {
      v.trail.geometry.dispose();
      (v.trail.material as THREE.Material).dispose();
    }
    for (const d of this.disposables) d.dispose();
  }
}
