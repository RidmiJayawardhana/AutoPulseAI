#!/usr/bin/env python3
"""
AutoPulse AI - Fuel Analysis Engine
Reads fuel_data.csv, computes stats, detects patterns, generates tips and chart.
"""

import os, sys, json, csv
from datetime import datetime, timedelta
import random

# ── paths ────────────────────────────────────────────────────────────────────
BASE_DIR  = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR  = os.path.join(BASE_DIR, "data")
AI_DIR    = os.path.join(BASE_DIR, "ai")
CSV_PATH  = os.path.join(DATA_DIR, "fuel_data.csv")
CHART_OUT = os.path.join(AI_DIR,  "output.png")

SAMPLE_DATA = [
    ("2026-01-01", 10, 3000, 45120),
    ("2026-01-05", 12, 3600, 45260),
    ("2026-01-10",  9, 2700, 45380),
    ("2026-01-15", 11, 3300, 45510),
    ("2026-01-20", 13, 3900, 45640),
    ("2026-01-25", 10, 3000, 45778),
    ("2026-02-01", 11, 3300, 45910),
    ("2026-02-07", 12, 3600, 46048),
    ("2026-02-14", 14, 4200, 46170),
    ("2026-02-20", 10, 3000, 46310),
]

# ── auto-heal data ────────────────────────────────────────────────────────────
def ensure_data():
    os.makedirs(DATA_DIR, exist_ok=True)
    if not os.path.exists(CSV_PATH) or os.path.getsize(CSV_PATH) == 0:
        with open(CSV_PATH, "w", newline="") as f:
            w = csv.writer(f)
            w.writerow(["date", "liters", "cost", "odometer"])
            for row in SAMPLE_DATA:
                w.writerow(row)

# ── read CSV ──────────────────────────────────────────────────────────────────
def load_data():
    rows = []
    with open(CSV_PATH, newline="") as f:
        reader = csv.DictReader(f)
        for r in reader:
            try:
                rows.append({
                    "date":     r["date"].strip(),
                    "liters":   float(r["liters"]),
                    "cost":     float(r["cost"]),
                    "odometer": float(r["odometer"]),
                })
            except (ValueError, KeyError):
                continue
    rows.sort(key=lambda x: x["date"])
    return rows

# ── compute KM/L per entry ────────────────────────────────────────────────────
def compute_efficiency(rows):
    results = []
    for i in range(1, len(rows)):
        km   = rows[i]["odometer"] - rows[i-1]["odometer"]
        if km <= 0:
            km = rows[i]["odometer"]          # first-entry fallback
        kml  = km / rows[i]["liters"] if rows[i]["liters"] > 0 else 0
        cpk  = rows[i]["cost"] / km if km > 0 else 0
        results.append({
            "date":        rows[i]["date"],
            "liters":      rows[i]["liters"],
            "cost":        rows[i]["cost"],
            "odometer":    rows[i]["odometer"],
            "km_driven":   round(km, 2),
            "km_per_liter": round(kml, 2),
            "cost_per_km":  round(cpk, 4),
        })
    # if only one entry, use it raw
    if not results and rows:
        r = rows[0]
        kml = r["odometer"] / r["liters"] if r["liters"] > 0 else 0
        results.append({
            "date":        r["date"],
            "liters":      r["liters"],
            "cost":        r["cost"],
            "odometer":    r["odometer"],
            "km_driven":   r["odometer"],
            "km_per_liter": round(kml, 2),
            "cost_per_km":  round(r["cost"] / r["odometer"], 4) if r["odometer"] > 0 else 0,
        })
    return results

# ── pattern detection ─────────────────────────────────────────────────────────
def detect_patterns(rows, eff):
    alerts = []
    tips   = []

    total_liters = sum(r["liters"] for r in rows)
    total_cost   = sum(r["cost"]   for r in rows)
    total_km     = sum(e["km_driven"] for e in eff) if eff else 0
    avg_kml      = sum(e["km_per_liter"] for e in eff) / len(eff) if eff else 0

    # trend: compare first half vs second half liters
    if len(eff) >= 4:
        mid  = len(eff) // 2
        avg1 = sum(e["liters"] for e in eff[:mid]) / mid
        avg2 = sum(e["liters"] for e in eff[mid:]) / (len(eff) - mid)
        if avg2 > avg1 * 1.10:
            alerts.append("⚠ Fuel usage is increasing — recent fill-ups are higher than earlier ones.")
        elif avg2 < avg1 * 0.90:
            alerts.append("📉 Fuel usage is decreasing — great improvement trend!")

    # efficiency drop
    if len(eff) >= 4:
        mid    = len(eff) // 2
        eff1   = sum(e["km_per_liter"] for e in eff[:mid]) / mid
        eff2   = sum(e["km_per_liter"] for e in eff[mid:]) / (len(eff) - mid)
        if eff1 > 0 and (eff1 - eff2) / eff1 > 0.15:
            alerts.append("⚠ Fuel efficiency is decreasing — more than 15% drop detected.")

    if not alerts:
        alerts.append("✔ Driving pattern is stable — no significant anomalies detected.")

    # smart tips
    if avg_kml > 0 and avg_kml < 8:
        tips += [
            "🔧 Check tyre pressure — under-inflated tyres reduce fuel efficiency by up to 10%.",
            "🚗 Avoid aggressive acceleration; smooth throttle input saves fuel.",
            "🛢 Schedule an engine service — dirty air filters hurt mileage.",
        ]
    elif avg_kml < 12:
        tips += [
            "⚙ Consider a fuel injector clean to improve combustion efficiency.",
            "🛣 Use cruise control on highways to maintain steady speed.",
            "🌡 Park in shade; hot cabins make the A/C work harder and burn more fuel.",
        ]
    else:
        tips += [
            "🏆 Excellent fuel economy! Keep up the smooth driving habits.",
            "📅 Continue regular maintenance to sustain this performance level.",
            "🌱 Your efficient driving reduces carbon emissions — great job!",
        ]

    return alerts, tips, {
        "total_liters": round(total_liters, 2),
        "total_cost":   round(total_cost, 2),
        "total_km":     round(total_km, 2),
        "avg_km_per_liter": round(avg_kml, 2),
        "cost_per_km": round(total_cost / total_km, 4) if total_km > 0 else 0,
        "entries": len(rows),
    }

