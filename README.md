# T-minus

A floating countdown to **6 December 2028, 00:00 IST**, with a daily news brief
behind the panel icon.

```
web/          the widget. one HTML, one CSS, one JS, fonts bundled. no build step.
src-tauri/    the Rust shell that makes it a real transparent always-on-top window
backend/      the daily brief builder. zero dependencies.
.github/      two workflows: the daily cron, and the Windows installer build
data/         what the cron writes. latest.json is what the widget reads.
```

Everything here is free forever. No server, no paid tier, no card.

---

## What actually floats, and where

| | always on top of everything? | how |
|---|---|---|
| Tauri desktop app | yes, over normal windows | frameless transparent window |
| Browser, Document PiP | yes, over normal windows | one click, no install |
| Android | yes, over literally everything | needs a real APK + overlay permission |
| iOS | **no, and never** | Apple has no overlay API. A home-screen widget is the ceiling. |

Exclusive-fullscreen games will cover the desktop widget on Windows. That's an
OS-level rule, not something the app can opt out of.

---

## 1. Run it right now, no setup

Open `web/index.html` in Chrome, Edge or Firefox. Press the window icon in the
top right. You get a real always-on-top floating window.

That's Document Picture-in-Picture. Desktop only. Chrome and Edge 130+,
Firefox has shipped it, Safari has not, and Chrome on Android does not have it.

---

## 2. Host the brief on GitHub Pages

The whole backend is "run a script once a day and write a 4 KB file". You do not
need Railway, Render, or any container. Railway in particular has no permanent
free tier any more: after a 30-day trial it's a $5/month minimum that you pay
even at zero usage.

**a.** Push this folder to a new **public** GitHub repo. Public matters: Actions
minutes are unlimited on public repos.

```bash
git init
git add -A
git commit -m "T-minus"
git branch -M main
git remote add origin https://github.com/<you>/tminus.git
git push -u origin main
```

**b.** Settings → Pages → Source: **Deploy from a branch**, branch `main`,
folder `/ (root)`. Save.

After a minute your brief is live at:

```
https://<you>.github.io/tminus/data/latest.json
```

GitHub Pages sends `Access-Control-Allow-Origin: *`, which is exactly what the
Tauri webview needs. No proxy, no CORS config.

**c.** Settings → Actions → General → Workflow permissions → **Read and write
permissions**. Without this the cron can't commit its own output.

**d.** Open `web/app.js` and set the URL:

```js
newsUrl: "https://<you>.github.io/tminus/data/latest.json",
```

Commit and push.

**e.** Actions tab → *Daily brief* → **Run workflow** to test it now instead of
waiting for midnight.

The cron is `15 19 * * *` UTC, which is 00:45 IST. GitHub's scheduler is
best-effort and runs 10 to 30 minutes late at peak, occasionally skipping a
run. That's handled: the widget always reads `latest.json`, never a date it
guessed would exist.

### Why it shows yesterday's news

Freezing each day at a calendar boundary makes the file immutable. It caches
forever, never reorders between two clicks, and costs one upstream fetch per
day instead of one per click. It also happens to be the only model the free
news tiers permit.

---

## 3. Optional: free AI summaries

Skip this and the brief still works, ranked by corroboration. Adding it gets
you a one-line summary under each headline.

Cloudflare Workers AI includes 10,000 neurons per day free, permanently, no
card. One call a day uses a rounding error of that.

1. Sign up at Cloudflare, copy your **Account ID** from the dashboard sidebar.
2. My Profile → API Tokens → Create Token → template **Workers AI**.
3. Repo Settings → Secrets and variables → Actions → New repository secret:
   - `CF_ACCOUNT_ID`
   - `CF_API_TOKEN`

Re-run the workflow. If the call fails for any reason the script falls back to
plain ranking rather than failing the build.

### How the ranking works

Naive aggregators pull the top 10 from one feed and return ten versions of the
same story. Two things prevent that here.

