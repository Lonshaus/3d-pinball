import type { LevelDef } from '../levels/levels';
import { type Ball, type Collider } from '../physics/world';
import {
  BALL_START,
  buildLayout,
  DRAIN_Y,
  FIELD_RIGHT,
  LANE_Y0,
  LANE_Y1,
  PLUNGER_REST_Y,
  PLUNGER_TRAVEL,
  type TableLayout,
} from '../table/layout';

export type Phase = 'ready' | 'playing' | 'draining' | 'clear' | 'over';

export type GameEvent =
  | { type: 'bumper'; index: number }
  | { type: 'sling'; index: number }
  | { type: 'target'; bank: number; index: number }
  | { type: 'bank'; bank: number }
  | { type: 'lane'; index: number }
  | { type: 'lanes' }
  | { type: 'saucer'; index: number; eject: boolean }
  | { type: 'flipper'; left: boolean; up: boolean }
  | { type: 'launch'; power: number }
  | { type: 'wall'; impact: number }
  | { type: 'drain' }
  | { type: 'saved' }
  | { type: 'ready' }
  | { type: 'nudge' }
  | { type: 'tilt' }
  | { type: 'clear' }
  | { type: 'over' }
  | { type: 'score'; points: number; x: number; y: number }
  | { type: 'message'; text: string; big?: boolean };

export const BALLS_PER_GAME = 3;
const BALL_SAVE_TIME = 7;
const MAX_MULT = 5;

export class Game {
  readonly table: TableLayout;
  readonly ball: Ball;
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
  private tiltDecay = 0;
  private drainTimer = 0;
  private stuckTimer = 0;
  private launchedThisBall = false;
  private plungerGrace = 0;
  private listeners: ((e: GameEvent) => void)[] = [];

  constructor(public readonly level: LevelDef) {
    this.table = buildLayout(level);
    this.ball = { x: BALL_START.x, y: BALL_START.y, vx: 0, vy: 0, active: true, held: false };
    this.table.world.balls.push(this.ball);
    this.wireColliders();
    this.table.world.onSubstep = () => this.sensors();
  }

  on(fn: (e: GameEvent) => void) {
    this.listeners.push(fn);
  }

  private emit(e: GameEvent) {
    for (const l of this.listeners) l(e);
  }

  private award(points: number, x: number, y: number) {
    if (this.tilted || this.phase === 'clear' || this.phase === 'over') return;
    const p = points * this.multiplier;
    this.score += p;
    this.emit({ type: 'score', points: p, x, y });
    if (this.score >= this.level.goal && this.phase === 'playing') {
      this.phase = 'clear';
      this.ball.held = true;
      this.emit({ type: 'clear' });
    }
  }

