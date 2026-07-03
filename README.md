# AI Daily News

A personal news dashboard that shows the most recent headlines about **AI,
politics, world events, tech, and business** — as an app window on your
computer, on your phone's home screen, and on your iPhone lock screen.

Headlines are pulled from public Google News RSS feeds by a GitHub Actions
job every 3 hours and published as a static page on GitHub Pages. There are
no servers to run and no API keys to manage.

**Live page:** https://azxfoo-dev.github.io/ai-daily-news/

## One-time setup

1. Merge this branch to `main`.
2. In the repo, go to **Settings → Pages** and set **Source** to
   **GitHub Actions**.
3. Go to the **Actions** tab, open the **Refresh news & deploy** workflow,
   and press **Run workflow** (or just wait — it runs automatically every
   3 hours and on every push to `main`).
4. Open https://azxfoo-dev.github.io/ai-daily-news/ and confirm headlines load.

## Install as a window on your computer

Open the live page in Chrome or Edge, then click the **install icon** in the
address bar (or menu → *Cast, save and share* → *Install page as app*). You
get a standalone window with its own dock/taskbar icon — resize it into a
narrow "widget" strip and leave it on your desktop. Headlines auto-refresh
every 15 minutes while it's open.

## Install on your phone

- **iPhone:** open the page in Safari → Share → **Add to Home Screen**.
- **Android:** open the page in Chrome → menu → **Add to Home screen**
  (or accept the install prompt).

## iPhone lock-screen widget (tap to open)

iOS only allows native apps to put widgets on the lock screen, so this repo
ships a script for the free [Scriptable](https://scriptable.app) app instead:

1. Install **Scriptable** from the App Store.
2. In Scriptable, create a new script named **AI Daily News** and paste in
   [`ios-widget/AI-Daily-News-Widget.js`](ios-widget/AI-Daily-News-Widget.js).
3. Long-press your lock screen → **Customize** → tap the widget area below
   the clock → add **Scriptable** (rectangular) → tap it → choose the
   **AI Daily News** script.

The widget shows the latest headline, cycles every 15 minutes, and tapping
it opens the full news page. The same script also works as a home-screen
widget (small/medium/large).

On Android, the installed web app's home-screen icon plus your launcher's
widget tools (e.g. KWGT pointing at the same `news.json`) achieve the same.

## Customizing topics

Edit [`scripts/feeds.json`](scripts/feeds.json). Each category has a list of
RSS feed URLs — any RSS feed works, not just Google News. For a new Google
News search feed use:

```
https://news.google.com/rss/search?q=YOUR+QUERY&hl=en-US&gl=US&ceid=US:en
```

Changes take effect on the next scheduled run, or push to `main` /
run the workflow manually to refresh immediately.

## Development

```bash
node scripts/fetch-news.mjs   # writes site/news.json
cd site && python3 -m http.server 8000   # preview at http://localhost:8000
```

## How it works

```
scripts/feeds.json      topics & RSS feed URLs
scripts/fetch-news.mjs  fetches feeds, dedupes, writes news.json (no deps)
site/                   static PWA (installable, offline-capable)
ios-widget/             Scriptable lock-screen widget for iOS
.github/workflows/      cron job: refresh headlines + deploy to Pages
```
