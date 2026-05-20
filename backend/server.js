/**
 * AutoPulse AI — Backend Server
 * Auto-creates folders, CSV, runs Python AI, serves frontend.
 */

const express    = require("express");
const fs         = require("fs");
const path       = require("path");
const { exec }   = require("child_process");
const readline   = require("readline");

const app  = express();
const PORT = 3000;

// ── paths ─────────────────────────────────────────────────────────────────────
const ROOT      = __dirname.endsWith("backend")
                    ? path.join(__dirname, "..")
                    : __dirname;
const DATA_DIR  = path.join(ROOT, "data");
const AI_DIR    = path.join(ROOT, "ai");
const CSV_PATH  = path.join(DATA_DIR, "fuel_data.csv");
const PY_SCRIPT = path.join(AI_DIR,  "ai_analysis.py");

const SAMPLE_ROWS = [
  "2026-01-01,10,3000,45120",
  "2026-01-05,12,3600,45260",
  "2026-01-10,9,2700,45380",
  "2026-01-15,11,3300,45510",
  "2026-01-20,13,3900,45640",
  "2026-01-25,10,3000,45778",
  "2026-02-01,11,3300,45910",
  "2026-02-07,12,3600,46048",
  "2026-02-14,14,4200,46170",
  "2026-02-20,10,3000,46310",
];

// ── self-heal: folders & CSV ──────────────────────────────────────────────────
function ensureFileSystem() {
  [DATA_DIR, AI_DIR].forEach(d => {
    if (!fs.existsSync(d)) {
      fs.mkdirSync(d, { recursive: true });
      console.log(`[AutoPulse] Created folder: ${d}`);
    }
  });

  if (!fs.existsSync(CSV_PATH) || fs.statSync(CSV_PATH).size === 0) {
    const header = "date,liters,cost,odometer\n";
    fs.writeFileSync(CSV_PATH, header + SAMPLE_ROWS.join("\n") + "\n");
    console.log("[AutoPulse] Sample fuel_data.csv created.");
  }
}

// ── detect python binary ──────────────────────────────────────────────────────
async function detectPython() {
  const candidates = ["python3", "python"];
  for (const py of candidates) {
    try {
      await new Promise((res, rej) =>
        exec(`${py} --version`, (err) => err ? rej(err) : res())
      );
      return py;
    } catch (_) { /* try next */ }
  }
  return null;
}

// ── run AI script ─────────────────────────────────────────────────────────────
let pythonBin = "python3";

function runAI() {
  return new Promise((resolve) => {
    const cmd = `${pythonBin} "${PY_SCRIPT}"`;
    exec(cmd, { cwd: ROOT }, (err, stdout, stderr) => {
      if (err) {
        console.error("[AutoPulse AI] Python error:", stderr || err.message);
        return resolve({ error: "AI module error: " + (stderr || err.message) });
      }
      // parse between markers
      const start = stdout.indexOf("AUTOPULSE_JSON_START");
      const end   = stdout.indexOf("AUTOPULSE_JSON_END");
      if (start === -1 || end === -1) {
        return resolve({ error: "AI output parse error", raw: stdout });
      }
      try {
        const json = stdout.slice(start + "AUTOPULSE_JSON_START".length, end).trim();
        resolve(JSON.parse(json));
      } catch (e) {
        resolve({ error: "JSON parse failed", raw: stdout });
      }
    });
  });
}

// ── middleware ────────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.static(path.join(ROOT, "frontend")));
app.use("/ai", express.static(AI_DIR));     // serve output.png

// ── GET /api/analyze ──────────────────────────────────────────────────────────
app.get("/api/analyze", async (req, res) => {
  ensureFileSystem();
  const result = await runAI();
  res.json(result);
});

// ── POST /api/fuel ────────────────────────────────────────────────────────────
app.post("/api/fuel", async (req, res) => {
  ensureFileSystem();

  const { date, liters, cost, odometer } = req.body;
  if (!liters || !cost || !odometer) {
    return res.status(400).json({ error: "liters, cost, odometer are required" });
  }

  const d   = date || new Date().toISOString().split("T")[0];
  const row = `${d},${liters},${cost},${odometer}\n`;

  try {
    fs.appendFileSync(CSV_PATH, row);
    console.log(`[AutoPulse] Entry saved: ${row.trim()}`);
  } catch (e) {
    return res.status(500).json({ error: "Failed to write CSV: " + e.message });
  }

  const ai = await runAI();
  res.json({ saved: true, entry: { date: d, liters, cost, odometer }, ai });
});

// ── GET /api/history ──────────────────────────────────────────────────────────
app.get("/api/history", (req, res) => {
  ensureFileSystem();
  try {
    const content = fs.readFileSync(CSV_PATH, "utf8").trim();
    const lines   = content.split("\n").filter(Boolean);
    const header  = lines[0].split(",");
    const rows    = lines.slice(1).map(l => {
      const vals = l.split(",");
      return Object.fromEntries(header.map((h, i) => [h.trim(), vals[i]?.trim()]));
    });
    res.json({ rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── startup ───────────────────────────────────────────────────────────────────
(async () => {
  console.log("\n╔══════════════════════════════════════╗");
  console.log("║       AutoPulse AI  — Starting       ║");
  console.log("╚══════════════════════════════════════╝\n");

  ensureFileSystem();

  pythonBin = (await detectPython()) || "python3";
  console.log(`[AutoPulse] Python binary: ${pythonBin}`);

  // warm-up AI run
  console.log("[AutoPulse] Running initial AI analysis …");
  const warm = await runAI();
  if (warm.error) {
    console.warn("[AutoPulse] AI warm-up warning:", warm.error);
  } else {
    console.log("[AutoPulse] AI ready ✔  avg KM/L:", warm.stats?.avg_km_per_liter);
  }

  app.listen(PORT, () => {
    console.log(`\n🚗 AutoPulse AI is running at http://localhost:${PORT}\n`);
  });
})();
