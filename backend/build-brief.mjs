#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════════
   build-brief.mjs
   Runs once a day in GitHub Actions. Fetches, dedupes, ranks and writes the
   day's top ten to data/latest.json plus a dated archive file.

   Zero dependencies on purpose: CI needs no install step, and there is no
   lockfile to rot.

   Why yesterday's news and not today's: freezing the window at a calendar
   boundary makes each day's file immutable. It can be cached forever, it
   never reorders between two clicks, and it costs exactly one upstream fetch
   per day instead of one per user click.
   ══════════════════════════════════════════════════════════════════════════ */

import { writeFile, mkdir } from 'node:fs/promises';

const IST = 330 * 60000;
const UA  = 'Mozilla/5.0 (compatible; tminus-brief/1.0; +https://github.com/)';

/* ── which day are we building ─────────────────────────────────────────────
   The IST calendar day that just ended. Run the Action shortly after IST
   midnight and this is "yesterday" from the reader's point of view.        */
const nowIst   = new Date(Date.now() + IST);
const dayEnd   = Date.UTC(nowIst.getUTCFullYear(), nowIst.getUTCMonth(), nowIst.getUTCDate()) - IST;
const dayStart = dayEnd - 86400000;
const DATE     = new Date(dayStart + IST).toISOString().slice(0, 10);

/* ── sources, all keyless ────────────────────────────────────────────────── */
const gnews = q =>
  `https://news.google.com/rss/search?q=${encodeURIComponent(q)}+when:2d&hl=en-IN&gl=IN&ceid=IN:en`;

const FEEDS = [
  { url: gnews('India'),                        category: 'india',   weight: 1.00 },
  { url: gnews('India policy OR economy OR ISRO OR government'), category: 'india', weight: 0.95 },
  { url: gnews('world news'),                   category: 'world',   weight: 1.00 },
  { url: gnews('geopolitics OR conflict OR summit'), category: 'world', weight: 0.90 },
  { url: gnews('artificial intelligence'),      category: 'ai',      weight: 1.00 },
  { url: gnews('science research discovery'),   category: 'science', weight: 0.85 },
  { url: gnews('technology'),                   category: 'tech',    weight: 0.95 },
  { url: gnews('software OR chips OR startup funding'), category: 'tech', weight: 0.85 },
  // Direct publisher feeds. Many big outlets 403 datacenter IPs, so these are
  // best-effort only; Google News proxies the same publishers and always works.
  { url: 'https://techcrunch.com/feed/',        category: 'tech',    weight: 0.85 },
];

/* Ten per bucket, so a loud AI day can't swallow the whole brief. */
const QUOTA = { india: 3, world: 2, ai: 2, tech: 2, science: 1 };

/* ── tiny RSS/Atom reader ─────────────────────────────────────────────────── */
const strip = s => String(s)
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/<[^>]*>/g, '')
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
  .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&nbsp;/g, ' ')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
  .replace(/\s+/g, ' ').trim();

const pick = (block, tag) => {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
  return m ? strip(m[1]) : '';
};

function parseFeed(xml) {
  const chunks = xml.match(/<(item|entry)\b[\s\S]*?<\/\1>/gi) || [];
  return chunks.map(c => {
    let link = pick(c, 'link');
    if (!link) {
      const href = c.match(/<link[^>]*href=["']([^"']+)["']/i);
      link = href ? href[1] : '';
    }
    const dateStr = pick(c, 'pubDate') || pick(c, 'published') || pick(c, 'updated');
    const ts = dateStr ? Date.parse(dateStr) : NaN;
    // Google News wraps the publisher name after a trailing dash
    let title = pick(c, 'title');
    let source = pick(c, 'source');
    // Google News appends " - Publisher" to every headline. Always strip it,
    // whether or not a <source> element was also present.
    const dash = title.match(/^(.{12,})\s+[-\u2013]\s+([^-\u2013]{2,45})$/);
    if (dash) { title = dash[1].trim(); source = source || dash[2].trim(); }
    title = title.replace(/\s*\|\s*[^|]{2,30}$/, '').trim();
    return { title, url: link, source, ts: Number.isNaN(ts) ? null : ts };
  }).filter(i => i.title && i.url);
}

