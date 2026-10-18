import './style.css';
import { Sfx } from './audio/sfx';
import { BALLS_PER_GAME, Game, type GameEvent } from './game/game';
import { Input } from './input/input';
import { LEVELS, type LevelDef } from './levels/levels';
import { Stage } from './render/stage';
import { TableView } from './render/tableView';
import { FIELD_RIGHT } from './table/layout';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

// ---------- persistence ----------
interface Save {
  unlocked: number;
  best: number[];
}
const SAVE_KEY = 'pinball3d.v1';
function loadSave(): Save {
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY) ?? '') as Save;
    if (typeof s.unlocked === 'number' && Array.isArray(s.best)) return s;
  } catch {
    /* ignore */
  }
  return { unlocked: 0, best: [] };
}
const save = loadSave();
function persist() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch {
    /* storage may be unavailable (private mode) */
  }
}

// ---------- setup ----------
const stage = new Stage($('stage'));
const sfx = new Sfx();
let game: Game;
let view: TableView;
let levelIndex = 0;
let paused = false;
let inMenu = true;
const isTouch = navigator.maxTouchPoints > 0 || 'ontouchstart' in window;

const hud = {
  root: $('hud'),
  level: $('hud-level'),
  score: $('hud-score'),
  balls: $('hud-balls'),
  goalBar: $('hud-goal-bar'),
  goalText: $('hud-goal-text'),
  mult: $('hud-mult'),
};
const launchBtn = $('btn-launch');
const launchFill = launchBtn.querySelector<HTMLElement>('.launch-fill')!;
const toast = $('toast');
const popups = $('popups');

const input = new Input(
  {
    flipper: (left, down) => game?.setFlipper(left, down),
    plunger: (down) => game?.setPlunger(down),
    nudge: (dir) => game?.nudge(dir),
    pause: () => togglePause(),
    interact: () => sfx.unlock(),
  },
  $('touch'),
  launchBtn,
);

function applyThemeCss(level: LevelDef) {
  const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');
  document.documentElement.style.setProperty('--accent', hex(level.theme.accent));
  document.documentElement.style.setProperty('--accent2', hex(level.theme.accent2));
  document.documentElement.style.setProperty('--bg', hex(level.theme.background));
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', hex(level.theme.background));
}

function loadLevel(index: number) {
  levelIndex = index;
  const level = LEVELS[index];
  game = new Game(level);
  view = new TableView(game, stage.maxAnisotropy);
  stage.setTable(view, level.theme);
  sfx.pitch = level.theme.pitch;
  applyThemeCss(level);
  game.on(onGameEvent);
  if (import.meta.env.DEV) (window as unknown as { __game: Game }).__game = game;
  hud.level.textContent = `${index + 1}. ${level.name}`;
  renderBalls();
}

function startLevel(index: number) {
  // A focused menu button would be "clicked" again by the Space key (the launch key).
  (document.activeElement as HTMLElement | null)?.blur();
  input.releaseAll();
  loadLevel(index);
  inMenu = false;
  paused = false;
  input.enabled = true;
  $('menu').classList.add('hidden');
  $('result').classList.add('hidden');
  $('pause').classList.add('hidden');
  hud.root.classList.remove('hidden');
  if (isTouch) {
    const hints = $('touch-hints');
    hints.classList.remove('hidden');
    // Restart the fade animation.
    hints.style.animation = 'none';
    void hints.offsetWidth;
    hints.style.animation = '';
  }
  showToast(`${LEVELS[index].name}　目標 ${LEVELS[index].goal.toLocaleString()}`, false);
}

function showMenu() {
  input.releaseAll();
  input.enabled = false;
  inMenu = true;
  paused = false;
  hud.root.classList.add('hidden');
  launchBtn.classList.add('hidden');
  $('touch-hints').classList.add('hidden');
  $('pause').classList.add('hidden');
  $('result').classList.add('hidden');
  $('menu').classList.remove('hidden');
  buildLevelList();
}

