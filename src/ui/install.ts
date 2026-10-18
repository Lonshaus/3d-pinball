// In-game "install as an app" (PWA) guide, tailored to the player's device and browser.

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function isInstalled() {
  const nav = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia('(display-mode: standalone)').matches || window.matchMedia('(display-mode: fullscreen)').matches || nav.standalone === true;
}

function platform() {
  const ua = navigator.userAgent;
  // iPadOS reports itself as a Mac, but has touch.
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const iosSafari = ios && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|Line|FBAN|FBAV|Instagram/.test(ua);
  const android = /Android/.test(ua);
  return { ios, iosSafari, android };
}

function stepsFor(): string {
  const p = platform();
  if (p.iosSafari) {
    return `<ol>
      <li>點 Safari 下方（iPad 在上方）的「分享」按鈕 <span class="ico">⬆︎</span></li>
      <li>往下滑，選「加入主畫面」</li>
      <li>按右上角「加入」，主畫面就會出現彈珠台圖示</li>
    </ol>`;
  }
  if (p.ios) {
    return `<p>iPhone / iPad 只能用 <b>Safari</b> 安裝：請複製網址，改用 Safari 開啟，再點「分享」→「加入主畫面」。</p>`;
  }
  if (p.android) {
    return `<ol>
      <li>點瀏覽器右上角的「⋮」選單</li>
      <li>選「安裝應用程式」或「加到主畫面」</li>
      <li>確認安裝，主畫面就會出現彈珠台圖示</li>
    </ol>`;
  }
  return `<ol>
    <li>用 Chrome 或 Edge 開啟本頁</li>
    <li>點網址列右側的「安裝」圖示（或瀏覽器選單裡的「安裝應用程式」）</li>
    <li>之後可以從桌面或開始選單直接開啟</li>
  </ol>`;
}

/**
 * Fills the menu's install section and wires the "install" button under the title:
 * it opens the browser's own install prompt when one is offered (Chrome / Edge),
 * otherwise it expands the step-by-step guide.
 */
export function setupInstallGuide(section: HTMLElement, help: HTMLDetailsElement, steps: HTMLElement, button: HTMLButtonElement) {
  const hide = () => {
    section.classList.add('hidden');
    button.classList.add('hidden');
  };
  if (isInstalled()) {
    hide();
    return;
  }
  steps.innerHTML = stepsFor();
  let deferred: BeforeInstallPromptEvent | null = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
  });
  button.addEventListener('click', async () => {
    if (deferred) {
      const prompt = deferred;
      deferred = null;
      await prompt.prompt();
      if ((await prompt.userChoice).outcome === 'accepted') hide();
      return;
    }
    help.open = true;
    help.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
  window.addEventListener('appinstalled', hide);
}
