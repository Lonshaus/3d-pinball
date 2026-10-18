import './style.css';
import { Sfx } from './audio/sfx';
import { BALLS_PER_GAME, Game, type GameEvent } from './game/game';
import { Input } from './input/input';
import { LEVELS, type LevelDef } from './levels/levels';
import { Stage } from './render/stage';
import { TableView } from './render/tableView';
import { setupInstallGuide } from './ui/install';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

// ---------- persistence ----------
interface Save {
  best: number[];
}
const SAVE_KEY = 'pinball3d.v1';
function loadSave(): Save {
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY) ?? '') as Save;
    if (Array.isArray(s.best)) return { best: s.best };
  } catch {
    /* ignore */
  }
  return { best: [] };
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
  status: $('hud-status'),
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
  $('btn-nudge'),
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
  $('btn-nudge').classList.toggle('hidden', !isTouch);
  if (isTouch) {
    Input.requestMotionPermission();
    const hints = $('touch-hints');
    hints.classList.remove('hidden');
    // Restart the fade animation.
    hints.style.animation = 'none';
    void hints.offsetWidth;
    hints.style.animation = '';
  }
  showToast(`${LEVELS[index].name}　任務：${game.mission.label}`, false);
}

function showMenu() {
  input.releaseAll();
  input.enabled = false;
  inMenu = true;
  paused = false;
  hud.root.classList.add('hidden');
  launchBtn.classList.add('hidden');
  $('btn-nudge').classList.add('hidden');
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
    const btn = document.createElement('button');
    btn.className = 'level-card';
    btn.style.setProperty('--c1', lv.theme.card[0]);
    btn.style.setProperty('--c2', lv.theme.card[1]);
    btn.style.setProperty('--glow', hex(lv.theme.accent));
    btn.innerHTML = `
      <div class="num">${i + 1}</div>
      <div><div class="name">${lv.name}</div><div class="sub">${lv.subtitle}</div></div>
      <div class="meta"><span class="stars">${'★'.repeat(lv.difficulty.stars)}${'☆'.repeat(5 - lv.difficulty.stars)}</span><br/>最高 ${(save.best[i] ?? 0).toLocaleString()}</div>
      <div class="blurb">${lv.blurb}</div>`;
    btn.addEventListener('click', () => {
      sfx.unlock();
      startLevel(i);
    });
    // Preview the table behind the menu on hover.
    btn.addEventListener('pointerenter', () => {
      if (inMenu && levelIndex !== i) loadLevel(i);
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

function popup(points: number, x: number, y: number, h = 0) {
  const p = stage.project(x, y, 1.2 + h);
  const el = document.createElement('div');
  el.className = 'popup';
  el.textContent = `+${points.toLocaleString()}`;
  el.style.left = `${p.x}px`;
  el.style.top = `${p.y}px`;
  popups.appendChild(el);
  setTimeout(() => el.remove(), 900);
}

function finish() {
  input.releaseAll();
  input.enabled = false;
  const i = levelIndex;
  const isNewBest = game.score > (save.best[i] ?? 0);
  if (isNewBest) save.best[i] = game.score;
  persist();
  launchBtn.classList.add('hidden');
  setTimeout(() => {
    $('result-title').textContent = isNewBest ? '🎉 新紀錄！' : '遊戲結束';
    $('result-score').textContent = game.score.toLocaleString();
    $('result-best').textContent = `完成任務 ${game.missionsDone} 個　最高分 ${(save.best[i] ?? 0).toLocaleString()}`;
    const next = $('btn-next');
    const n = (i + 1) % LEVELS.length;
    next.textContent = `換下一關：${LEVELS[n].name}`;
    next.onclick = () => startLevel(n);
    $('result').classList.remove('hidden');
  }, 600);
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
      popup(e.points, e.x, e.y, e.h);
      break;
    case 'ramp': {
      const r = t.ramps[e.index];
      const end = r.def.points[r.def.points.length - 1];
      sfx.ramp();
      stage.burst(end.x, end.y, theme.accent, 26, 9, r.def.heights[r.def.heights.length - 1]);
      showToast(`${r.def.name}！ +1500`);
      break;
    }
    case 'deck':
      sfx.ramp();
      stage.addShake(0.25);
      break;
    case 'spinner':
      sfx.spinner();
      break;
    case 'kickback':
      sfx.kickback();
      stage.addShake(0.4);
      break;
    case 'multiball':
      sfx.multiball();
      stage.addShake(0.6);
      break;
    case 'mission':
      if (e.done) sfx.mission();
      else sfx.lane();
      break;
    case 'message':
      showToast(e.text, e.big);
      break;
    case 'over':
      sfx.over();
      finish();
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
  view.update(time, dt);
  stage.render(dt, time);

  if (!inMenu) {
    // Count the score up smoothly.
    shownScore += (game.score - shownScore) * Math.min(1, dt * 12);
    if (Math.abs(game.score - shownScore) < 1) shownScore = game.score;
    hud.score.textContent = Math.round(shownScore).toLocaleString();
    // Current (random) mission and its progress.
    const m = game.mission;
    hud.goalBar.style.width = `${(game.missionCount / m.count) * 100}%`;
    hud.goalText.textContent = `任務：${m.label}${m.count > 1 ? `（${game.missionCount}/${m.count}）` : ''}　已完成 ${game.missionsDone}`;
    const st: string[] = [];
    const t = game.table;
    if (t.kickback) st.push(t.kickback.lit ? '🟢 救球彈簧' : '⚪ 救球彈簧');
    const locked = t.saucers.reduce((n, s) => n + s.locked.length, 0);
    if (t.saucers.some((s) => s.def.lock)) st.push(`🔒 鎖球 ${locked}/1`);
    const free = game.balls.filter((b) => b.active && !t.saucers.some((s) => s.locked.includes(b))).length;
    if (free > 1) st.push(`🔵 多球 ×${free}`);
    if (game.ballSave > 0 && game.phase === 'playing') st.push(`🛟 救球 ${Math.ceil(game.ballSave)}s`);
    hud.status.textContent = st.join('　');
    hud.mult.textContent = `×${game.multiplier}`;
    const inLane = !!game.laneBall;
    launchBtn.classList.toggle('hidden', !(isTouch && inLane && !paused) && !game.charging);
    launchFill.style.height = `${game.plungerCharge * 100}%`;
  } else {
    shownScore = 0;
  }
  requestAnimationFrame(frame);
}

setupInstallGuide($('install'), $<HTMLDetailsElement>('install-help'), $('install-steps'), $<HTMLButtonElement>('btn-install'));
loadLevel(0);
showMenu();
requestAnimationFrame(frame);