function buildLevelList() {
  const list = $('level-list');
  list.innerHTML = '';
  const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');
  LEVELS.forEach((lv, i) => {
    const locked = i > save.unlocked;
    const btn = document.createElement('button');
    btn.className = 'level-card';
    btn.disabled = locked;
    btn.style.setProperty('--c1', hex(lv.theme.background));
    btn.style.setProperty('--c2', hex(lv.theme.bumperBody));
    btn.style.setProperty('--glow', hex(lv.theme.accent));
    btn.innerHTML = `
      <div class="num">${locked ? '🔒' : i + 1}</div>
      <div><div class="name">${lv.name}</div><div class="sub">${lv.subtitle}</div></div>
      <div class="meta">目標 ${lv.goal.toLocaleString()}<br/>最高 ${(save.best[i] ?? 0).toLocaleString()}</div>`;
    btn.addEventListener('click', () => {
      sfx.unlock();
      startLevel(i);
    });
    // Preview the table behind the menu on hover.
    btn.addEventListener('pointerenter', () => {
      if (!locked && inMenu && levelIndex !== i) loadLevel(i);
    });
    list.appendChild(btn);
  });
}

function togglePause(force?: boolean) {
  if (inMenu || !$('result').classList.contains('hidden')) return;
  paused = force ?? !paused;
  input.releaseAll();
  input.enabled = !paused;
  $('pause').classList.toggle('hidden', !paused);
}

function renderBalls() {
  hud.balls.innerHTML = '';
  for (let i = 0; i < BALLS_PER_GAME; i++) {
    const el = document.createElement('i');
    if (game && i >= game.ballsLeft) el.classList.add('used');
    hud.balls.appendChild(el);
  }
}

let toastTimer = 0;
function showToast(text: string, big = false) {
  toast.textContent = text;
  toast.classList.remove('show', 'big');
  void toast.offsetWidth;
  toast.classList.add('show');
  toast.classList.toggle('big', big);
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove('show'), 1700);
}

function popup(points: number, x: number, y: number) {
  const p = stage.project(x, y, 1.2);
  const el = document.createElement('div');
  el.className = 'popup';
  el.textContent = `+${points.toLocaleString()}`;
  el.style.left = `${p.x}px`;
  el.style.top = `${p.y}px`;
  popups.appendChild(el);
  setTimeout(() => el.remove(), 900);
}

function finish(cleared: boolean) {
  input.releaseAll();
  input.enabled = false;
  const i = levelIndex;
  const isNewBest = game.score > (save.best[i] ?? 0);
  if (isNewBest) save.best[i] = game.score;
  if (cleared && i + 1 < LEVELS.length) save.unlocked = Math.max(save.unlocked, i + 1);
  persist();
  launchBtn.classList.add('hidden');
  setTimeout(
    () => {
      $('result-title').textContent = cleared ? '🎉 關卡完成！' : '遊戲結束';
      $('result-score').textContent = game.score.toLocaleString();
      $('result-best').textContent = isNewBest ? '★ 新紀錄！' : `最高分 ${(save.best[i] ?? 0).toLocaleString()}`;
      const next = $('btn-next');
      const hasNext = cleared && i + 1 < LEVELS.length;
      next.classList.toggle('hidden', !hasNext && cleared);
      next.textContent = hasNext ? `下一關：${LEVELS[i + 1].name}` : '再挑戰一次';
      next.onclick = () => startLevel(hasNext ? i + 1 : i);
      $('btn-retry').classList.toggle('hidden', !cleared);
      $('result').classList.remove('hidden');
    },
    cleared ? 1200 : 600,
  );
}

