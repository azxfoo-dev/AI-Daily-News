#!/usr/bin/env node
// Builds the email digest from the live news.json and writes:
//   digest.html    — the email body
//   subject.txt    — the email subject line
//
// Usage: node scripts/build-digest.mjs [daily|weekly]

import { writeFileSync } from "node:fs";

const FREQ = process.argv[2] === "weekly" ? "weekly" : "daily";
const NEWS_URL = process.env.NEWS_URL ?? "https://azxfoo-dev.github.io/AI-Daily-News/news.json";
const SITE_URL = "https://azxfoo-dev.github.io/AI-Daily-News/";
const PER_GROUP = 3;

const res = await fetch(NEWS_URL + "?t=" + Date.now(), {
  signal: AbortSignal.timeout(30_000),
  headers: { "user-agent": "AI-Daily-News-digest/1.0" },
});
if (!res.ok) throw new Error(`Failed to fetch news.json: HTTP ${res.status}`);
const data = await res.json();

const esc = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function topOfGroup(group) {
  const seen = new Set();
  return group.subs
    .flatMap((s) => s.articles.map((a) => ({ ...a, subName: s.name })))
    .filter((a) => (a.sourceType ?? "authoritative") === "authoritative")
    .sort((a, b) => (b.published ?? "").localeCompare(a.published ?? ""))
    .filter((a) => {
      const key = a.title.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, PER_GROUP);
}

const date = new Date().toLocaleDateString("en-US", {
  weekday: "long",
  month: "long",
  day: "numeric",
  year: "numeric",
});

const sections = data.groups
  .map((g) => {
    const articles = topOfGroup(g);
    if (!articles.length) return "";
    const items = articles
      .map(
        (a) => `
        <tr><td style="padding:0 0 14px 0;">
          <a href="${esc(a.url)}" style="color:#1a1c23;font-size:15px;font-weight:600;line-height:1.4;text-decoration:none;">${esc(a.title)}</a>
          <div style="color:#6b7180;font-size:12px;padding-top:3px;">${esc(a.source ?? "")} · ${esc(a.subName)}</div>
        </td></tr>`
      )
      .join("");
    return `
      <tr><td style="padding:22px 0 8px 0;color:#3f51b5;font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase;">${esc(g.name)}</td></tr>
      ${items}`;
  })
  .join("");

const topStory = data.groups
  .flatMap((g) => g.subs.flatMap((s) => s.articles))
  .filter((a) => (a.sourceType ?? "authoritative") === "authoritative")
  .sort((a, b) => (b.published ?? "").localeCompare(a.published ?? ""))[0];

const label = FREQ === "weekly" ? "Weekly" : "Daily";
const subject = `☀️ Your ${label} News Digest — ${topStory ? topStory.title : date}`;

const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:#f4f5f9;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f9;padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;padding:28px 28px 20px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <tr><td style="color:#3f51b5;font-size:20px;font-weight:800;padding-bottom:2px;">&#128240; AI Daily News</td></tr>
  <tr><td style="color:#6b7180;font-size:13px;padding-bottom:6px;">Your ${label.toLowerCase()} digest · ${esc(date)}</td></tr>
  ${sections}
  <tr><td style="border-top:1px solid #e2e4ec;padding-top:16px;color:#6b7180;font-size:12px;">
    <a href="${SITE_URL}" style="color:#3f51b5;">Open the full app</a> for all topics, your For You feed, and public-opinion posts.<br>
    To change frequency or unsubscribe, reply to this email.
  </td></tr>
</table>
</td></tr></table>
</body></html>`;

writeFileSync("digest.html", html);
writeFileSync("subject.txt", subject);
console.log(`Built ${FREQ} digest: ${data.groups.length} sections, subject: ${subject.slice(0, 80)}`);
