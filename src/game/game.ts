import type { LevelDef, MissionDef, MissionKind } from '../levels/levels';
import { newBall, type Ball, type Collider } from '../physics/world';
import {
  BALL_START,
  buildLayout,
  DRAIN_Y,
  FIELD_RIGHT,
  insideDeck,
  LANE_Y0,
  LANE_Y1,
  PLUNGER_REST_Y,
  PLUNGER_TRAVEL,
  sampleRamp,
  type SaucerEl,
  type TableLayout,
} from '../table/layout';

export type Phase = 'ready' | 'playing' | 'draining' | 'over';

export type GameEvent =
  | { type: 'bumper'; index: number }
  | { type: 'sling'; index: number }
  | { type: 'target'; bank: number; index: number }
  | { type: 'bank'; bank: number }
  | { type: 'lane'; index: number }
  | { type: 'lanes' }
  | { type: 'saucer'; index: number; eject: boolean }
  | { type: 'ramp'; index: number }
  | { type: 'deck'; index: number }
  | { type: 'spinner'; index: number }
  | { type: 'kickback' }
  | { type: 'multiball' }
  | { type: 'mission'; index: number; done: boolean }
  | { type: 'flipper'; left: boolean; up: boolean }
  | { type: 'launch'; power: number }
  | { type: 'wall'; impact: number }
  | { type: 'drain' }
  | { type: 'saved' }
  | { type: 'ready' }
  | { type: 'nudge' }
  | { type: 'tilt' }
  | { type: 'over' }
  | { type: 'score'; points: number; x: number; y: number; h: number }
  | { type: 'message'; text: string; big?: boolean };

export const BALLS_PER_GAME = 3;
const MAX_MULT = 5;
/** Extra deceleration on ramps per unit of slope (the ramp's own incline). */
const RAMP_GRAVITY = 230;
const DROP_GRAVITY = 45;
const MULTIBALL_EXTRA = 2;

interface BallInfo {
  /** Ramp the ball is currently on, or -1. */
  ramp: number;
  /** Deck the ball is currently on, or -1. */
  deck: number;
  stuck: number;
}

export class Game {
  readonly table: TableLayout;
  phase: Phase = 'ready';
  score = 0;
  ballsLeft = BALLS_PER_GAME;
  multiplier = 1;
  plungerCharge = 0;
  plungerOffset = 0;
  charging = false;
  ballSave = 0;
  tilted = false;
  tiltWarnings = 0;
  /** Missions are drawn at random from this pool; each completed one pays a growing bonus. */
  readonly missionPool: MissionDef[];
  missionIndex = 0;
  missionCount = 0;
  missionsDone = 0;
  private tiltDecay = 0;
  private drainTimer = 0;
  private launchedThisBall = false;
  private plungerGrace = 0;
  /** Balls waiting to be auto-launched (ball save, multiball). */
  private launchQueue = 0;
  private launchTimer = 0;
  private info = new Map<Ball, BallInfo>();
  private listeners: ((e: GameEvent) => void)[] = [];

  constructor(public readonly level: LevelDef) {
    this.table = buildLayout(level);
    this.missionPool = [...level.missions, { kind: 'lanes', count: 1, label: '點亮頂部三條滾道' }];
    this.missionIndex = -1;
    this.pickMission();
    this.addBall(BALL_START.x, BALL_START.y);
    this.wireColliders();
    this.table.world.onSubstep = (dt) => {
      for (const b of this.balls) this.sensors(b, dt);
    };
  }

  get balls(): Ball[] {
    return this.table.world.balls;
  }

  /** The main ball for code that only cares about one (e.g. the launch button). */
  get ball(): Ball {
    return this.balls[0];
  }

  get mission(): MissionDef {
    return this.missionPool[this.missionIndex];
  }

  /** Draws a different mission from the pool. */
  private pickMission() {
    const n = this.missionPool.length;
    let next = Math.floor(Math.random() * n);
    if (n > 1 && next === this.missionIndex) next = (next + 1 + Math.floor(Math.random() * (n - 1))) % n;
    this.missionIndex = next;
    this.missionCount = 0;
  }

