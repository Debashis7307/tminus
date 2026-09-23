/* ══════════════════════════════════════════════════════════════════════════
   T-minus
   One file drives three shells: an ordinary web page, a Document
   Picture-in-Picture window, and the Tauri desktop widget.
   ══════════════════════════════════════════════════════════════════════════ */

window.addEventListener('error', e => {
  const d = document.createElement('pre');
  d.style.cssText = 'position:fixed;bottom:4px;left:4px;right:4px;font:11px monospace;background:#1a0606;color:#ff9080;padding:6px;border-radius:6px;z-index:999;white-space:pre-wrap';
  d.textContent = 'JS ERROR: ' + (e.message || '?') + (e.filename ? ' @ ' + e.filename.split('/').pop() + ':' + e.lineno : '');
  document.body.appendChild(d);
});

window.addEventListener('securitypolicyviolation', e => {
  const d = document.createElement('pre');
  d.style.cssText = 'position:fixed;top:4px;left:4px;right:4px;font:11px monospace;background:#3a0606;color:#ff9080;padding:6px;border-radius:6px;z-index:999;white-space:pre-wrap';
  d.textContent = 'CSP BLOCKED: ' + e.blockedURI + ' | directive: ' + e.violatedDirective + ' | sample: ' + e.sample;
  document.body.appendChild(d);
});

const CFG = {
  // 6 December 2028, 00:00 IST
  target: { y: 2028, mo: 12, d: 6, h: 0, mi: 0, s: 0 },
  // anchor for the elapsed hairline
  start:  { y: 2026, mo: 9,  d: 21, h: 0, mi: 0, s: 0 },
  newsUrl: "https://debashis7307.github.io/tminus/data/latest.json",
};

/* ══════════════════════════════════════════════════════════════════════════
   CALENDAR MATH
   ══════════════════════════════════════════════════════════════════════════ */
const IST = 330 * 60000;

const ist     = ms => new Date(ms + IST);
const fromIst = (y, mo, d, h, mi, s) => Date.UTC(y, mo - 1, d, h, mi, s) - IST;
const dim     = (y, mo) => new Date(Date.UTC(y, mo, 0)).getUTCDate();

function addMonths(baseMs, k) {
  const b = ist(baseMs);
  let y = b.getUTCFullYear();
  let mo = b.getUTCMonth() + 1 + k;
  y += Math.floor((mo - 1) / 12);
  mo = ((mo - 1) % 12 + 12) % 12 + 1;
  return fromIst(y, mo, Math.min(b.getUTCDate(), dim(y, mo)),
                 b.getUTCHours(), b.getUTCMinutes(), b.getUTCSeconds());
}

function breakdown(nowMs, targetMs) {
  if (targetMs <= nowMs) return { y:0, mo:0, d:0, h:0, mi:0, s:0, done:true };

  const n = ist(nowMs), t = ist(targetMs);
  let m = (t.getUTCFullYear() - n.getUTCFullYear()) * 12
        + (t.getUTCMonth()    - n.getUTCMonth());
  if (m < 0) m = 0;
  while (m > 0 && addMonths(nowMs, m) > targetMs) m--;
  while (addMonths(nowMs, m + 1) <= targetMs) m++;

  let r = targetMs - addMonths(nowMs, m);
  const d  = Math.floor(r / 86400000); r -= d  * 86400000;
  const h  = Math.floor(r /  3600000); r -= h  *  3600000;
  const mi = Math.floor(r /    60000); r -= mi *    60000;
  const s  = Math.floor(r /     1000);

  return { y: Math.floor(m / 12), mo: m % 12, d, h, mi, s, done:false };
}

const T = CFG.target, S = CFG.start;
const TARGET_MS = fromIst(T.y, T.mo, T.d, T.h, T.mi, T.s);
const START_MS  = fromIst(S.y, S.mo, S.d, S.h, S.mi, S.s);

/* ══════════════════════════════════════════════════════════════════════════
   DIGIT SLOTS
   ══════════════════════════════════════════════════════════════════════════ */
const WIDTHS = { y:3, mo:2, d:2, h:2, mi:2, s:2 };
let root = document;
let slots = {};

