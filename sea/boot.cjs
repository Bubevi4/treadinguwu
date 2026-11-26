"use strict";
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");
const { spawn, execFileSync } = require("node:child_process");
const { createRequire } = require("node:module");

const GITHUB_OWNER = "Bubevi4";
const GITHUB_REPO = "treadinguwu";
const APP_NAME = "Quant Terminal";
const UNINSTALL_KEY = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\QuantTerminal";

function extractZipBuffer(buf, destDir, { stripTopDir = false, appFilesOnly = false } = {}) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65558); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("Invalid ZIP archive");
  const total = buf.readUInt16LE(eocd + 10);
  let pos = buf.readUInt32LE(eocd + 16);
  const root = path.resolve(destDir);
  const ALLOWED_DIRS = ["lib/", "public/", "scripts/", "docs/", "sea/", "custom/"];
  const ALLOWED_FILES = new Set(["server.js", "package.json", "start.bat", "start.sh", "start.command", "boot-shim.cjs"]);

  for (let i = 0; i < total; i++) {
    if (buf.readUInt32LE(pos) !== 0x02014b50) break;
    const method = buf.readUInt16LE(pos + 10);
    const compSize = buf.readUInt32LE(pos + 20);
    const nameLen = buf.readUInt16LE(pos + 28);
    const extraLen = buf.readUInt16LE(pos + 30);
    const commentLen = buf.readUInt16LE(pos + 32);
    const lfhOffset = buf.readUInt32LE(pos + 42);
    let rel = buf.subarray(pos + 46, pos + 46 + nameLen).toString("utf8");
    pos += 46 + nameLen + extraLen + commentLen;

    rel = rel.replace(/\\/g, "/").replace(/^\/+/, "");
    if (stripTopDir) {
      const idx = rel.indexOf("/");
      if (idx < 0) continue;
      rel = rel.slice(idx + 1);
    }
    if (!rel || rel.endsWith("/")) continue;
    if (rel.startsWith("data/")) continue;

    if (appFilesOnly) {
      const ok = ALLOWED_FILES.has(rel) || ALLOWED_DIRS.some((d) => rel.startsWith(d));
      if (!ok) continue;
    }

    const out = path.resolve(root, rel);
    if (out !== root && !out.startsWith(root + path.sep)) continue;

    const lfhName = buf.readUInt16LE(lfhOffset + 26);
    const lfhExtra = buf.readUInt16LE(lfhOffset + 28);
    const dataStart = lfhOffset + 30 + lfhName + lfhExtra;
    const raw = buf.subarray(dataStart, dataStart + compSize);
    const content = method === 0 ? raw : method === 8 ? zlib.inflateRawSync(raw) : null;
    if (!content) throw new Error(`Unsupported compression method ${method}`);

    fs.mkdirSync(path.dirname(out), { recursive: true });
    if (rel.startsWith("custom/") && fs.existsSync(out)) continue;
    fs.writeFileSync(out, content);
    if (rel === "sea/boot-shim.cjs") {
      fs.writeFileSync(path.join(root, "boot-shim.cjs"), content);
    }
  }
}

function readJsonSafe(filePath, fallback = {}) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function ensureAppFiles(dir) {
  const serverPath = path.join(dir, "server.js");
  const shimPath = path.join(dir, "boot-shim.cjs");
  if (fs.existsSync(serverPath) && fs.existsSync(shimPath)) return;

  const sea = require("node:sea");
  if (!sea.isSea()) {
    throw new Error("Missing server.js or boot-shim.cjs next to executable");
  }
  console.log("  Распаковка файлов Quant Terminal...");
  const raw = sea.getRawAsset("app-bundle.zip");
  extractZipBuffer(Buffer.from(raw), dir);
}