  on(fn: (e: GameEvent) => void) {
    this.listeners.push(fn);
  }

  private emit(e: GameEvent) {
    for (const l of this.listeners) l(e);
  }

  private addBall(x: number, y: number) {
    const b = newBall(x, y);
    this.balls.push(b);
    this.info.set(b, { ramp: -1, deck: -1, stuck: 0 });
    return b;
  }

  private removeBall(b: Ball) {
    b.active = false;
    const i = this.balls.indexOf(b);
    if (i >= 0) this.balls.splice(i, 1);
    this.info.delete(b);
    for (const s of this.table.spinners) s.side.delete(b);
  }

  private award(points: number, x: number, y: number, h = 0) {
    if (this.tilted || this.phase === 'over') return;
    const p = points * this.multiplier;
    this.score += p;
    this.emit({ type: 'score', points: p, x, y, h });
  }

  /** Advances the current mission if the event matches it. */
  private progress(kind: MissionKind, target?: string | number) {
    if (this.tilted || this.phase === 'over') return;
    const m = this.mission;
    if (m.kind !== kind || (m.target !== undefined && m.target !== target)) return;
    this.missionCount++;
    if (this.missionCount < m.count) {
      this.emit({ type: 'mission', index: this.missionIndex, done: false });
      return;
    }
    // Later missions are worth more.
    const bonus = 5000 + 2500 * this.missionsDone;
    this.score += bonus;
    this.missionsDone++;
    this.emit({ type: 'message', text: `任務完成：${m.label}  +${bonus.toLocaleString()}` });
    this.emit({ type: 'mission', index: this.missionIndex, done: true });
    if (this.table.kickback) this.table.kickback.lit = true;
    const every = this.level.multiballAfter;
    if (every && this.missionsDone % every === 0) this.startMultiball();
    this.pickMission();
  }

  private startMultiball() {
    // Top up to three balls in play (locked balls are let out too); already there means a jackpot instead.
    const inPlay = this.balls.length + this.launchQueue;
    const add = Math.max(0, MULTIBALL_EXTRA + 1 - inPlay);
    if (add === 0 && !this.table.saucers.some((s) => s.locked.length)) {
      this.score += 10000;
      this.emit({ type: 'message', text: 'JACKPOT！ +10,000', big: true });
      return;
    }
    for (const s of this.table.saucers) if (s.locked.length) this.freeLocked(s);
    this.launchQueue += add;
    this.launchTimer = 0.6;
    this.ballSave = Math.max(this.ballSave, 8);
    this.emit({ type: 'multiball' });
    this.emit({ type: 'message', text: '多球模式！MULTIBALL', big: true });
  }

  private wireColliders() {
    const t = this.table;
    t.bumpers.forEach((b, i) => {
      b.collider.onHit = () => {
        b.flash = 1;
        this.emit({ type: 'bumper', index: i });
        this.award(100, b.pos.x, b.pos.y, b.layer ? this.deckHeight(b.layer) : 0);
        this.progress('bumper');
      };
    });
    t.slings.forEach((s, i) => {
      s.kicker.onHit = (h) => {
        if (h.impact < 1.2) return;
        s.flash = 1;
        this.emit({ type: 'sling', index: i });
        this.award(30, (s.tri[0].x + s.tri[2].x) / 2, (s.tri[0].y + s.tri[2].y) / 2);
      };
    });
    t.banks.forEach((bank, bi) => {
      bank.targets.forEach((tg, ti) => {
        tg.collider.onHit = (h) => {
          if (tg.dropped || h.impact < 3) return;
          tg.dropped = true;
          tg.collider.enabled = false;
          const hh = bank.layer ? this.deckHeight(bank.layer) : 0;
          this.emit({ type: 'target', bank: bi, index: ti });
          this.award(250, tg.center.x, tg.center.y, hh);
          if (bank.targets.every((x) => x.dropped)) {
            bank.resetTimer = 1.5;
            this.emit({ type: 'bank', bank: bi });
            this.emit({ type: 'message', text: '落靶全倒！ +3000' });
            this.award(3000, tg.center.x, tg.center.y, hh);
            this.progress('bank', bi);
          }
        };
      });
    });
    const wallHit = (h: { impact: number }) => {
      if (h.impact > 8) this.emit({ type: 'wall', impact: h.impact });
    };
    const addWallHit = (c: Collider) => (c.onHit = wallHit);
    t.walls.forEach(addWallHit);
    t.decks.forEach((d) => d.walls.forEach(addWallHit));
    t.posts.forEach((c) => {
      c.onHit = (h) => {
        wallHit(h);
        if (h.impact > 4) this.award(10, c.ax, c.ay);
      };
    });
  }