async function grab(url, ms = 20000) {
  const ac = AbortSignal.timeout(ms);
  const r = await fetch(url, { headers: { 'user-agent': UA, accept: '*/*' }, signal: ac });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.text();
}

/* ── Hacker News, ranked by points, the best free tech/AI signal there is ── */
async function hn() {
  const url = 'https://hn.algolia.com/api/v1/search'
            + `?tags=story&numericFilters=created_at_i>${Math.floor(dayStart / 1000)}`
            + `,created_at_i<${Math.floor(dayEnd / 1000)},points>60&hitsPerPage=40`;
  try {
    const d = JSON.parse(await grab(url));
    return (d.hits || []).map(h => {
      const t = (h.title || '').toLowerCase();
      const ai = /\b(ai|llm|gpt|claude|gemini|model|neural|openai|anthropic|transformer|inference)\b/.test(t);
      return {
        title: h.title,
        url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
        source: 'Hacker News',
        ts: h.created_at_i * 1000,
        category: ai ? 'ai' : 'tech',
        weight: 0.9,
        boost: Math.min(2.2, Math.log10((h.points || 1) + 1)),
      };
    });
  } catch (e) {
    console.warn('hn failed:', e.message);
    return [];
  }
}

/* ── dedup ────────────────────────────────────────────────────────────────
   Normalise, drop stopwords, compare token sets by Jaccard. Anything over
   0.55 is the same story told twice.                                       */
const STOP = new Set(('a an and are as at be by for from has have in is it its of on or that the to with '
  + 'after before over under new says said will after amid into out up down about more than').split(' '));

const tokens = t => new Set(
  t.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/)
   .filter(w => w.length > 2 && !STOP.has(w))
);

function jaccard(a, b) {
  let hit = 0;
  for (const w of a) if (b.has(w)) hit++;
  const union = a.size + b.size - hit;
  return union ? hit / union : 0;
}

function cluster(items) {
  const out = [];
  for (const it of items) {
    it.tok = tokens(it.title);
    if (it.tok.size < 2) continue;
    const found = out.find(c => jaccard(c.tok, it.tok) >= 0.55);
    if (found) {
      found.members.push(it);
      found.sources.add(it.source || 'unknown');
      // keep the shortest headline; wire copy is usually the cleanest
      if (it.title.length < found.title.length) { found.title = it.title; found.url = it.url; }
      if ((it.boost || 0) > (found.boost || 0)) found.boost = it.boost;
    } else {
      out.push({
        title: it.title, url: it.url, tok: it.tok,
        category: it.category, weight: it.weight, ts: it.ts,
        boost: it.boost || 0,
        sources: new Set([it.source || 'unknown']),
        members: [it],
      });
    }
  }
  return out;
}

/* ── scoring ──────────────────────────────────────────────────────────────
   Corroboration is the primary signal. A story carried by five independent
   outlets is objectively bigger than one carried by a single outlet, whatever
   that outlet's own ranking says.                                           */
function score(c) {
  const corroboration = Math.pow(c.sources.size, 1.35);
  const recency = c.ts ? Math.max(0, 1 - (dayEnd - c.ts) / 86400000) * 0.4 : 0.15;
  return corroboration * (c.weight ?? 0.9) + (c.boost || 0) + recency;
}

/* ── optional free curation pass ──────────────────────────────────────────
   Cloudflare Workers AI gives 10,000 neurons a day free, forever. One call a
   day will never come close. Skipped entirely if the secrets aren't set, and
   a failure here is never fatal: corroboration ranking alone is already good.
                                                                             */