# ── matplotlib chart ──────────────────────────────────────────────────────────
def make_chart(eff):
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
        import matplotlib.dates as mdates
        from matplotlib.gridspec import GridSpec

        dates = [datetime.strptime(e["date"], "%Y-%m-%d") for e in eff]
        liters = [e["liters"] for e in eff]
        kml    = [e["km_per_liter"] for e in eff]

        fig = plt.figure(figsize=(12, 5), facecolor="#0a0f1e")
        gs  = GridSpec(1, 2, figure=fig, hspace=0.4, wspace=0.35)

        ax_color  = "#0a0f1e"
        grid_col  = "#1a2340"
        text_col  = "#c8d8f0"
        acc_blue  = "#3b82f6"
        acc_cyan  = "#06b6d4"
        acc_green = "#10b981"

        # ── chart 1: fuel usage ──
        ax1 = fig.add_subplot(gs[0])
        ax1.set_facecolor(ax_color)
        ax1.plot(dates, liters, color=acc_blue, linewidth=2.2, zorder=3)
        ax1.fill_between(dates, liters, alpha=0.18, color=acc_blue, zorder=2)
        ax1.scatter(dates, liters, color=acc_cyan, s=50, zorder=4, linewidths=0)
        ax1.set_title("Fuel Usage per Fill-up (L)", color=text_col, fontsize=11, pad=10, fontweight="bold")
        ax1.set_ylabel("Liters", color=text_col, fontsize=9)
        ax1.tick_params(colors=text_col, labelsize=8)
        ax1.xaxis.set_major_formatter(mdates.DateFormatter("%b %d"))
        fig.autofmt_xdate(rotation=30)
        for spine in ax1.spines.values(): spine.set_color(grid_col)
        ax1.yaxis.set_tick_params(color=grid_col)
        ax1.set_axisbelow(True)
        ax1.grid(True, color=grid_col, linewidth=0.7)

        # ── chart 2: efficiency ──
        ax2 = fig.add_subplot(gs[1])
        ax2.set_facecolor(ax_color)
        ax2.plot(dates, kml, color=acc_green, linewidth=2.2, zorder=3)
        ax2.fill_between(dates, kml, alpha=0.18, color=acc_green, zorder=2)
        ax2.scatter(dates, kml, color="#34d399", s=50, zorder=4, linewidths=0)
        ax2.set_title("Fuel Efficiency (KM/L)", color=text_col, fontsize=11, pad=10, fontweight="bold")
        ax2.set_ylabel("KM / Liter", color=text_col, fontsize=9)
        ax2.tick_params(colors=text_col, labelsize=8)
        ax2.xaxis.set_major_formatter(mdates.DateFormatter("%b %d"))
        fig.autofmt_xdate(rotation=30)
        for spine in ax2.spines.values(): spine.set_color(grid_col)
        ax2.set_axisbelow(True)
        ax2.grid(True, color=grid_col, linewidth=0.7)

        fig.suptitle("AutoPulse AI — Fuel Analytics", color=text_col, fontsize=13, fontweight="bold", y=1.02)
        os.makedirs(AI_DIR, exist_ok=True)
        plt.savefig(CHART_OUT, dpi=130, bbox_inches="tight", facecolor=fig.get_facecolor())
        plt.close()
        return True
    except ImportError as e:
        return False
    except Exception as e:
        return False

# ── main ──────────────────────────────────────────────────────────────────────
def main():
    ensure_data()
    rows = load_data()
    if not rows:
        ensure_data()
        rows = load_data()

    eff = compute_efficiency(rows)
    alerts, tips, stats = detect_patterns(rows, eff)
    chart_ok = make_chart(eff) if eff else False

    result = {
        "stats":   stats,
        "alerts":  alerts,
        "tips":    tips,
        "chart":   chart_ok,
        "entries": [
            {k: v for k, v in e.items()} for e in eff[-10:]
        ],
    }

    print("AUTOPULSE_JSON_START")
    print(json.dumps(result))
    print("AUTOPULSE_JSON_END")

if __name__ == "__main__":
    main()