async function fetchLatestCommit(owner, repo) {
  const headers = { "User-Agent": "QuantTerminal-Updater", Accept: "application/vnd.github+json" };
  try {
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/commits?per_page=1`, {
      headers,
      signal: AbortSignal.timeout(4000),
    });
    if (res.status === 404 || res.status === 409) return { empty: true };
    if (res.ok) {
      const list = await res.json();
      if (!Array.isArray(list) || !list.length) return { empty: true };
      const c = list[0];
      return {
        sha: c.sha,
        message: String((c.commit && c.commit.message) || "").split("\n")[0],
        date: (c.commit && ((c.commit.committer && c.commit.committer.date) || (c.commit.author && c.commit.author.date))) || null,
      };
    }
  } catch {
    /* fallback to atom */
  }

  const atomRes = await fetch(`https://github.com/${owner}/${repo}/commits.atom`, {
    headers: { "User-Agent": "QuantTerminal-Updater" },
    signal: AbortSignal.timeout(4000),
  });
  if (atomRes.status === 404) return { empty: true };
  if (!atomRes.ok) throw new Error(`GitHub HTTP ${atomRes.status}`);
  const xml = await atomRes.text();
  const shaMatch = /<id>tag:github\.com,2008:Grit::Commit\/([0-9a-f]{7,40})<\/id>/i.exec(xml);
  if (!shaMatch) return { empty: true };
  const entry = xml.slice(shaMatch.index);
  const dateMatch = /<updated>([^<]+)<\/updated>/.exec(entry);
  return {
    sha: shaMatch[1],
    message: "",
    date: dateMatch ? dateMatch[1].trim() : null,
  };
}

async function checkStartupUpdates(dir) {
  if (process.env.QT_OFFLINE === "1" || process.env.QT_DISABLE_AUTO_UPDATE === "1") return;
  const repoEnv = process.env.QT_UPDATE_REPO;
  let owner = GITHUB_OWNER;
  let repo = GITHUB_REPO;
  if (repoEnv) {
    const m = /github\.com[:/]([^/]+)\/([^/]+?)(?:\.git)?\/?$/i.exec(repoEnv.trim());
    if (m) {
      owner = m[1];
      repo = m[2];
    }
  }

  const dataDir = process.env.QT_DATA_DIR || path.join(dir, "data");
  const stateFile = path.join(dataDir, "update-state.json");
  const st = readJsonSafe(stateFile, {});
  const meta = readJsonSafe(path.join(dir, "build-meta.json"), {});
  const currentSha = st.currentSha || meta.commitSha || null;
  const now = new Date().toISOString();

  try {
    console.log("  Проверка обновлений на GitHub...");
    const latest = await fetchLatestCommit(owner, repo);
    if (latest.empty || !latest.sha) {
      fs.mkdirSync(dataDir, { recursive: true });
      fs.writeFileSync(stateFile, JSON.stringify({ ...st, currentSha, lastCheck: now, lastError: null }, null, 2));
      return;
    }

    const newerThanBuild =
      !currentSha && meta.builtAt && latest.date
        ? Date.parse(latest.date) > Date.parse(meta.builtAt)
        : true;
    const shouldUpdate = latest.sha !== currentSha && newerThanBuild;

    if (!shouldUpdate) {
      fs.mkdirSync(dataDir, { recursive: true });
      fs.writeFileSync(
        stateFile,
        JSON.stringify(
          {
            ...st,
            currentSha,
            latestSha: latest.sha,
            latestMessage: latest.message,
            latestDate: latest.date,
            lastCheck: now,
            lastError: null,
          },
          null,
          2,
        ),
      );
      return;
    }

    console.log(`  Найдено обновление (${latest.sha.slice(0, 7)}), загрузка...`);
    const dlUrl = `https://github.com/${owner}/${repo}/archive/${encodeURIComponent(latest.sha)}.zip`;
    const res = await fetch(dlUrl, {
      headers: { "User-Agent": "QuantTerminal-Updater" },
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const zipBuf = Buffer.from(await res.arrayBuffer());
    extractZipBuffer(zipBuf, dir, { stripTopDir: true, appFilesOnly: true });

    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(
      stateFile,
      JSON.stringify(
        {
          ...st,
          currentSha: latest.sha,
          latestSha: latest.sha,
          latestMessage: latest.message,
          latestDate: latest.date,
          pendingRestart: false,
          lastCheck: now,
          lastUpdateAt: now,
          lastError: null,
        },
        null,
        2,
      ),
    );
    console.log("  Обновление установлено!");
  } catch (e) {
    try {
      fs.mkdirSync(dataDir, { recursive: true });
      fs.writeFileSync(stateFile, JSON.stringify({ ...st, lastCheck: now, lastError: e.message }, null, 2));
    } catch {
      /* ignore */
    }
  }
}

function runPowershell(script) {
  execFileSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script], {
    stdio: "ignore",
  });
}