  private deckHeight(layer: number) {
    return this.level.decks.find((d) => d.layer === layer)?.height ?? 0;
  }

  /** Runs every physics substep for each ball. */
  private sensors(b: Ball, dt: number) {
    if (!b.active || b.held) return;
    const info = this.info.get(b)!;
    if (b.layer > 0) this.elevated(b, info, dt);
    else this.ground(b, info, dt);
  }

  /** Ball on a ramp or deck: follow the surface height and handle the ends. */
  private elevated(b: Ball, info: BallInfo, dt: number) {
    const t = this.table;
    const deckIndex = t.decks.findIndex((d) => d.def.layer === b.layer && insideDeck(d.def, b.x, b.y));
    if (deckIndex >= 0) {
      if (info.deck !== deckIndex && info.ramp >= 0 && t.ramps[info.ramp].toDeck) {
        this.emit({ type: 'deck', index: deckIndex });
        this.emit({ type: 'message', text: `登上${t.decks[deckIndex].def.name}！ +2000` });
        this.award(2000, b.x, b.y, t.decks[deckIndex].def.height);
        this.progress('deck');
      }
      info.deck = deckIndex;
      info.ramp = -1;
      b.z = t.decks[deckIndex].def.height;
      return;
    }
    info.deck = -1;

    // Find the ramp under the ball, preferring the one it is already on.
    let best = -1;
    let sample = null as ReturnType<typeof sampleRamp> | null;
    t.ramps.forEach((r, i) => {
      if (r.def.layer !== b.layer) return;
      const smp = sampleRamp(r, b.x, b.y);
      if (smp.lateral > r.def.width / 2 + 0.8) return;
      if (!sample || i === info.ramp || (best !== info.ramp && smp.lateral < sample.lateral)) {
        best = i;
        sample = smp;
      }
    });
    if (best < 0 || !sample) {
      b.layer = 0;
      info.ramp = -1;
      return;
    }
    const ramp = t.ramps[best];
    info.ramp = best;
    const smp = sample as ReturnType<typeof sampleRamp>;
    if (smp.s < 0 && !ramp.fromDeck) {
      // Rolled back out of the entrance.
      b.layer = 0;
      info.ramp = -1;
      b.z = 0;
      return;
    }
    if (smp.s >= ramp.length) {
      if (!ramp.fromDeck) {
        ramp.flash = 1;
        this.emit({ type: 'ramp', index: best });
        this.award(1500, b.x, b.y, smp.height);
        this.progress('ramp', ramp.def.id);
      }
      if (ramp.def.endSaucer !== undefined) {
        b.layer = 0;
        b.z = 0;
        info.ramp = -1;
        this.capture(b, ramp.def.endSaucer, true);
        return;
      }
      if (!ramp.toDeck) {
        // Off the end: drop onto the playfield.
        b.layer = 0;
        b.zv = 0;
        info.ramp = -1;
        return;
      }
    }
    b.z = Math.max(0, smp.height);
    // Climbing slows the ball, coming down speeds it up.
    b.vx -= RAMP_GRAVITY * smp.slope * smp.tx * dt;
    b.vy -= RAMP_GRAVITY * smp.slope * smp.ty * dt;
  }