Titles are normalised, stripped of stopwords, and compared by token Jaccard
similarity; anything above 0.55 is treated as one story. Then **cluster size is
the primary sort key**: a story carried by five independent outlets is
objectively bigger than one carried by a single outlet, whatever that outlet's
own ranking claims. Hacker News points feed in as a secondary boost for tech
and AI.

Output is bucketed 3 India / 2 world / 2 AI / 2 tech / 1 science, so a loud AI
day can't swallow the whole brief. Change `QUOTA` in `backend/build-brief.mjs`.

Only headline, source, category, link and your own-words summary are stored.
Never article text. That keeps the payload under 4 KB and keeps you clear of
copyright entirely.

---

## 4. Build the Windows widget

### Locally

Install the [Rust toolchain](https://rustup.rs) and Microsoft **Visual Studio
Build Tools** with the *Desktop development with C++* workload. WebView2 is
already present on Windows 10 and 11.

```bash
cargo install tauri-cli --version "^2" --locked
cargo tauri dev      # live window
cargo tauri build    # produces the .msi and .exe installers
```

Installers land in `src-tauri/target/release/bundle/`.

### In CI

Push a tag and the workflow builds and attaches the installers to a GitHub
release:

```bash
git tag v1.0.0 && git push --tags
```

Or trigger *Windows build* manually from the Actions tab and grab the artifact.

### Controls

| | |
|---|---|
| Drag | grab anywhere on the top bar or the digits |
| `Ctrl+Alt+T` | show / hide |
| `Ctrl+Alt+G` | click-through ghost mode |
| Tray icon | show, ghost, start with Windows, quit |

Ghost mode makes mouse input pass straight through to whatever is underneath.
Because a click-through window can't receive the click that would switch it
back off, the toggle is a global shortcut and a tray item rather than a button.

The window is sized to the collapsed pill and grows before the panel expands,
so content is never clipped mid-transition.

---

## 5. Android, if you want it later

This is the only platform where "above literally everything" is fully true, and
it needs a real APK, not a PWA. `SYSTEM_ALERT_WINDOW` plus a foreground service
plus a `WindowManager` view at `TYPE_APPLICATION_OVERLAY`.

Two things to plan for. It's a special permission, so you can't request it at
runtime; you deep-link the user into Settings and they toggle it manually, and
it can be revoked later so you re-check periodically. And Xiaomi, Realme, Oppo
and Vivo all kill foreground services aggressively, so you'll need a
battery-optimisation exemption prompt and an autostart nag.

Sideload it or use Obtainium. Play Store review treats `SYSTEM_ALERT_WINDOW` as
sensitive and will want a justification.

---

## Notes on the countdown itself

**The Y:M:D math is the part everyone gets wrong.** You cannot derive it from a
millisecond delta, because months aren't a fixed length. The code finds the
largest whole month count `M` where `now + M months <= target`, then measures
the flat remainder. Anchoring at *now* rather than counting back from the target
is a deliberate convention; the two disagree at month ends. Under this one,
31 Jan to 28 Feb reads as exactly 1 month. Verified against 200,000 random
instants with zero round-trip failures.

India is UTC+05:30 all year with no DST ever, which removes the nastiest class
of bug here, so the code shifts the epoch by +5:30 and reads UTC fields to get
IST wall-clock directly.

**The tick never drifts.** No `setInterval` with a decrementing counter: that
drifts, background tabs get throttled to roughly once a minute, and laptop
sleep destroys it. Every tick recomputes from `Date.now()` and realigns itself
to the wall second, and `visibilitychange` forces an immediate recompute on
wake.

**Digits sit in fixed-width slots**, one element per digit, so nothing shifts as
values change regardless of whether the typeface has tabular figures. Only
digits that actually changed re-animate.

Change the target date in `CFG` at the top of `web/app.js`.

---

## Fonts

Chakra Petch for numerals, Inter Tight for interface text, both SIL Open Font
License, both latin subsets self-hosted in `web/fonts/` at 195 KB total. No CDN,
so the widget renders correctly offline inside Tauri.
