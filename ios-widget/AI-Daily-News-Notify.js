// AI Daily News — midnight headline notification (Scriptable, iOS)
// Posts a notification with the current top story from your chosen topics.
// Tapping the notification opens the full news page.
//
// Setup (one time):
//   1. In Scriptable, create a script named "AI Daily News Notify" and paste this in.
//   2. Open the Shortcuts app > Automation tab > + > "Time of Day" >
//      set 12:00 AM, Daily > Next > add action "Run Script" (Scriptable) >
//      choose "AI Daily News Notify" > turn OFF "Ask Before Running".
// That's it — every midnight your phone shows the day's top headline,
// even when the news app is closed.

const PAGE_URL = "https://azxfoo-dev.github.io/AI-Daily-News/";
const DATA_URL = PAGE_URL + "news.json";

// Topic ids (from scripts/feeds.json) to consider, in priority order.
// The newest story across these becomes the notification.
const TOPICS = ["ai-ml", "ai-insights", "us-politics", "europe"];

const data = await new Request(DATA_URL + "?t=" + Date.now()).loadJSON();
const subs = (data.groups ?? []).flatMap((g) => g.subs ?? []);
const pool = [];
for (const id of TOPICS) {
  const sub = subs.find((s) => s.id === id);
  if (sub) pool.push(...sub.articles.map((a) => ({ ...a, topic: sub.name })));
}
pool.sort((a, b) => (b.published ?? "").localeCompare(a.published ?? ""));
const top = pool[0];

if (top) {
  const n = new Notification();
  n.title = "📰 Today's top story — " + top.topic;
  n.body = top.title + (top.source ? " (" + top.source + ")" : "");
  n.openURL = PAGE_URL;
  n.sound = "default";
  await n.schedule();
}
Script.complete();