async function curate(cands) {
  const id = process.env.CF_ACCOUNT_ID, tok = process.env.CF_API_TOKEN;
  if (!id || !tok) { console.log('no CF credentials, skipping LLM pass'); return null; }

  const menu = cands.map((c, i) =>
    `${i}. [${c.category}] ${c.title} (${c.sources.size} sources)`).join('\n');

  const prompt =
`Below are candidate news stories from ${DATE}. Choose the 10 most important and
write a one-sentence summary of each in your own words. Do not copy headline
wording. Aim for a mix across categories.

${menu}

Reply with JSON only, no markdown fence:
{"items":[{"i":<index>,"summary":"<one sentence>"}]}`;

  try {
    const r = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${id}/ai/run/@cf/meta/llama-3.1-8b-instruct`,
      {
        method: 'POST',
        headers: { authorization: `Bearer ${tok}`, 'content-type': 'application/json' },
        body: JSON.stringify({ max_tokens: 1400, messages: [{ role: 'user', content: prompt }] }),
        signal: AbortSignal.timeout(60000),
      });
    const j = await r.json();
    const text = j?.result?.response ?? '';
    const parsed = JSON.parse(text.replace(/```json|```/g, '').trim());
    if (!Array.isArray(parsed.items)) return null;
    console.log('LLM curation ok');
    return parsed.items;
  } catch (e) {
    console.warn('LLM pass failed, falling back to ranking:', e.message);
    return null;
  }
}

/* ── main ─────────────────────────────────────────────────────────────────── */
const inWindow = it => it.ts == null || (it.ts >= dayStart - 43200000 && it.ts <= dayEnd + 3600000);

async function main() {
  const settled = await Promise.allSettled(FEEDS.map(async f => {
    const items = parseFeed(await grab(f.url));
    return items.map(i => ({ ...i, category: f.category, weight: f.weight }));
  }));

  let raw = [];
  settled.forEach((r, i) => {
    if (r.status === 'fulfilled') { raw.push(...r.value); }
    else console.warn('feed failed:', FEEDS[i].url, r.reason?.message);
  });
  raw.push(...await hn());

  raw = raw.filter(inWindow);
  console.log(`collected ${raw.length} raw items`);
  if (!raw.length) { console.error('nothing collected, leaving previous file alone'); process.exit(1); }

  const clusters = cluster(raw).sort((a, b) => score(b) - score(a));
  console.log(`${clusters.length} clusters after dedup`);

  // fill quotas first, then top up from whatever is left
  const chosen = [], used = new Set();
  for (const [cat, n] of Object.entries(QUOTA)) {
    let k = 0;
    for (const c of clusters) {
      if (k >= n || used.has(c) || c.category !== cat) continue;
      chosen.push(c); used.add(c); k++;
    }
  }
  for (const c of clusters) {
    if (chosen.length >= 10) break;
    if (!used.has(c)) { chosen.push(c); used.add(c); }
  }
  chosen.sort((a, b) => score(b) - score(a));

  const summaries = await curate(chosen.slice(0, 18));
  const byIndex = new Map((summaries || []).map(s => [s.i, s.summary]));

  const items = chosen.slice(0, 10).map((c, i) => ({
    title: c.title,
    // headline + link only, never article text: small payload and legally clean
    summary: byIndex.get(i) || null,
    source: [...c.sources].slice(0, 2).join(', '),
    corroboration: c.sources.size,
    category: c.category,
    url: c.url,
  }));

  const payload = {
    date: DATE,
    label: summaries ? null : 'ranked',
    generatedAt: new Date().toISOString(),
    window: { from: new Date(dayStart).toISOString(), to: new Date(dayEnd).toISOString() },
    items,
  };

  await mkdir('data/archive', { recursive: true });
  await writeFile('data/latest.json', JSON.stringify(payload, null, 2));
  await writeFile(`data/archive/${DATE}.json`, JSON.stringify(payload, null, 2));
  console.log(`\nwrote ${items.length} items for ${DATE}`);
  items.forEach((it, i) => console.log(`  ${i + 1}. [${it.category}] ${it.title}`));
}

main().catch(e => { console.error(e); process.exit(1); });