function onGameEvent(e: GameEvent) {
  const t = game.table;
  const theme = game.level.theme;
  switch (e.type) {
    case 'bumper': {
      const b = t.bumpers[e.index];
      sfx.bumper();
      stage.burst(b.pos.x, b.pos.y, theme.bumperCap, 18, 9);
      stage.addShake(0.15);
      break;
    }
    case 'sling': {
      const s = t.slings[e.index];
      sfx.sling();
      stage.burst((s.tri[0].x + s.tri[2].x) / 2, (s.tri[0].y + s.tri[2].y) / 2, theme.sling, 10, 6);
      break;
    }
    case 'target': {
      const tg = t.banks[e.bank].targets[e.index];
      sfx.target();
      stage.burst(tg.center.x, tg.center.y, theme.target, 12, 6);
      break;
    }
    case 'bank':
      sfx.bank();
      stage.addShake(0.3);
      break;
    case 'lane':
      sfx.lane();
      break;
    case 'lanes':
      sfx.lanes();
      break;
    case 'saucer': {
      const s = t.saucers[e.index];
      sfx.saucer(e.eject);
      if (!e.eject) stage.burst(s.def.pos.x, s.def.pos.y, theme.accent, 24, 7);
      break;
    }
    case 'flipper':
      sfx.flipper(e.up);
      break;
    case 'launch':
      sfx.launch(e.power);
      stage.addShake(0.1 + e.power * 0.2);
      break;
    case 'wall':
      sfx.wall(e.impact);
      break;
    case 'drain':
      sfx.drain();
      renderBalls();
      if (game.ballsLeft > 0) showToast(`剩下 ${game.ballsLeft} 顆球`);
      break;
    case 'saved':
      sfx.saved();
      break;
    case 'ready':
      view.resetTrail();
      renderBalls();
      break;
    case 'nudge':
      sfx.nudge();
      stage.addShake(0.35);
      break;
    case 'tilt':
      sfx.tilt();
      stage.addShake(0.8);
      break;
    case 'score':
      popup(e.points, e.x, e.y);
      break;
    case 'message':
      showToast(e.text, e.big);
      break;
    case 'clear':
      sfx.clear();
      showToast('目標達成！', true);
      finish(true);
      break;
    case 'over':
      sfx.over();
      finish(false);
      break;
  }
}

// ---------- buttons ----------
$('btn-pause').addEventListener('click', () => togglePause());
$('btn-resume').addEventListener('click', () => togglePause(false));
$('btn-restart').addEventListener('click', () => startLevel(levelIndex));
$('btn-menu').addEventListener('click', showMenu);
$('btn-menu2').addEventListener('click', showMenu);
$('btn-retry').addEventListener('click', () => startLevel(levelIndex));
const muteBtn = $('btn-mute');
muteBtn.addEventListener('click', () => {
  sfx.unlock();
  sfx.setMuted(!sfx.muted);
  muteBtn.textContent = sfx.muted ? '🔇' : '🔊';
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && !inMenu) togglePause(true);
});

// ---------- main loop ----------
let last = performance.now();
let shownScore = 0;
function frame(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const time = now / 1000;

  if (!inMenu && !paused) game.update(dt);
  view.update(time);
  stage.render(dt, time);

  if (!inMenu) {
    // Count the score up smoothly.
    shownScore += (game.score - shownScore) * Math.min(1, dt * 12);
    if (Math.abs(game.score - shownScore) < 1) shownScore = game.score;
    hud.score.textContent = Math.round(shownScore).toLocaleString();
    const pct = Math.min(1, game.score / game.level.goal);
    hud.goalBar.style.width = `${pct * 100}%`;
    hud.goalText.textContent = `目標 ${game.level.goal.toLocaleString()}`;
    hud.mult.textContent = `×${game.multiplier}`;
    const b = game.ball;
    const inLane = b.active && !b.held && b.x > FIELD_RIGHT && b.y < 4;
    launchBtn.classList.toggle('hidden', !(isTouch && inLane && !paused) && !game.charging);
    launchFill.style.height = `${game.plungerCharge * 100}%`;
  } else {
    shownScore = 0;
  }
  requestAnimationFrame(frame);
}

loadLevel(Math.min(save.unlocked, LEVELS.length - 1));
showMenu();
requestAnimationFrame(frame);
