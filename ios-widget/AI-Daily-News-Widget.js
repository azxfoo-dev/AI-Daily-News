// AI Daily News — Scriptable widget (iOS)
// Shows the latest headline(s) on your lock screen or home screen.
// Tapping the widget opens the full AI Daily News page.
//
// Setup:
//   1. Install the free "Scriptable" app from the App Store.
//   2. In Scriptable, create a new script named "AI Daily News" and paste this file in.
//   3. Lock screen: long-press the lock screen > Customize > add a rectangular
//      widget > pick Scriptable > choose this script.
//   4. Home screen: long-press home screen > add Scriptable widget (small or
//      medium) > long-press it > Edit Widget > choose this script.

const PAGE_URL = "https://azxfoo-dev.github.io/AI-Daily-News/";
const DATA_URL = PAGE_URL + "news.json";

// Which topics to rotate through on the lock screen (in priority order).
// Topic ids come from scripts/feeds.json — e.g. "ai-ml", "us-politics",
// "markets", "europe", "pro-sports", "movies-tv".
const LOCK_SCREEN_CATEGORIES = ["ai-ml", "us-politics", "europe"];

async function getNews() {
  const req = new Request(DATA_URL + "?t=" + Date.now());
  return await req.loadJSON();
}

function pickHeadlines(data, ids, count) {
  // news.json groups topics under main categories; flatten to find by id.
  const subs = (data.groups ?? []).flatMap((g) => g.subs ?? []);
  const chosen = [];
  for (const id of ids) {
    const cat = subs.find((s) => s.id === id);
    if (cat) chosen.push(...cat.articles.map((a) => ({ ...a, cat: cat.name })));
  }
  // Rotate the starting article every 15 minutes so the lock screen cycles.
  const offset = Math.floor(Date.now() / (15 * 60 * 1000)) % Math.max(chosen.length, 1);
  return chosen.slice(offset).concat(chosen.slice(0, offset)).slice(0, count);
}

function relTime(iso) {
  if (!iso) return "";
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 60) return mins + "m";
  const hours = Math.round(mins / 60);
  return hours < 24 ? hours + "h" : Math.round(hours / 24) + "d";
}

async function makeWidget() {
  const w = new ListWidget();
  w.url = PAGE_URL; // tap anywhere -> open the full page
  const family = config.widgetFamily || "accessoryRectangular";

  let data;
  try {
    data = await getNews();
  } catch (e) {
    const t = w.addText("AI Daily News: offline");
    t.font = Font.mediumSystemFont(12);
    return w;
  }

  if (family === "accessoryRectangular" || family === "accessoryInline") {
    // Lock screen: one headline, compact.
    const [top] = pickHeadlines(data, LOCK_SCREEN_CATEGORIES, 1);
    if (family === "accessoryInline") {
      w.addText("📰 " + (top ? top.title : "No news"));
      return w;
    }
    const header = w.addText((top ? top.cat : "News") + " · " + relTime(top && top.published));
    header.font = Font.mediumSystemFont(10);
    header.textOpacity = 0.7;
    w.addSpacer(2);
    const t = w.addText(top ? top.title : "No headlines yet");
    t.font = Font.semiboldSystemFont(12);
    t.minimumScaleFactor = 0.8;
    t.lineLimit = 3;
    return w;
  }

  // Home screen small/medium/large: header + a few headlines.
  w.backgroundColor = Color.dynamic(new Color("#f4f5f9"), new Color("#12141a"));
  const title = w.addText("AI Daily News");
  title.font = Font.boldSystemFont(13);
  title.textColor = Color.dynamic(new Color("#3f51b5"), new Color("#8c9eff"));
  w.addSpacer(6);

  const n = family === "small" ? 2 : family === "large" ? 8 : 3;
  const items = pickHeadlines(data, LOCK_SCREEN_CATEGORIES, n);
  for (const a of items) {
    const t = w.addText("• " + a.title);
    t.font = Font.systemFont(family === "small" ? 11 : 12);
    t.textColor = Color.dynamic(new Color("#1a1c23"), new Color("#e8eaf1"));
    t.lineLimit = 2;
    w.addSpacer(4);
  }
  w.addSpacer();
  const foot = w.addText("Updated " + relTime(data.updated) + " ago");
  foot.font = Font.systemFont(9);
  foot.textOpacity = 0.5;
  return w;
}

const widget = await makeWidget();
widget.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000);
if (config.runsInWidget) {
  Script.setWidget(widget);
} else {
  Safari.open(PAGE_URL);
}
Script.complete();
