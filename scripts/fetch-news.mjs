#!/usr/bin/env node
// Fetches the feeds listed in feeds.json and writes an aggregated news.json
// for the web app. Handles both RSS (Google News) and Atom (Reddit) feeds.
// Zero dependencies — runs on plain Node 18+.
//
// Usage: node scripts/fetch-news.mjs [output-path]

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const outPath = process.argv[2] ?? join(here, "..", "site", "news.json");
const config = JSON.parse(readFileSync(join(here, "feeds.json"), "utf8"));

const FETCH_TIMEOUT_MS = 20_000;
const CONCURRENCY = 8;

function decodeEntities(text) {
  return text
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function tagText(block, tag) {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  if (!m) return "";
  let text = m[1].trim();
  const cdata = text.match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/);
  if (cdata) text = cdata[1].trim();
  return decodeEntities(text);
}

function parseRssItems(xml) {
  const items = [];
  for (const [, block] of xml.matchAll(/<item[\s>]([\s\S]*?)<\/item>/gi)) {
    const source = tagText(block, "source");
    let title = tagText(block, "title");
    // Google News appends " - Publisher" to titles; drop it when it
    // duplicates the <source> element so headlines stay compact.
    if (source && title.endsWith(` - ${source}`)) {
      title = title.slice(0, -(source.length + 3)).trim();
    }
    const url = tagText(block, "link");
    const pubDate = tagText(block, "pubDate");
    const published = pubDate ? new Date(pubDate) : null;
    if (!title || !url) continue;
    items.push({
      title,
      url,
      source: source || null,
      published: published && !isNaN(published) ? published.toISOString() : null,
    });
  }
  return items;
}

function parseAtomEntries(xml, feedUrl) {
  // Reddit feeds are Atom. Source label = "r/<subreddit>" from the URL.
  const subMatch = feedUrl.match(/reddit\.com\/(r\/[^/]+)/i);
  const source = subMatch ? subMatch[1] : null;
  const items = [];
  for (const [, block] of xml.matchAll(/<entry[\s>]([\s\S]*?)<\/entry>/gi)) {
    const title = tagText(block, "title");
    const linkM = block.match(/<link[^>]*href="([^"]+)"/i);
    const url = linkM ? decodeEntities(linkM[1]) : "";
    const updated = tagText(block, "updated") || tagText(block, "published");
    const published = updated ? new Date(updated) : null;
    if (!title || !url) continue;
    items.push({
      title,
      url,
      source,
      published: published && !isNaN(published) ? published.toISOString() : null,
    });
  }
  return items;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const UA = "ai-daily-news:v1.0 (personal RSS reader)";

// Reddit blocks unauthenticated requests from datacenter IPs (like CI
// runners), so when REDDIT_CLIENT_ID / REDDIT_CLIENT_SECRET are set we use
// the official OAuth API instead of the public RSS feeds. Without
// credentials we still try RSS, throttled — it works from residential IPs.
let redditToken = null;

