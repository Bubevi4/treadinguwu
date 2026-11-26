// Automatic update fetcher from GitHub (zero git/npm dependency).
// Checks https://github.com/Bubevi4/treadinguwu.git for newer commits, downloads the archive
// via HTTPS, extracts updated code into the app directory while preserving data/ and custom/.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DATA_DIR } from "./store.js";
import { extractZip } from "./zip.js";

const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CUSTOM_DIR = process.env.QT_CUSTOM_DIR || path.join(APP_ROOT, "custom");
const STATE_FILE = path.join(DATA_DIR, "update-state.json");

export const DEFAULT_REPO = "https://github.com/Bubevi4/treadinguwu.git";
const CHECK_INTERVAL_MS = 6 * 3600 * 1000;

export function parseGitHubRepo(repoUrl = process.env.QT_UPDATE_REPO || DEFAULT_REPO) {
  const m = /github\.com[:/]([^/]+)\/([^/]+?)(?:\.git)?\/?$/i.exec(String(repoUrl).trim());
  if (!m) throw new Error(`Unsupported GitHub repository URL: ${repoUrl}`);
  return { owner: m[1], repo: m[2], url: `https://github.com/${m[1]}/${m[2]}.git` };
}

function readBuildMeta() {
  for (const dir of [APP_ROOT, DATA_DIR]) {
    try {
      return JSON.parse(fs.readFileSync(path.join(dir, "build-meta.json"), "utf8"));
    } catch {
      /* try next */
    }
  }
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(APP_ROOT, "package.json"), "utf8"));
    return { version: pkg.version, builtAt: null, commitSha: null };
  } catch {
    return { version: "1.0.0", builtAt: null, commitSha: null };
  }
}

function readState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
  } catch {
    return {};
  }
}

function writeState(next) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(next, null, 2));
}

async function fetchLatestCommit(owner, repo, apiBase = process.env.QT_GITHUB_API_BASE || "https://api.github.com", webBase = process.env.QT_GITHUB_WEB_BASE || "https://github.com") {
  const headers = { "User-Agent": "QuantTerminal-Updater", Accept: "application/vnd.github+json" };
  try {
    const res = await fetch(`${apiBase}/repos/${owner}/${repo}/commits?per_page=1`, {
      headers,
      signal: AbortSignal.timeout(10000),
    });
    if (res.status === 404 || res.status === 409) {
      return { empty: true };
    }
    if (res.ok) {
      const list = await res.json();
      if (!Array.isArray(list) || !list.length) return { empty: true };
      const c = list[0];
      return {
        sha: c.sha,
        message: String(c.commit?.message || "").split("\n")[0],
        date: c.commit?.committer?.date || c.commit?.author?.date || null,
      };
    }
  } catch {
    /* fall through to Atom feed */
  }

  const atomRes = await fetch(`${webBase}/${owner}/${repo}/commits.atom`, {
    headers: { "User-Agent": "QuantTerminal-Updater" },
    signal: AbortSignal.timeout(10000),
  });
  if (atomRes.status === 404) return { empty: true };
  if (!atomRes.ok) throw new Error(`GitHub returned HTTP ${atomRes.status}`);
  const xml = await atomRes.text();
  const shaMatch = /<id>tag:github\.com,2008:Grit::Commit\/([0-9a-f]{7,40})<\/id>/i.exec(xml);
  if (!shaMatch) return { empty: true };
  const entry = xml.slice(shaMatch.index);
  const titleMatch = /<title>([^<]+)<\/title>/.exec(entry);
  const dateMatch = /<updated>([^<]+)<\/updated>/.exec(entry);
  return {
    sha: shaMatch[1],
    message: titleMatch ? titleMatch[1].trim() : "",
    date: dateMatch ? dateMatch[1].trim() : null,
  };
}

function findExtractedRoot(tmpDir) {
  if (fs.existsSync(path.join(tmpDir, "server.js"))) return tmpDir;
  for (const name of fs.readdirSync(tmpDir)) {
    const sub = path.join(tmpDir, name);
    if (!fs.statSync(sub).isDirectory()) continue;
    if (fs.existsSync(path.join(sub, "server.js"))) return sub;
    const nested = path.join(sub, "quant-terminal");
    if (fs.existsSync(path.join(nested, "server.js"))) return nested;
  }
  throw new Error("Update archive does not contain server.js");
}

function copyDir(src, dst, { preserveExisting = false } = {}) {
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (entry.isDirectory()) {
      copyDir(s, d, { preserveExisting });
    } else if (!preserveExisting || !fs.existsSync(d)) {
      fs.copyFileSync(s, d);
    }
  }
}

