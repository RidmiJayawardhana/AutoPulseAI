/**
 * AutoPulse AI — Root Entry Point
 * Run: node server.js
 */

const path = require("path");

// ── auto-install express if missing ─────────────────────────────────────────
const { execSync } = require("child_process");

function tryRequire(mod) {
  try { return require(mod); } catch (_) { return null; }
}

if (!tryRequire("express")) {
  console.log("[AutoPulse] express not found — installing automatically…");
  try {
    execSync("npm install express", { stdio: "inherit", cwd: __dirname });
    console.log("[AutoPulse] express installed ✔");
  } catch (e) {
    console.error("[AutoPulse] Failed to install express:", e.message);
    console.error("Please run: npm install express");
    process.exit(1);
  }
}

// ── delegate to backend/server.js ────────────────────────────────────────────
require(path.join(__dirname, "backend", "server.js"));
