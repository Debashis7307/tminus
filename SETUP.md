# Setup, step by step

Follow these in order. Nothing here costs money at any point.

---

## Step 0 — See it working right now (30 seconds)

Double-click **`countdown-standalone.html`**. It opens in your browser.

Press the **window icon** in the top-right of the widget. A real floating
always-on-top window pops out. Drag it anywhere, put any app in front of it,
it stays on top.

Use Chrome, Edge or Firefox. Safari does not support this.

That single file has everything baked in, fonts included. You can email it to
yourself and it still works. The news panel says "not connected yet" because
you haven't done Step 2.

---

## Step 1 — Install what you need

Only needed for the desktop app and the news backend. Skip if you just want
Step 0.

| Tool | Where | Why |
|---|---|---|
| Node 20+ | nodejs.org | runs the news script |
| Rust | rustup.rs | builds the widget |
| VS Build Tools | visualstudio.microsoft.com/downloads | Rust needs a C++ linker on Windows |

For Build Tools, tick the **"Desktop development with C++"** workload. Nothing
else. It's a big download, around 3 GB. WebView2 is already on your Windows,
you don't install it.

Check it worked:

```bash
node -v
cargo -V
```

---

## Step 2 — Get the news brief running

### 2a. Put the code on GitHub

Make a **public** repo. Public matters, because Actions minutes are unlimited
on public repos and metered on private ones.

```bash
cd tminus
git init
git add -A
git commit -m "T-minus"
git branch -M main
git remote add origin https://github.com/YOURNAME/tminus.git
git push -u origin main
```

### 2b. Let the robot write to your repo

Repo → **Settings** → **Actions** → **General** → scroll to **Workflow
permissions** → pick **Read and write permissions** → Save.

Miss this and the daily job runs fine but can't save its own output.

### 2c. Turn on hosting

Repo → **Settings** → **Pages** → Source: **Deploy from a branch** → branch
`main`, folder `/ (root)` → Save.

Wait about a minute. Your news file is now live at:

```
https://YOURNAME.github.io/tminus/data/latest.json
```

Open that URL in a browser to confirm. You should see JSON.

### 2d. Run the job once, by hand

Repo → **Actions** tab → **Daily brief** in the left sidebar → **Run workflow**
button → **Run workflow**.

Takes about 40 seconds. When it goes green, refresh your `latest.json` URL and
you'll see today's ten stories.

From now on it runs itself every night at **00:45 IST** and you never touch it
again.

### 2e. Point the widget at it

Open `web/app.js`. Line 12ish. Change:

```js
newsUrl: null,
```

to:

```js
newsUrl: "https://YOURNAME.github.io/tminus/data/latest.json",
```

Save, commit, push. Now clicking the panel icon shows real news.

---

## Step 3 — Build the Windows widget

```bash
cargo install tauri-cli --version "^2" --locked
```

That takes a few minutes the first time. Then:

```bash
cargo tauri dev
```

The widget appears in the top-left of your screen. Frameless, transparent,
floating above everything. This is live-reload mode, so edit anything in `web/`
and it updates instantly.

When you're happy with it:

```bash
cargo tauri build
```

Your installer is at:

```
src-tauri/target/release/bundle/msi/T-minus_1.0.0_x64_en-US.msi
```

Run it. Done. It's a normal installed Windows app now.

### How to use it

| | |
|---|---|
| Move it | drag the top bar or the digits |
| `Ctrl+Alt+T` | hide it / bring it back |
| `Ctrl+Alt+G` | ghost mode, clicks pass straight through it |
| Right-click tray icon | show, ghost, start with Windows, quit |

Turn on **Start with Windows** from the tray menu once and it's there forever.

If you turn on ghost mode you cannot click the widget to turn it off again,
because the clicks go through it. That's why it's a keyboard shortcut. Press
`Ctrl+Alt+G` again.

---

## Step 4 — Optional: free AI summaries

Without this, each story is just a headline. With it, each gets a one-line
summary. It's free and stays free.

1. Sign up at **cloudflare.com**. Free account, no card.
2. Dashboard sidebar → copy your **Account ID**.
3. Top-right profile → **API Tokens** → **Create Token** → use the
   **Workers AI** template → Create → copy the token.
4. Your repo → **Settings** → **Secrets and variables** → **Actions** →
   **New repository secret**, twice:
   - Name `CF_ACCOUNT_ID`, value = your account ID
   - Name `CF_API_TOKEN`, value = your token
5. Actions tab → **Daily brief** → **Run workflow** again.

You get 10,000 free units a day. One run a day uses almost none of it. If the
call ever fails the script quietly falls back to plain ranking instead of
breaking.

---

## Step 5 — Make it yours

**Change the date.** `web/app.js`, top of the file:

```js
target: { y: 2028, mo: 12, d: 6, h: 0, mi: 0, s: 0 },
```

**Change the colour.** `web/style.css`, find `--amber: #ffb347`. Try `#5eead4`
for cyan or `#a78bfa` for violet. It's used in exactly four places so one edit
changes the whole widget.

**Change the news mix.** `backend/build-brief.mjs`, find:

```js
const QUOTA = { india: 3, world: 2, ai: 2, tech: 2, science: 1 };
```

Must add up to 10. Want all tech? `{ tech: 6, ai: 4 }`.

**Change where it starts on screen.** `src-tauri/tauri.conf.json`, the `"x"` and
`"y"` values.

---

## If something breaks

**Widget is invisible after `cargo tauri build`.** It launches at x:48 y:48,
top-left. It's also hidden from the taskbar on purpose. Press `Ctrl+Alt+T`.

**News panel says "not connected".** You skipped Step 2e, or the URL is wrong.
Open the URL in a browser first and confirm it returns JSON.

**Daily brief job fails with a permissions error.** Step 2b.

**Job ran but the site still shows old news.** GitHub Pages takes a minute to
redeploy after each commit. Also hard-refresh.

**Cron didn't fire at 00:45.** GitHub's scheduler is best-effort and runs 10 to
30 minutes late at busy times, and occasionally skips a night entirely. This is
normal and handled: the widget reads whatever the newest file is, so a skipped
night just means yesterday's brief stays up.

**A news source stopped working.** Expected over time; feeds move and sites
change paths. The script treats every feed as best-effort and carries on with
whatever answered. Check the Actions log for which one 403'd.

**`cargo tauri build` fails with a linker error.** Missing the C++ workload in
Step 1.

---

## One thing that is not possible

There is no way to make this float on **iPhone**. Apple provides no overlay API
and never has. Any app claiming otherwise is a home-screen widget, which is a
different thing. Android can do it properly, but it needs a separate native APK
rather than this codebase.
