#!/usr/bin/env node
// Fetches the RSS feeds listed in feeds.json and writes an aggregated
// news.json for the web app. Zero dependencies — runs on plain Node 18+.
//
// Usage: node scripts/fetch-news.mjs [output-path]

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const outPath = process.argv[2] ?? join(here, "..", "site", "news.json");
const config = JSON.parse(readFileSync(join(here, "feeds.json"), "utf8"));

const FETCH_TIMEOUT_MS = 20_000;

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

// Pulls the text content of the first <tag>…</tag> inside a block,
// unwrapping CDATA if present.
function tagText(block, tag) {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  if (!m) return "";
  let text = m[1].trim();
  const cdata = text.match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/);
  if (cdata) text = cdata[1].trim();
  return decodeEntities(text);
}

function parseRss(xml) {
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

async function fetchFeed(url) {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { "user-agent": "AI-Daily-News/1.0 (personal feed aggregator)" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return parseRss(await res.text());
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

const categories = [];
let failures = 0;

for (const cat of config.categories) {
  const articles = [];
  for (const feed of cat.feeds) {
    try {
      articles.push(...(await fetchFeed(feed)));
      console.log(`ok   ${cat.id}: ${feed}`);
    } catch (err) {
      failures++;
      console.error(`FAIL ${cat.id}: ${feed}\n     ${err.message}`);
    }
  }
  const top = dedupe(articles)
    .sort((a, b) => (b.published ?? "").localeCompare(a.published ?? ""))
    .slice(0, config.maxPerCategory);
  categories.push({ id: cat.id, name: cat.name, articles: top });
}

const total = categories.reduce((n, c) => n + c.articles.length, 0);
if (total === 0) {
  console.error("No articles fetched from any feed — refusing to write an empty news.json");
  process.exit(1);
}

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(
  outPath,
  JSON.stringify({ updated: new Date().toISOString(), categories }, null, 1) + "\n"
);
console.log(`Wrote ${total} articles across ${categories.length} categories to ${outPath}`);
if (failures) console.warn(`${failures} feed(s) failed; continuing with partial data`);