  private ground(b: Ball, info: BallInfo, dt: number) {
    const t = this.table;
    // Falling after leaving a ramp.
    if (b.z > 0) {
      b.zv -= DROP_GRAVITY * dt;
      b.z = Math.max(0, b.z + b.zv * dt);
      if (b.z === 0) b.zv = 0;
    }

    // Ramp entrances.
    for (let i = 0; i < t.ramps.length; i++) {
      const r = t.ramps[i];
      if (r.fromDeck) continue;
      const [p0, p1] = r.def.points;
      const len = Math.hypot(p1.x - p0.x, p1.y - p0.y);
      const tx = (p1.x - p0.x) / len;
      const ty = (p1.y - p0.y) / len;
      const rx = b.x - p0.x;
      const ry = b.y - p0.y;
      const s = rx * tx + ry * ty;
      const lat = Math.abs(-rx * ty + ry * tx);
      if (s > 0 && s < 1.0 && lat < r.def.width / 2 && b.vx * tx + b.vy * ty > 0) {
        b.layer = r.def.layer;
        info.ramp = i;
        return;
      }
    }

    // Rollover lanes.
    t.lanes.forEach((lane, i) => {
      const inside = Math.abs(b.x - lane.x) < 0.75 && b.y > LANE_Y0 && b.y < LANE_Y1;
      if (inside && !lane.inside) {
        if (!lane.lit) {
          lane.lit = true;
          this.emit({ type: 'lane', index: i });
          this.award(150, lane.x, (LANE_Y0 + LANE_Y1) / 2);
          if (t.lanes.every((l) => l.lit)) {
            t.lanes.forEach((l) => (l.lit = false));
            if (this.multiplier < MAX_MULT) this.multiplier++;
            if (t.kickback) t.kickback.lit = true;
            this.emit({ type: 'lanes' });
            this.emit({ type: 'message', text: `倍率 ×${this.multiplier}`, big: true });
            this.award(1000, lane.x, LANE_Y1);
            this.progress('lanes');
          }
        } else {
          this.award(50, lane.x, LANE_Y1);
        }
      }
      lane.inside = inside;
    });

    // Saucers / tunnels capture slow-ish balls.
    for (let i = 0; i < t.saucers.length; i++) {
      const s = t.saucers[i];
      if (s.ball || s.cooldown > 0) continue;
      const dx = b.x - s.def.pos.x;
      const dy = b.y - s.def.pos.y;
      if (dx * dx + dy * dy < 0.55 * 0.55 && Math.hypot(b.vx, b.vy) < 32) {
        this.capture(b, i, false);
        return;
      }
    }

    // Spinners: count crossings, spin proportional to speed.
    for (const sp of t.spinners) {
      const ax = Math.cos(sp.def.angle);
      const ay = Math.sin(sp.def.angle);
      const rx = b.x - sp.def.pos.x;
      const ry = b.y - sp.def.pos.y;
      const along = rx * ax + ry * ay;
      const lat = Math.abs(-rx * ay + ry * ax);
      const side = Math.sign(along);
      const prev = sp.side.get(b);
      sp.side.set(b, side);
      if (prev !== undefined && prev !== side && lat < sp.def.width / 2) {
        sp.spin = Math.min(60, Math.max(Math.abs(sp.spin), Math.hypot(b.vx, b.vy) * 1.1)) * (side > 0 ? 1 : -1);
      }
    }

    // Kickback in the left outlane.
    const kb = t.kickback;
    if (kb && b.x > kb.x0 && b.x < kb.x1 && b.y > kb.y0 && b.y < kb.y1 && b.vy < 0) {
      if (kb.lit && !this.tilted) {
        kb.lit = false;
        kb.fire = 1;
        b.vy = 58;
        b.vx = 0.4;
        this.emit({ type: 'kickback' });
        this.emit({ type: 'message', text: '救球彈簧！KICKBACK' });
      }
    }
  }

