#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");

const root = path.resolve(__dirname, "..");
const targets = [
  path.join(root, "public", "demo", "investor-pitch.mp4"),
  path.join(root, "docs", "demo", "investor-pitch.mp4"),
];

function readUrl() {
  if (process.env.PITCH_VIDEO_URL) return process.env.PITCH_VIDEO_URL.trim();
  const f = path.join(__dirname, "pitch-video.url");
  if (fs.existsSync(f)) return fs.readFileSync(f, "utf8").trim();
  return "";
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const mod = url.startsWith("https") ? https : http;
    const req = mod.get(url, { headers: { "User-Agent": "pitch-ensure" } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        download(res.headers.location, dest).then(resolve, reject);
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error("HTTP " + res.statusCode + " for " + url));
        res.resume();
        return;
      }
      const out = fs.createWriteStream(dest);
      res.pipe(out);
      out.on("finish", () => out.close(() => resolve(dest)));
      out.on("error", reject);
    });
    req.on("error", reject);
  });
}

async function main() {
  const missing = targets.filter((t) => !fs.existsSync(t) || fs.statSync(t).size < 1000);
  if (!missing.length) {
    console.log("investor-pitch.mp4 present");
    return;
  }
  const url = readUrl();
  if (!url) {
    console.warn("investor-pitch.mp4 missing and no PITCH_VIDEO_URL / scripts/pitch-video.url");
    process.exitCode = 0;
    return;
  }
  const primary = targets[0];
  console.log("fetching investor pitch ->", primary);
  await download(url, primary);
  for (const t of targets.slice(1)) {
    fs.mkdirSync(path.dirname(t), { recursive: true });
    fs.copyFileSync(primary, t);
  }
  console.log("wrote", targets.join(", "));
}

main().catch((err) => {
  console.warn("ensure-investor-pitch:", err.message);
  process.exitCode = 0;
});