function buildSlots() {
  slots = {};
  for (const key of Object.keys(WIDTHS)) {
    const host = root.getElementById('s-' + key);
    if (!host) continue;
    host.textContent = '';
    slots[key] = [];
    for (let i = 0; i < WIDTHS[key]; i++) {
      const el = root.createElement('span');
      el.className = 'slot';
      el.textContent = '0';
      host.appendChild(el);
      slots[key].push({ el, v: null });
    }
  }
}

function paint(key, value) {
  const str = String(value).padStart(WIDTHS[key], '0');
  const row = slots[key];
  if (!row) return;
  for (let i = 0; i < row.length; i++) {
    const ch = str[i];
    if (row[i].v === ch) continue;
    row[i].v = ch;
    const el = row[i].el;
    el.textContent = ch;
    el.classList.remove('roll');
    void el.offsetWidth;
    el.classList.add('roll');
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   TICK
   ══════════════════════════════════════════════════════════════════════════ */
let timer = null;

function render() {
  const b = breakdown(Date.now(), TARGET_MS);
  paint('y', b.y); paint('mo', b.mo); paint('d', b.d);
  paint('h', b.h); paint('mi', b.mi); paint('s', b.s);

  const frac = Math.min(1, Math.max(0, (Date.now() - START_MS) / (TARGET_MS - START_MS)));
  const bar = root.getElementById('elapsed');
  const pct = root.getElementById('pct');
  if (bar) bar.style.width = (frac * 100).toFixed(4) + '%';
  if (pct) pct.textContent = (frac * 100).toFixed(2) + '%';
}

function loop() {
  render();
  clearTimeout(timer);
  timer = setTimeout(loop, 1000 - (Date.now() % 1000) + 4);
}

['visibilitychange', 'focus', 'pageshow'].forEach(ev =>
  window.addEventListener(ev, () => { if (!document.hidden) loop(); })
);

/* ══════════════════════════════════════════════════════════════════════════
   DAILY BRIEF
   ══════════════════════════════════════════════════════════════════════════ */
const CACHE_KEY = 'tminus.brief.v1';
let brief = null;

const esc = s => String(s ?? '').replace(/[&<>"']/g,
  c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

function readCache() { try { return JSON.parse(localStorage.getItem(CACHE_KEY)); } catch { return null; } }
function writeCache(d) { try { localStorage.setItem(CACHE_KEY, JSON.stringify(d)); } catch {} }

async function loadBrief(force) {
  if (!brief) { brief = readCache(); paintBrief(); }
  if (!CFG.newsUrl) { paintBrief(); return; }

  const btn = root.getElementById('btn-refresh');
  if (btn) btn.classList.add('spin');
  try {
    const res = await fetch(CFG.newsUrl + (force ? '?t=' + Date.now() : ''), { cache: 'no-store' });
    if (!res.ok) throw new Error(res.status);
    const data = await res.json();
    if (data && Array.isArray(data.items)) { brief = data; writeCache(data); paintBrief(); }
  } catch {
    /* keep cache; offline widget still shows yesterday */
  } finally {
    if (btn) btn.classList.remove('spin');
  }
}

function paintBrief() {
  const list = root.getElementById('list');
  const time = root.getElementById('brief-date');
  const tag  = root.getElementById('tag');
  if (!list) return;

  if (!brief || !brief.items || !brief.items.length) {
    if (tag) tag.hidden = true;
    if (time) time.textContent = '';
    list.innerHTML =
      '<div class="empty"><strong>No brief connected yet.</strong>' +
      'Set <code>newsUrl</code> in <code>app.js</code> to your published endpoint. ' +
      'Expected shape: <code>{ date, items: [ { title, summary, source, url, category } ] }</code></div>';
    return;
  }

  if (tag) { tag.hidden = !brief.label; tag.textContent = brief.label || ''; }
  if (time) time.textContent = brief.date || '';

  list.innerHTML = brief.items.slice(0, 10).map((it, i) => `
    <a class="item" href="${esc(it.url || '#')}" target="_blank" rel="noopener noreferrer">
      <span class="rank">${String(i + 1).padStart(2, '0')}</span>
      <span>
        <span class="hl">${esc(it.title)}</span>
        ${it.summary ? `<span class="sum">${esc(it.summary)}</span>` : ''}
        <span class="meta">
          ${it.category ? `<span class="cat">${esc(it.category)}</span><i class="dot"></i>` : ''}
          <span>${esc(it.source)}</span>
        </span>
      </span>
    </a>`).join('');
}

/* ══════════════════════════════════════════════════════════════════════════
   TAURI BRIDGE
   ══════════════════════════════════════════════════════════════════════════ */
const isTauri = () => window.isTauri === true
  || typeof window.__TAURI_INTERNALS__ !== 'undefined'
  || typeof window.__TAURI__ !== 'undefined';

const invoke = (cmd, args) => {
  if (window.__TAURI__ && window.__TAURI__.core && window.__TAURI__.core.invoke) {
    return window.__TAURI__.core.invoke(cmd, args);
  }
  if (window.__TAURI_INTERNALS__ && window.__TAURI_INTERNALS__.invoke) {
    return window.__TAURI_INTERNALS__.invoke(cmd, args);
  }
  return Promise.reject(new Error('no Tauri IPC'));
};

const COLLAPSED = 58;
const EXPANDED  = 460;

async function tauriResize(h) {
  if (!isTauri()) return;
  try { await invoke('resize_height', { h }); } catch {}
}

async function setOpen(open) {
  const panel = root.getElementById('panel');
  const btn   = root.getElementById('btn-news');
  if (!panel) return;
  if (open) {
    await tauriResize(EXPANDED);
    panel.classList.add('open');
  } else {
    panel.classList.remove('open');
    setTimeout(() => tauriResize(COLLAPSED), 310);
  }
  if (btn) btn.setAttribute('aria-expanded', String(open));
}

/* ══════════════════════════════════════════════════════════════════════════
   DOCUMENT PICTURE-IN-PICTURE
   ══════════════════════════════════════════════════════════════════════════ */
async function openPip() {
  if (!('documentPictureInPicture' in window)) {
    const list = root.getElementById('list');
    if (list) list.innerHTML =
      '<div class="empty"><strong>Floating window unavailable here.</strong>' +
      'This browser has no Document Picture-in-Picture support. Use Chrome, Edge or ' +
      'Firefox on desktop, or build the Tauri app for a frameless transparent widget.</div>';
    setOpen(true);
    return;
  }

  const pip = await documentPictureInPicture.requestWindow({ width: 420, height: 58 });

  for (const node of document.head.querySelectorAll('style,link[rel="stylesheet"]')) {
    const clone = node.cloneNode(true);
    if (clone.tagName === 'LINK' && clone.getAttribute('href')) {
      clone.setAttribute('href', new URL(clone.getAttribute('href'), location.href).href);
    }
    pip.document.head.appendChild(clone);
  }
  pip.document.title = 'T-minus';
  pip.document.body.className = '';

  const shell  = document.getElementById('shell');
  if (!shell) return;
  const anchor = document.createComment('tminus');
  shell.replaceWith(anchor);
  pip.document.body.appendChild(shell);

  root = pip.document;
  mount();

  pip.addEventListener('pagehide', () => {
    anchor.replaceWith(shell);
    root = document;
    mount();
  });
}

/* ══════════════════════════════════════════════════════════════════════════
   MOUNT
   ══════════════════════════════════════════════════════════════════════════ */
function mount() {
  buildSlots();

  const news = root.getElementById('btn-news');
  if (news) news.onclick = () => setOpen(!root.getElementById('panel').classList.contains('open'));

  const pip = root.getElementById('btn-pip');
  if (pip) {
    pip.onclick = openPip;
    pip.hidden = isTauri();
  }

  const ref = root.getElementById('btn-refresh');
  if (ref) ref.onclick = () => loadBrief(true);

  const close = root.getElementById('btn-close');
  if (close) {
    close.hidden = !isTauri();
    close.onclick = () => invoke('hide_widget');
  }

  const pageBtn = root.getElementById('page-float-btn');
  if (pageBtn) pageBtn.onclick = openPip;

  paintBrief();
  loop();
}

if (isTauri()) {
  document.body.classList.remove('page');
  document.body.classList.add('tauri');
  const p = document.querySelector('.page-cta');
  if (p) p.remove();
}

try {
  mount();
} catch (err) {
  const d = document.createElement('pre');
  d.style.cssText = 'position:fixed;top:4px;left:4px;right:4px;font:11px monospace;background:#3a0606;color:#ff9080;padding:6px;border-radius:6px;z-index:999;white-space:pre-wrap';
  d.textContent = 'mount() FAILED: ' + (err && err.stack || err);
  document.body.appendChild(d);
}

loadBrief();