export function applyExtractedUpdate(srcRoot, targetRoot = APP_ROOT, customDir = CUSTOM_DIR) {
  const APP_DIRS = ["lib", "public", "scripts", "docs", "sea"];
  const APP_FILES = ["server.js", "package.json", "start.bat", "start.sh", "start.command"];
  for (const f of APP_FILES) {
    const s = path.join(srcRoot, f);
    if (fs.existsSync(s)) fs.copyFileSync(s, path.join(targetRoot, f));
  }
  for (const d of APP_DIRS) {
    const s = path.join(srcRoot, d);
    if (fs.existsSync(s)) copyDir(s, path.join(targetRoot, d), { preserveExisting: false });
  }
  const srcCustom = path.join(srcRoot, "custom");
  if (fs.existsSync(srcCustom)) {
    copyDir(srcCustom, customDir, { preserveExisting: true });
  }
}

let activeCheck = null;

export function getUpdateStatus() {
  const repo = parseGitHubRepo();
  const meta = readBuildMeta();
  const st = readState();
  const currentSha = st.currentSha || meta.commitSha || null;
  return {
    enabled: process.env.QT_OFFLINE !== "1",
    repo: repo.url,
    version: meta.version || "1.0.0",
    builtAt: meta.builtAt || null,
    currentSha,
    latestSha: st.latestSha || currentSha,
    latestMessage: st.latestMessage || null,
    latestDate: st.latestDate || null,
    pendingRestart: Boolean(st.pendingRestart),
    lastCheck: st.lastCheck || null,
    lastUpdateAt: st.lastUpdateAt || null,
    lastError: st.lastError || null,
    checking: Boolean(activeCheck),
  };
}

export async function checkForUpdates({ force = false, apply = true } = {}) {
  if (activeCheck) return activeCheck;
  activeCheck = (async () => {
    const repo = parseGitHubRepo();
    const meta = readBuildMeta();
    const st = readState();
    const currentSha = st.currentSha || meta.commitSha || null;
    const now = new Date().toISOString();

    try {
      const latest = await fetchLatestCommit(repo.owner, repo.repo);
      if (latest.empty) {
        const next = { ...st, currentSha, lastCheck: now, lastError: null };
        writeState(next);
        return { ...getUpdateStatus(), updated: false, upToDate: true, emptyRepo: true };
      }

      const newerThanBuild =
        !currentSha && meta.builtAt && latest.date
          ? Date.parse(latest.date) > Date.parse(meta.builtAt)
          : true;
      const shouldUpdate =
        apply &&
        latest.sha &&
        latest.sha !== currentSha &&
        (force || newerThanBuild);

      if (!shouldUpdate) {
        const next = {
          ...st,
          currentSha,
          latestSha: latest.sha,
          latestMessage: latest.message,
          latestDate: latest.date,
          lastCheck: now,
          lastError: null,
        };
        writeState(next);
        return {
          ...getUpdateStatus(),
          updated: false,
          upToDate: latest.sha === currentSha || !newerThanBuild,
        };
      }

      const webBase = process.env.QT_GITHUB_WEB_BASE || "https://github.com";
      const dlUrl = `${webBase}/${repo.owner}/${repo.repo}/archive/${encodeURIComponent(latest.sha)}.zip`;
      const res = await fetch(dlUrl, {
        headers: { "User-Agent": "QuantTerminal-Updater" },
        signal: AbortSignal.timeout(60000),
      });
      if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`);
      const zipBuf = Buffer.from(await res.arrayBuffer());

      const tmpDir = path.join(DATA_DIR, `update-tmp-${process.pid}`);
      fs.rmSync(tmpDir, { recursive: true, force: true });
      try {
        extractZip(zipBuf, tmpDir);
        const srcRoot = findExtractedRoot(tmpDir);
        applyExtractedUpdate(srcRoot, APP_ROOT, CUSTOM_DIR);
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }

      const next = {
        ...st,
        currentSha: latest.sha,
        latestSha: latest.sha,
        latestMessage: latest.message,
        latestDate: latest.date,
        pendingRestart: true,
        lastCheck: now,
        lastUpdateAt: now,
        lastError: null,
      };
      writeState(next);
      return { ...getUpdateStatus(), updated: true, upToDate: false };
    } catch (e) {
      const next = { ...st, lastCheck: now, lastError: e.message };
      writeState(next);
      return { ...getUpdateStatus(), updated: false, error: e.message };
    } finally {
      activeCheck = null;
    }
  })();
  return activeCheck;
}

export function clearPendingRestart() {
  const st = readState();
  if (st.pendingRestart) writeState({ ...st, pendingRestart: false });
}

let timer = null;
export function startAutoUpdater() {
  if (process.env.QT_OFFLINE === "1" || process.env.QT_DISABLE_AUTO_UPDATE === "1") return;
  clearPendingRestart();
  setTimeout(() => {
    checkForUpdates({ force: false, apply: true }).catch(() => {});
  }, 3000).unref();
  timer = setInterval(() => {
    checkForUpdates({ force: false, apply: true }).catch(() => {});
  }, CHECK_INTERVAL_MS);
  timer.unref();
}
