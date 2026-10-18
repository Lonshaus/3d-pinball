import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Game } from '../game/game';
import type { Theme } from '../levels/levels';
import { BALL_RADIUS, type Collider, type Vec2 } from '../physics/world';
import {
  ARC_CENTER,
  ARC_RADIUS,
  BALL_START,
  FIELD_LEFT,
  FIELD_RIGHT,
  LANE_RIGHT,
  LANE_Y0,
  WALL_R,
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

function glow(color: number, intensity = 1.5, opts: THREE.MeshStandardMaterialParameters = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: intensity,
    roughness: 0.35,
    metalness: 0,
    ...opts,
  });
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
  readonly ball: THREE.Mesh;
  private flippers: { obj: THREE.Object3D; left: boolean }[] = [];
  private flashables: Flashable[] = [];
  private targets: { obj: THREE.Object3D; drop: () => number }[] = [];
  private laneLights: { mat: THREE.MeshStandardMaterial; lit: () => boolean }[] = [];
  private plunger: THREE.Object3D;
  private trail: THREE.Points;
  private trailPos: Float32Array;
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
    this.buildWalls(t.walls, theme);
    this.buildPosts(t.posts, theme);

    t.bumpers.forEach((b) => this.buildBumper(b.pos, b.r, theme, () => b.flash));
    t.slings.forEach((s) => this.buildSling(s.tri, s.kicker, theme, () => s.flash));
    t.banks.forEach((bank) => bank.targets.forEach((tg) => this.buildTarget(tg.center, tg.dir, theme, () => tg.drop)));
    t.saucers.forEach((s) => this.buildSaucer(s.def.pos, theme, () => s.flash));
    t.lanes.forEach((l) => this.buildLaneLight(l.x, theme, () => l.lit));
    [t.left, t.right].forEach((f) => this.buildFlipper(f.pivot, f.length, f.baseRadius, f.tipRadius, f.isLeft, theme));

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

    // Ball.
    this.ball = new THREE.Mesh(
      new THREE.SphereGeometry(BALL_RADIUS, 40, 24),
      new THREE.MeshStandardMaterial({ color: 0xf2f4f8, metalness: 1, roughness: 0.08 }),
    );
    this.ball.castShadow = true;
    this.field.add(this.ball);
    // Soft halo so the ball stays easy to track on small screens.
    const halo = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: makeGlowTexture(), color: 0xffffff, transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    halo.scale.setScalar(BALL_RADIUS * 4.5);
    this.ball.add(halo);

    // Trail behind the ball.
    const n = 18;
    this.trailPos = new Float32Array(n * 3);
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.BufferAttribute(this.trailPos, 3));
    this.trail = new THREE.Points(
      tg,
      new THREE.PointsMaterial({ color: theme.accent2, size: 0.55, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    this.trail.frustumCulled = false;
    this.field.add(this.trail);
    this.resetTrail();

    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh || (o as THREE.Points).isPoints) {
        this.disposables.push(m.geometry);
        const mats = Array.isArray(m.material) ? m.material : [m.material];
        for (const mat of mats) {
          this.disposables.push(mat);
          const map = (mat as THREE.MeshStandardMaterial).map;
          if (map) this.disposables.push(map);
        }
      }
    });
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
        emissiveIntensity: 0.22,
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
    const apron = new THREE.Shape();
    apron.moveTo(FIELD_LEFT - WALL_R, 10);
    apron.lineTo(-3.9, 5.2);
    apron.lineTo(-3.9, 1.0);
    apron.lineTo(3.9, 1.0);
    apron.lineTo(3.9, 5.2);
    apron.lineTo(FIELD_RIGHT, 10);
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

  private buildBumper(pos: Vec2, r: number, theme: Theme, flash: () => number) {
    const g = new THREE.Group();
    g.position.copy(p3(pos.x, pos.y));
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

  private buildTarget(c: Vec2, dir: Vec2, theme: Theme, drop: () => number) {
    const g = new THREE.Group();
    g.position.copy(p3(c.x, c.y));
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
    this.targets.push({ obj: face, drop });
  }

  private buildSaucer(pos: Vec2, theme: Theme, flash: () => number) {
    const g = new THREE.Group();
    g.position.copy(p3(pos.x, pos.y));
    const hole = new THREE.Mesh(new THREE.CircleGeometry(0.62, 32), new THREE.MeshBasicMaterial({ color: 0x000000 }));
    hole.rotation.x = -Math.PI / 2;
    hole.position.y = 0.015;
    const mat = glow(theme.accent, 1.2);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.09, 10, 40), mat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.06;
    const halo = new THREE.Mesh(new THREE.RingGeometry(0.85, 1.25, 40), glow(theme.accent, 0.6, { transparent: true, opacity: 0.35, depthWrite: false }));
    halo.rotation.x = -Math.PI / 2;
    halo.position.y = 0.02;
    g.add(hole, ring, halo);
    this.field.add(g);
    this.flashables.push({ mat, base: 1.2, boost: 5, get: flash });
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

  private buildFlipper(pivot: Vec2, len: number, r0: number, r1: number, left: boolean, theme: Theme) {
    const g = new THREE.Group();
    g.position.copy(p3(pivot.x, pivot.y));
    const shape = capsuleShape({ x: 0, y: 0 }, { x: len, y: 0 }, r0, r1, 12);
    const body = new THREE.Mesh(extrude(shape, 0.05, 0.6), std(0xf4f4f6, { metalness: 0.1, roughness: 0.3 }));
    body.castShadow = true;
    const band = new THREE.Mesh(extrude(capsuleShape({ x: 0, y: 0 }, { x: len, y: 0 }, r0 + 0.02, r1 + 0.02, 12), 0.22, 0.42), glow(theme.accent, 1.6));
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.1, 16), std(0x999999, { metalness: 1, roughness: 0.2 }));
    cap.position.y = 0.65;
    g.add(body, band, cap);
    this.field.add(g);
    this.flippers.push({ obj: g, left });
  }

  resetTrail() {
    const b = this.game.ball;
    for (let i = 0; i < this.trailPos.length; i += 3) {
      this.trailPos[i] = b.x;
      this.trailPos[i + 1] = BALL_RADIUS;
      this.trailPos[i + 2] = -b.y;
    }
  }

  update(time: number) {
    const game = this.game;
    const t = game.table;
    const b = game.ball;
    this.ball.visible = b.active;
    this.ball.position.copy(p3(b.x, b.y, BALL_RADIUS));

    // Trail: shift positions.
    const tp = this.trailPos;
    for (let i = tp.length - 3; i >= 3; i -= 3) {
      tp[i] = tp[i - 3];
      tp[i + 1] = tp[i - 2];
      tp[i + 2] = tp[i - 1];
    }
    tp[0] = b.x;
    tp[1] = BALL_RADIUS;
    tp[2] = -b.y;
    this.trail.geometry.attributes.position.needsUpdate = true;
    const speed = Math.hypot(b.vx, b.vy);
    (this.trail.material as THREE.PointsMaterial).opacity = b.active && !b.held ? Math.min(0.5, speed / 120) : 0;

    this.flippers[0].obj.rotation.y = t.left.angle;
    this.flippers[1].obj.rotation.y = t.right.angle;

    for (const f of this.flashables) {
      const v = f.get();
      f.mat.emissiveIntensity = f.base + f.boost * v;
      if (f.mesh) f.mesh.scale.setScalar(1 + v * 0.12);
    }
    for (const tg of this.targets) tg.obj.position.y = 0.4 - tg.drop() * 0.85;
    for (const l of this.laneLights) {
      l.mat.emissiveIntensity = l.lit() ? 2.6 + Math.sin(time * 8) * 0.6 : 0.25;
    }

    const py = t.plunger.ay + WALL_R;
    this.plunger.position.copy(p3(BALL_START.x, py, 0.45));
  }

  dispose() {
    this.root.removeFromParent();
    for (const d of this.disposables) d.dispose();
  }
}