  private capture(b: Ball, index: number, viaRamp: boolean) {
    const s = this.table.saucers[index];
    const def = s.def;
    if (s.ball) {
      // Already busy: just pop this one straight back out.
      this.eject(b, s);
      return;
    }
    b.held = true;
    b.x = def.pos.x;
    b.y = def.pos.y;
    b.vx = b.vy = 0;
    b.z = 0;
    s.flash = 1;
    this.emit({ type: 'saucer', index, eject: false });
    this.award(viaRamp ? 3500 : 2500, def.pos.x, def.pos.y);
    this.progress('saucer', index);

    // Locks only take a ball while it is the only one in play.
    const single = this.balls.length + this.launchQueue === 1;
    if (def.lock && s.locked.length === 0 && single) {
      // Park the ball and serve a new one.
      s.locked.push(b);
      this.launchQueue++;
      this.launchTimer = 0.8;
      this.emit({ type: 'message', text: `${def.name}：鎖住一顆球！再打進一顆開啟多球`, big: false });
      return;
    }
    b.hidden = !!(def.exit || def.exits);
    s.ball = b;
    s.holdTimer = def.hold ?? (def.exit || def.exits ? 1.1 : 1.2);
    s.bonusTick = 0.5;
    if (def.lock && s.locked.length) this.emit({ type: 'message', text: `${def.name}：釋放！`, big: true });
    else if (def.hold) this.emit({ type: 'message', text: `${def.name}：累積獎勵中…` });
    else this.emit({ type: 'message', text: `${def.name} +2500` });
  }

  private eject(b: Ball, s: SaucerEl) {
    const def = s.def;
    const out = def.exit ?? (def.exits ? def.exits[Math.floor(Math.random() * def.exits.length)] : { pos: def.pos, angle: def.ejectAngle });
    b.held = false;
    b.hidden = false;
    b.layer = 0;
    b.x = out.pos.x;
    b.y = out.pos.y;
    const sp = 26;
    b.vx = Math.cos(out.angle) * sp;
    b.vy = Math.sin(out.angle) * sp;
  }

  /** Releases a full lock: every parked ball comes back out, topped up to three balls. */
  private releaseLock(s: SaucerEl) {
    this.freeLocked(s);
    this.launchQueue += Math.max(0, MULTIBALL_EXTRA + 1 - this.balls.length - this.launchQueue);
    this.launchTimer = 0.6;
    this.ballSave = Math.max(this.ballSave, 8);
    this.emit({ type: 'multiball' });
    this.emit({ type: 'message', text: '多球模式！MULTIBALL', big: true });
  }

  private freeLocked(s: SaucerEl) {
    s.locked.forEach((b, i) => {
      this.eject(b, s);
      // Fan them out a little so they don't sit on top of each other.
      const a = s.def.ejectAngle + (i + 1) * 0.35;
      b.x += Math.cos(a) * 0.95;
      b.y += Math.sin(a) * 0.95;
      b.vx = Math.cos(a) * 24;
      b.vy = Math.sin(a) * 24;
    });
    s.locked = [];
  }

  private isLocked(b: Ball) {
    return this.table.saucers.some((s) => s.locked.includes(b));
  }

  setFlipper(left: boolean, down: boolean) {
    const t = this.table;
    if (this.tilted && down) return;
    for (const d of t.decks) if (d.def.flipper.left === left) d.flipper.pressed = down;
    const f = left ? t.left : t.right;
    if (f.pressed === down) return;
    f.pressed = down;
    this.emit({ type: 'flipper', left, up: down });
    if (down) {
      // Lane change: rotate the lit lanes.
      const lit = t.lanes.map((l) => l.lit);
      const n = lit.length;
      t.lanes.forEach((l, i) => (l.lit = left ? lit[(i + 1) % n] : lit[(i - 1 + n) % n]));
    }
  }

  private ballInLane(b: Ball) {
    return b.active && !b.held && b.layer === 0 && b.x > FIELD_RIGHT && b.y < PLUNGER_REST_Y + 2;
  }

  /** A ball resting in the shooter lane, if any. */
  get laneBall(): Ball | undefined {
    return this.balls.find((b) => this.ballInLane(b));
  }