function psEscape(s) {
  return String(s).replace(/'/g, "''");
}

function installWindows(targetDir, { launch = true } = {}) {
  const sea = require("node:sea");
  console.log(`\n  Установка ${APP_NAME} в ${targetDir}...`);
  fs.mkdirSync(targetDir, { recursive: true });

  if (sea.isSea()) {
    const raw = sea.getRawAsset("app-bundle.zip");
    extractZipBuffer(Buffer.from(raw), targetDir);
  } else {
    throw new Error("Installer must be run from compiled QuantTerminalSetup.exe");
  }

  const installedExe = path.join(targetDir, "QuantTerminal.exe");
  if (path.resolve(process.execPath).toLowerCase() !== path.resolve(installedExe).toLowerCase()) {
    fs.copyFileSync(process.execPath, installedExe);
  }

  const meta = readJsonSafe(path.join(targetDir, "build-meta.json"), { version: "1.0.0" });
  if (process.platform === "win32") {
    const desktop = path.join(process.env.USERPROFILE || "", "Desktop");
    const startMenuDir = path.join(process.env.APPDATA || "", "Microsoft", "Windows", "Start Menu", "Programs", APP_NAME);
    fs.mkdirSync(startMenuDir, { recursive: true });

    const desktopLnk = path.join(desktop, `${APP_NAME}.lnk`);
    const startLnk = path.join(startMenuDir, `${APP_NAME}.lnk`);
    const uninstallLnk = path.join(startMenuDir, `Удалить ${APP_NAME}.lnk`);

    const ps = `
$ws = New-Object -ComObject WScript.Shell
$s1 = $ws.CreateShortcut('${psEscape(desktopLnk)}')
$s1.TargetPath = '${psEscape(installedExe)}'
$s1.WorkingDirectory = '${psEscape(targetDir)}'
$s1.Description = '${psEscape(APP_NAME)}'
$s1.Save()

$s2 = $ws.CreateShortcut('${psEscape(startLnk)}')
$s2.TargetPath = '${psEscape(installedExe)}'
$s2.WorkingDirectory = '${psEscape(targetDir)}'
$s2.Description = '${psEscape(APP_NAME)}'
$s2.Save()

$s3 = $ws.CreateShortcut('${psEscape(uninstallLnk)}')
$s3.TargetPath = '${psEscape(installedExe)}'
$s3.Arguments = '--uninstall'
$s3.WorkingDirectory = '${psEscape(targetDir)}'
$s3.Save()
`;
    try {
      runPowershell(ps);
    } catch (e) {
      console.log("  Предупреждение: не удалось создать ярлыки:", e.message);
    }

    try {
      const regArgs = [
        ["DisplayName", "REG_SZ", APP_NAME],
        ["DisplayVersion", "REG_SZ", meta.version || "1.0.0"],
        ["Publisher", "REG_SZ", "Quant Terminal"],
        ["InstallLocation", "REG_SZ", targetDir],
        ["UninstallString", "REG_SZ", `"${installedExe}" --uninstall`],
        ["NoModify", "REG_DWORD", "1"],
        ["NoRepair", "REG_DWORD", "1"],
      ];
      for (const [name, type, val] of regArgs) {
        execFileSync("reg.exe", ["add", UNINSTALL_KEY, "/v", name, "/t", type, "/d", val, "/f"], { stdio: "ignore" });
      }
    } catch {
      /* ignore registry errors */
    }
  }

  console.log("  Установка завершена!");
  if (launch) {
    console.log("  Запуск Quant Terminal...");
    const child = spawn(installedExe, [], {
      cwd: targetDir,
      detached: true,
      stdio: "ignore",
    });
    child.unref();
  }
}

async function uninstallWindows(targetDir) {
  console.log(`\n  Удаление ${APP_NAME} из ${targetDir}...`);
  try {
    await fetch("http://127.0.0.1:3777/api/shutdown", { method: "POST", signal: AbortSignal.timeout(1500) });
  } catch {
    /* not running */
  }
  if (process.platform === "win32") {
    const desktopLnk = path.join(process.env.USERPROFILE || "", "Desktop", `${APP_NAME}.lnk`);
    const startMenuDir = path.join(process.env.APPDATA || "", "Microsoft", "Windows", "Start Menu", "Programs", APP_NAME);
    fs.rmSync(desktopLnk, { force: true });
    fs.rmSync(startMenuDir, { recursive: true, force: true });
    try {
      execFileSync("reg.exe", ["delete", UNINSTALL_KEY, "/f"], { stdio: "ignore" });
    } catch {
      /* ignore */
    }
  }
  for (const name of ["server.js", "package.json", "start.bat", "start.sh", "start.command", "boot-shim.cjs", "build-meta.json"]) {
    fs.rmSync(path.join(targetDir, name), { force: true });
  }
  for (const dirName of ["lib", "public", "scripts", "docs", "sea"]) {
    fs.rmSync(path.join(targetDir, dirName), { recursive: true, force: true });
  }
  console.log("  Файлы программы удалены. Ваши данные (data/) и индикаторы (custom/) сохранены в:");
  console.log(`  ${targetDir}`);
}

async function main() {
  const args = process.argv.slice(1);
  const exeBase = path.basename(process.execPath).toLowerCase();
  const dirArg = args.find((a) => a.startsWith("--dir="));
  const defaultInstallDir = path.join(process.env.LOCALAPPDATA || path.dirname(process.execPath), "QuantTerminal");

  if (args.includes("--uninstall")) {
    await uninstallWindows(dirArg ? path.resolve(dirArg.slice(6)) : path.dirname(process.execPath));
    return;
  }

  if (args.includes("--install") || exeBase.includes("setup") || exeBase.includes("install")) {
    const targetDir = dirArg ? path.resolve(dirArg.slice(6)) : defaultInstallDir;
    const launch = !args.includes("--no-launch");
    installWindows(targetDir, { launch });
    return;
  }

  const dir = path.dirname(process.execPath);
  ensureAppFiles(dir);
  await checkStartupUpdates(dir);

  const serverPath = path.join(dir, "server.js");
  const shimPath = path.join(dir, "boot-shim.cjs");
  const userArgs = args.filter((a) => path.resolve(a) !== path.resolve(serverPath));

  if (
    !userArgs.includes("--open") &&
    !userArgs.includes("--no-open") &&
    !userArgs.includes("--headless") &&
    process.env.QT_NO_OPEN !== "1"
  ) {
    userArgs.push("--open");
  }
  process.argv = [process.execPath, serverPath, ...userArgs];

  const loadShim = createRequire(shimPath);
  const boot = loadShim(shimPath);
  await boot(serverPath);
}

main().catch((err) => {
  console.error("\n  Quant Terminal failed to start:", err && err.stack ? err.stack : err);
  process.exit(1);
});