  private wireColliders() {
    const t = this.table;
    t.bumpers.forEach((b, i) => {
      b.collider.onHit = () => {
        b.flash = 1;
        this.emit({ type: 'bumper', index: i });
        this.award(100, b.pos.x, b.pos.y);
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
          this.emit({ type: 'target', bank: bi, index: ti });
          this.award(250, tg.center.x, tg.center.y);
          if (bank.targets.every((x) => x.dropped)) {
            bank.resetTimer = 1.5;
            this.emit({ type: 'bank', bank: bi });
            this.emit({ type: 'message', text: '目標全倒！ +3000' });
            this.award(3000, tg.center.x, tg.center.y);
          }
        };
      });
    });
    const wallHit = (h: { impact: number }) => {
      if (h.impact > 8) this.emit({ type: 'wall', impact: h.impact });
    };
    const addWallHit = (c: Collider) => (c.onHit = wallHit);
    t.walls.forEach(addWallHit);
    t.posts.forEach((c) => {
      c.onHit = (h) => {
        wallHit(h);
        if (h.impact > 4) this.award(10, c.ax, c.ay);
      };
    });
  }

  /** Runs every physics substep. */
  private sensors() {
    const b = this.ball;
    const t = this.table;
    if (!b.active) return;

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
            this.emit({ type: 'lanes' });
            this.emit({ type: 'message', text: `倍率 ×${this.multiplier}`, big: true });
            this.award(1000, lane.x, LANE_Y1);
          }
        } else {
          this.award(50, lane.x, LANE_Y1);
        }
      }
      lane.inside = inside;
    });

    // Saucers capture slow-ish balls.
    t.saucers.forEach((s, i) => {
      if (b.held || s.cooldown > 0) return;
      const dx = b.x - s.def.pos.x;
      const dy = b.y - s.def.pos.y;
      if (dx * dx + dy * dy < 0.55 * 0.55 && Math.hypot(b.vx, b.vy) < 32) {
        b.held = true;
        b.x = s.def.pos.x;
        b.y = s.def.pos.y;
        b.vx = b.vy = 0;
        s.holdTimer = 1.2;
        s.flash = 1;
        this.emit({ type: 'saucer', index: i, eject: false });
        this.emit({ type: 'message', text: '洞口獎勵 +1500' });
        this.award(1500, s.def.pos.x, s.def.pos.y);
      }
    });
  }

  setFlipper(left: boolean, down: boolean) {
    const f = left ? this.table.left : this.table.right;
    if (this.tilted && down) return;
    if (f.pressed === down) return;
    f.pressed = down;
    this.emit({ type: 'flipper', left, up: down });
    if (down) {
      // Lane change: rotate the lit lanes.
      const lit = this.table.lanes.map((l) => l.lit);
      const n = lit.length;
      this.table.lanes.forEach((l, i) => (l.lit = left ? lit[(i + 1) % n] : lit[(i - 1 + n) % n]));
    }
  }

  setPlunger(down: boolean) {
    if (down) {
      this.charging = true;
    } else if (this.charging) {
      this.charging = false;
      // The plunger snaps back faster than the ball moves; let the ball clear it first.
      this.plungerGrace = 0.25;
      const b = this.ball;
      const power = this.plungerCharge;
      if (b.active && !b.held && b.x > FIELD_RIGHT && b.y < PLUNGER_REST_Y + 2 && power > 0.05) {
        b.vy = 16 + 64 * power;
        b.vx = 0;
        if (!this.launchedThisBall) {
          this.launchedThisBall = true;
          this.ballSave = BALL_SAVE_TIME;
        }
        if (this.phase === 'ready') this.phase = 'playing';
        this.emit({ type: 'launch', power });
      }
      this.plungerCharge = 0;
    }
  }

  nudge(dir: number) {
    if (this.phase !== 'playing' || this.tilted) return;
    const b = this.ball;
    if (!b.held) {
      b.vx += dir * 5;
      b.vy += 6;
    }
    this.emit({ type: 'nudge' });
    this.tiltWarnings++;
    this.tiltDecay = 3;
    if (this.tiltWarnings >= 4) {
      this.tilted = true;
      this.table.left.pressed = this.table.right.pressed = false;
      this.emit({ type: 'tilt' });
      this.emit({ type: 'message', text: 'TILT！', big: true });
    } else if (this.tiltWarnings >= 2) {
      this.emit({ type: 'message', text: `注意搖台 (${this.tiltWarnings}/3)` });
    }
  }

  update(dt: number) {
    if (this.phase === 'clear' || this.phase === 'over') return;
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
    t.saucers.forEach((s, i) => {
      s.flash = Math.max(0, s.flash - dt * 1.5);
      if (s.cooldown > 0) s.cooldown -= dt;
      if (s.holdTimer > 0) {
        s.holdTimer -= dt;
        if (s.holdTimer <= 0) {
          const b = this.ball;
          b.held = false;
          const sp = 26;
          b.vx = Math.cos(s.def.ejectAngle) * sp;
          b.vy = Math.sin(s.def.ejectAngle) * sp;
          s.cooldown = 0.6;
          this.emit({ type: 'saucer', index: i, eject: true });
        }
      }
    });

    this.checkBall(dt);
  }

  private checkBall(dt: number) {
    const b = this.ball;
    if (this.phase === 'draining') {
      this.drainTimer -= dt;
      if (this.drainTimer <= 0) this.nextBall();
      return;
    }
    if (!b.active || b.held) return;

    const outOfBounds = b.y < -2 || b.x < -12 || b.x > 13 || b.y > 50;
    if ((b.y < DRAIN_Y && b.x < FIELD_RIGHT) || outOfBounds) {
      if (this.ballSave > 0 && !this.tilted) {
        this.resetBallToLane();
        this.emit({ type: 'saved' });
        this.emit({ type: 'message', text: '救球！BALL SAVED' });
        return;
      }
      b.active = false;
      this.phase = 'draining';
      this.drainTimer = 1.6;
      this.ballsLeft--;
      this.emit({ type: 'drain' });
      return;
    }

    // Anti-stuck: a ball sitting still somewhere other than the shooter lane gets a little shove.
    const slow = Math.hypot(b.vx, b.vy) < 0.8;
    const inLane = b.x > FIELD_RIGHT;
    const cradled = this.table.left.pressed || this.table.right.pressed;
    if (slow && !inLane && !cradled) {
      this.stuckTimer += dt;
      if (this.stuckTimer > 3) {
        b.vx += (Math.random() - 0.5) * 8;
        b.vy += 10;
        this.stuckTimer = 0;
      }
    } else {
      this.stuckTimer = 0;
    }
  }

  private resetBallToLane() {
    const b = this.ball;
    b.x = BALL_START.x;
    b.y = BALL_START.y + 0.5;
    b.vx = b.vy = 0;
    b.active = true;
    b.held = false;
    this.launchedThisBall = true;
    this.ballSave = 0;
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
    this.resetBallToLane();
    this.launchedThisBall = false;
    this.phase = 'ready';
    this.emit({ type: 'ready' });
  }

  get ballNumber() {
    return Math.min(BALLS_PER_GAME, BALLS_PER_GAME - this.ballsLeft + 1);
  }
}