  setPlunger(down: boolean) {
    if (down) {
      this.charging = true;
    } else if (this.charging) {
      this.charging = false;
      // The plunger snaps back faster than the ball moves; let the ball clear it first.
      this.plungerGrace = 0.25;
      const power = this.plungerCharge;
      const b = this.laneBall;
      if (b && power > 0.05) {
        b.vy = 16 + 64 * power;
        b.vx = 0;
        if (!this.launchedThisBall) {
          this.launchedThisBall = true;
          this.ballSave = Math.max(this.ballSave, this.level.difficulty.ballSave);
        }
        if (this.phase === 'ready') this.phase = 'playing';
        this.emit({ type: 'launch', power });
      }
      this.plungerCharge = 0;
    }
  }

  nudge(dir: number) {
    if (this.phase !== 'playing' || this.tilted) return;
    for (const b of this.balls) {
      if (b.held || b.layer > 0) continue;
      b.vx += dir * 5;
      b.vy += 6;
    }
    this.emit({ type: 'nudge' });
    this.tiltWarnings++;
    this.tiltDecay = 3;
    if (this.tiltWarnings >= 4) {
      this.tilted = true;
      for (const f of this.table.world.flippers) f.pressed = false;
      this.emit({ type: 'tilt' });
      this.emit({ type: 'message', text: 'TILT！', big: true });
    } else if (this.tiltWarnings >= 2) {
      this.emit({ type: 'message', text: `注意搖台 (${this.tiltWarnings}/3)` });
    }
  }

  update(dt: number) {
    if (this.phase === 'over') return;
    const t = this.table;

    // Plunger charge / spring back.
    if (this.charging) this.plungerCharge = Math.min(1, this.plungerCharge + dt * 1.15);
    const targetOffset = this.plungerCharge * PLUNGER_TRAVEL;
    this.plungerOffset += (targetOffset - this.plungerOffset) * Math.min(1, dt * (this.charging ? 30 : 60));
    t.plunger.ay = t.plunger.by = PLUNGER_REST_Y - this.plungerOffset;
    if (this.plungerGrace > 0) this.plungerGrace -= dt;
    t.plunger.enabled = this.plungerGrace <= 0;

    t.world.update(dt);

    if (this.ballSave > 0 && this.phase === 'playing') this.ballSave -= dt;
    if (this.tiltDecay > 0) {
      this.tiltDecay -= dt;
      if (this.tiltDecay <= 0 && !this.tilted) this.tiltWarnings = 0;
    }

    for (const b of t.bumpers) b.flash = Math.max(0, b.flash - dt * 4);
    for (const s of t.slings) s.flash = Math.max(0, s.flash - dt * 5);
    for (const r of t.ramps) r.flash = Math.max(0, r.flash - dt * 1.5);
    if (t.kickback) t.kickback.fire = Math.max(0, t.kickback.fire - dt * 3);
    for (const bank of t.banks) {
      for (const tg of bank.targets) tg.drop += ((tg.dropped ? 1 : 0) - tg.drop) * Math.min(1, dt * 14);
      if (bank.resetTimer > 0) {
        bank.resetTimer -= dt;
        if (bank.resetTimer <= 0) {
          for (const tg of bank.targets) {
            tg.dropped = false;
            tg.collider.enabled = true;
          }
        }
      }
    }
    t.spinners.forEach((sp, i) => {
      const before = Math.floor(sp.angle / Math.PI);
      sp.angle += sp.spin * dt;
      sp.spin *= Math.exp(-dt * 1.6);
      if (Math.abs(sp.spin) < 0.3) sp.spin = 0;
      const after = Math.floor(sp.angle / Math.PI);
      // Every half turn scores.
      for (let k = 0; k < Math.abs(after - before); k++) {
        this.emit({ type: 'spinner', index: i });
        this.award(25, sp.def.pos.x, sp.def.pos.y);
        this.progress('spinner');
      }
    });
    t.saucers.forEach((s, i) => {
      s.flash = Math.max(0, s.flash - dt * 1.5);
      if (s.cooldown > 0) s.cooldown -= dt;
      if (s.ball && s.holdTimer > 0) {
        s.holdTimer -= dt;
        // Bonus holes pay out the whole time they hold the ball.
        if (s.def.hold) {
          s.bonusTick -= dt;
          if (s.bonusTick <= 0) {
            s.bonusTick = 0.5;
            s.flash = 1;
            this.award(500, s.def.pos.x, s.def.pos.y);
          }
        }
        if (s.holdTimer <= 0) {
          this.eject(s.ball, s);
          s.ball = undefined;
          s.cooldown = 0.6;
          if (s.locked.length) this.releaseLock(s);
          this.emit({ type: 'saucer', index: i, eject: true });
        }
      }
    });

    this.autoLaunch(dt);
    this.checkBalls(dt);
  }