async function getRedditToken() {
  const id = process.env.REDDIT_CLIENT_ID;
  const secret = process.env.REDDIT_CLIENT_SECRET;
  if (!id || !secret) return null;
  if (redditToken) return redditToken;
  const res = await fetch("https://www.reddit.com/api/v1/access_token", {
    method: "POST",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: {
      authorization: "Basic " + Buffer.from(`${id}:${secret}`).toString("base64"),
      "content-type": "application/x-www-form-urlencoded",
      "user-agent": UA,
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new Error(`Reddit token request failed: HTTP ${res.status}`);
  redditToken = (await res.json()).access_token;
  return redditToken;
}

async function fetchRedditApi(rssUrl, type) {
  const m = rssUrl.match(/reddit\.com\/r\/([^/]+)\/top\/\.rss\?t=(\w+)/i);
  if (!m) throw new Error(`Unrecognized reddit feed URL: ${rssUrl}`);
  const [, sub, t] = m;
  const token = await getRedditToken();
  const res = await fetch(`https://oauth.reddit.com/r/${sub}/top?t=${t}&limit=25`, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { authorization: `Bearer ${token}`, "user-agent": UA },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  return (json.data?.children ?? [])
    .map((c) => c.data)
    .filter((d) => d && d.title && d.permalink)
    .map((d) => ({
      title: decodeEntities(d.title),
      url: `https://www.reddit.com${d.permalink}`,
      source: d.subreddit_name_prefixed ?? `r/${sub}`,
      published: d.created_utc ? new Date(d.created_utc * 1000).toISOString() : null,
      sourceType: type,
    }));
}

// Unauthenticated reddit RSS goes through a single-file queue with a gap
// between requests and retries, since bursts get rate-limited (403).
let redditQueue = Promise.resolve();
const REDDIT_GAP_MS = 1200;

function fetchOnce(url) {
  return fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { "user-agent": UA },
  });
}

async function fetchThrottledRss(url) {
  const turn = redditQueue.then(async () => {
    for (let attempt = 0; ; attempt++) {
      const res = await fetchOnce(url);
      if (res.ok || attempt >= 2 || (res.status !== 403 && res.status !== 429)) {
        await sleep(REDDIT_GAP_MS);
        return res;
      }
      await sleep(REDDIT_GAP_MS * (attempt + 2));
    }
  });
  // keep the queue moving even if this request ultimately fails
  redditQueue = turn.then(() => {}, () => {});
  return turn;
}

async function fetchFeed({ url, type, label }) {
  const isReddit = /reddit\.com/i.test(url);
  if (isReddit && process.env.REDDIT_CLIENT_ID && process.env.REDDIT_CLIENT_SECRET) {
    return fetchRedditApi(url, type);
  }
  const res = isReddit ? await fetchThrottledRss(url) : await fetchOnce(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const xml = await res.text();
  const items = /<feed[\s>]/i.test(xml.slice(0, 2000))
    ? parseAtomEntries(xml, url)
    : parseRssItems(xml);
  return items.map((a) => ({ ...a, source: a.source ?? label ?? null, sourceType: type }));
}

async function mapLimit(jobs, limit, fn) {
  const results = new Array(jobs.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, jobs.length) }, async () => {
      while (next < jobs.length) {
        const i = next++;
        results[i] = await fn(jobs[i]);
      }
    })
  );
  return results;
}

function dedupe(articles) {
  const seen = new Set();
  return articles.filter((a) => {
    const key = a.title.toLowerCase().replace(/\W+/g, " ").trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Flatten all feeds into one job list so the concurrency cap is global.
const jobs = [];
for (const group of config.groups) {
  for (const sub of group.subs) {
    for (const feed of sub.feeds) {
      jobs.push({ group, sub, feed });
    }
  }
}

let failures = 0;
const fetched = await mapLimit(jobs, CONCURRENCY, async (job) => {
  try {
    const items = await fetchFeed(job.feed);
    console.log(`ok   ${job.sub.id} [${job.feed.type}] ${items.length} items`);
    return items;
  } catch (err) {
    failures++;
    console.error(`FAIL ${job.sub.id} [${job.feed.type}] ${job.feed.url}\n     ${err.message}`);
    return [];
  }
});

const groups = config.groups.map((group) => ({
  id: group.id,
  name: group.name,
  subs: group.subs.map((sub) => {
    const articles = jobs
      .flatMap((job, i) => (job.sub === sub ? fetched[i] : []))
      .sort((a, b) => (b.published ?? "").localeCompare(a.published ?? ""));
    // Cap per source type so one type can't push the other out entirely.
    const byType = { authoritative: [], public: [] };
    for (const a of dedupe(articles)) {
      (byType[a.sourceType] ??= []).push(a);
    }
    const top = dedupe(
      [...byType.authoritative.slice(0, config.maxPerSubcategory), ...byType.public.slice(0, config.maxPerSubcategory)]
    ).sort((a, b) => (b.published ?? "").localeCompare(a.published ?? ""));
    return { id: sub.id, name: sub.name, articles: top };
  }),
}));

const total = groups.reduce((n, g) => n + g.subs.reduce((m, s) => m + s.articles.length, 0), 0);
if (total === 0) {
  console.error("No articles fetched from any feed — refusing to write an empty news.json");
  process.exit(1);
}

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify({ updated: new Date().toISOString(), groups }) + "\n");
console.log(`Wrote ${total} articles across ${groups.length} groups to ${outPath}`);
if (failures) console.warn(`${failures} feed(s) failed; continuing with partial data`);
