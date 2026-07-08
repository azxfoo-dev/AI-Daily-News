# AI Daily News

A personal news dashboard covering **politics, business, technology,
health & science, sports, entertainment, world news, and lifestyle**, each
with drill-down subtopics — as an app window on your computer, on your
phone's home screen, and on your iPhone lock screen. A customizable
**For You** feed sits at the top, and a source filter lets you choose
**authoritative outlets** (via Google News), **public opinion** (Reddit
communities), or both.

Headlines are pulled by a GitHub Actions job every 3 hours and published as
a static page on GitHub Pages. No servers to run; the only optional
credential is a free Reddit API key for the public-opinion feeds (see below).

**Live page:** https://azxfoo-dev.github.io/AI-Daily-News/

## One-time setup

1. Merge this branch to `main`.
2. In the repo, go to **Settings → Pages** and set **Source** to
   **GitHub Actions**.
3. Go to the **Actions** tab, open the **Refresh news & deploy** workflow,
   and press **Run workflow** (or just wait — it runs automatically every
   3 hours and on every push to `main`).
4. Open https://azxfoo-dev.github.io/AI-Daily-News/ and confirm headlines load.

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

## iPhone midnight headline notification

The web app can only notify while it's open, so for a true midnight
notification install
[`ios-widget/AI-Daily-News-Notify.js`](ios-widget/AI-Daily-News-Notify.js)
as a second Scriptable script, then in the **Shortcuts** app add an
Automation: **Time of Day → 12:00 AM, Daily → Run Script (Scriptable) →
AI Daily News Notify**, with "Ask Before Running" off. Every midnight your
phone shows the day's top story from your chosen topics; tapping it opens
the news page.

On Android, the installed web app's home-screen icon plus your launcher's
widget tools (e.g. KWGT pointing at the same `news.json`) achieve the same.

## Enabling the public-opinion (Reddit) feeds

Reddit blocks anonymous requests from CI machines, so the workflow needs a
free Reddit API app to fetch community posts:

1. Log into Reddit, open https://www.reddit.com/prefs/apps, click
   **create another app**, choose type **script**, name it anything, set
   redirect URI to `http://localhost` and create it.
2. Copy the **client id** (the string under the app name) and **secret**.
3. In this repo: **Settings → Secrets and variables → Actions →
   New repository secret**. Add `REDDIT_CLIENT_ID` and
   `REDDIT_CLIENT_SECRET` with those values.
4. Re-run the **Refresh news & deploy** workflow.

Without these secrets everything else still works — the public-opinion
checkbox just has no stories to show.

## Email digests (daily / weekly)

A second workflow (`digest.yml`) emails a news digest — daily at 12:00 UTC
and weekly on Mondays — using your Gmail account. One-time setup:

1. Create a Gmail **app password**: https://myaccount.google.com/apppasswords
   (requires 2-step verification on the Google account). Copy the 16-character
   password.
2. Add four repository secrets (**Settings → Secrets and variables →
   Actions**):
   - `GMAIL_ADDRESS` — your Gmail address (the sender)
   - `GMAIL_APP_PASSWORD` — the app password from step 1
   - `DIGEST_DAILY_TO` — comma-separated emails for the daily digest
   - `DIGEST_WEEKLY_TO` — comma-separated emails for the weekly digest
3. Test with **Actions → Email digest → Run workflow**.

Subscribers from the in-app "Get it by email" box arrive as emails to you;
add them to the matching secret. The digest never exposes recipient
addresses in the public repo. To change the send hour, edit the cron in
`.github/workflows/digest.yml`.

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