  /** Feeds queued balls (ball save, multiball) through the shooter lane. */
  private autoLaunch(dt: number) {
    if (this.launchQueue <= 0) return;
    this.launchTimer -= dt;
    if (this.launchTimer > 0) return;
    const laneBusy = this.balls.some((b) => b.active && b.layer === 0 && b.x > FIELD_RIGHT && b.y < 12);
    if (laneBusy) return;
    const b = this.addBall(BALL_START.x, BALL_START.y + 0.5);
    b.vy = 66 + Math.random() * 8;
    this.launchQueue--;
    this.launchTimer = 0.9;
    if (this.phase === 'ready' || this.phase === 'draining') this.phase = 'playing';
    this.emit({ type: 'launch', power: 0.8 });
  }

  private checkBalls(dt: number) {
    if (this.phase === 'draining') {
      this.drainTimer -= dt;
      if (this.drainTimer <= 0) this.nextBall();
      return;
    }
    const t = this.table;
    for (const b of [...this.balls]) {
      if (!b.active || b.held) continue;
      const info = this.info.get(b)!;
      const outOfBounds = b.y < -2 || b.x < -12 || b.x > 13 || b.y > 50;
      if ((b.layer === 0 && b.y < DRAIN_Y && b.x < FIELD_RIGHT) || outOfBounds) {
        this.removeBall(b);
        if (this.ballSave > 0 && !this.tilted) {
          this.launchQueue++;
          this.launchTimer = Math.min(this.launchTimer, 0.4);
          this.emit({ type: 'saved' });
          this.emit({ type: 'message', text: '救球！BALL SAVED' });
          continue;
        }
        // Balls parked in a lock don't count as in play.
        const inPlay = this.balls.filter((x) => !this.isLocked(x)).length + this.launchQueue;
        if (inPlay === 1) this.emit({ type: 'message', text: '多球結束' });
        if (inPlay === 0) {
          this.phase = 'draining';
          this.drainTimer = 1.6;
          this.ballsLeft--;
          this.emit({ type: 'drain' });
          return;
        }
        continue;
      }

      // Anti-stuck: a ball sitting still somewhere other than the shooter lane gets a little shove.
      const slow = Math.hypot(b.vx, b.vy) < 0.8;
      const cradled = b.layer === 0 ? t.left.pressed || t.right.pressed : t.decks.some((d) => d.flipper.pressed);
      if (slow && b.x <= FIELD_RIGHT && !cradled) {
        info.stuck += dt;
        if (info.stuck > 3) {
          b.vx += (Math.random() - 0.5) * 8;
          b.vy += 10;
          info.stuck = 0;
        }
      } else {
        info.stuck = 0;
      }
    }
  }

  private nextBall() {
    if (this.ballsLeft <= 0) {
      this.phase = 'over';
      this.emit({ type: 'over' });
      return;
    }
    this.multiplier = 1;
    this.tilted = false;
    this.tiltWarnings = 0;
    this.launchedThisBall = false;
    this.ballSave = 0;
    // Locked balls stay locked for the next ball.
    for (const s of this.table.saucers) s.ball = undefined;
    this.addBall(BALL_START.x, BALL_START.y + 0.5);
    this.phase = 'ready';
    this.emit({ type: 'ready' });
  }

  get ballNumber() {
    return Math.min(BALLS_PER_GAME, BALLS_PER_GAME - this.ballsLeft + 1);
  }
}
