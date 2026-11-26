#!/usr/bin/env node
// Packages Quant Terminal into a standalone Windows .exe using Node.js SEA
// (Single Executable Application). No Node.js installation required on target PCs.
// Usage: node scripts/build-exe.js
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createZip } from "../lib/zip.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(ROOT, "dist");
const TMP = path.join(ROOT, ".sea-build-tmp");

const APP_FILES = ["server.js", "package.json", "start.bat", "start.sh", "start.command"];
const APP_DIRS = ["lib", "public", "scripts", "docs", "custom", "sea"];

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".git") continue;
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

function collectFiles(baseDir, relPrefix = "", out = []) {
  for (const entry of fs.readdirSync(baseDir, { withFileTypes: true })) {
    const full = path.join(baseDir, entry.name);
    const rel = relPrefix ? `${relPrefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      collectFiles(full, rel, out);
    } else {
      out.push({ name: rel, data: fs.readFileSync(full) });
    }
  }
  return out;
}

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
let commitSha = process.env.QT_BUILD_SHA || null;
if (!commitSha) {
  try {
    commitSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim() || null;
  } catch {
    /* not a git repo */
  }
}
const buildMeta = {
  version: pkg.version || "1.0.0",
  builtAt: new Date().toISOString(),
  commitSha,
};

console.log("  Preparing dist/ and app-bundle.zip...");
fs.rmSync(DIST, { recursive: true, force: true });
fs.rmSync(TMP, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });
fs.mkdirSync(TMP, { recursive: true });

try {
  for (const f of APP_FILES) {
    const src = path.join(ROOT, f);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(DIST, f));
  }
  for (const d of APP_DIRS) {
    const src = path.join(ROOT, d);
    if (fs.existsSync(src)) copyDir(src, path.join(DIST, d));
  }
  fs.copyFileSync(path.join(ROOT, "sea", "boot-shim.cjs"), path.join(DIST, "boot-shim.cjs"));
  fs.writeFileSync(path.join(DIST, "build-meta.json"), JSON.stringify(buildMeta, null, 2));

  const entries = collectFiles(DIST);
  const zipBuf = createZip(entries);
  const zipPath = path.join(TMP, "app-bundle.zip");
  fs.writeFileSync(zipPath, zipBuf);

  const exeName = process.platform === "win32" ? "QuantTerminal.exe" : "QuantTerminal";
  const exePath = path.join(DIST, exeName);
  const seaConfigPath = path.join(TMP, "sea-config.json");
  fs.writeFileSync(
    seaConfigPath,
    JSON.stringify(
      {
        main: path.join(ROOT, "sea", "boot.cjs"),
        output: exePath,
        disableExperimentalSEAWarning: true,
        assets: {
          "app-bundle.zip": zipPath,
        },
      },
      null,
      2,
    ),
  );

  console.log(`  Building ${exeName} with Node ${process.version}...`);
  execFileSync(process.execPath, ["--build-sea", seaConfigPath], {
    cwd: ROOT,
    stdio: "inherit",
  });

  const sizeMb = (fs.statSync(exePath).size / (1024 * 1024)).toFixed(1);
  console.log(`\n  Done! Built ${exePath} (${sizeMb} MB)`);
  if (process.platform === "win32") {
    const setupPath = path.join(DIST, "QuantTerminalSetup.exe");
    fs.copyFileSync(exePath, setupPath);
    console.log(`  Installer: ${setupPath} (${sizeMb} MB)`);
  }
  console.log(`  Bundle size: ${(zipBuf.length / 1024).toFixed(1)} KB (${entries.length} files)`);
} finally {
  fs.rmSync(TMP, { recursive: true, force: true });
}
