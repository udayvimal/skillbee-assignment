# Screenshots Required for README

Save each screenshot as the filename listed below inside this folder (`docs/screenshots/`).

## How to take screenshots

1. Run the backend: `cd backend && uvicorn app.main:app --reload --port 8000`
2. Run the frontend: `cd frontend && npm run dev`
3. Open **http://localhost:3000** in Chrome
4. Take screenshots at the exact moments described below
5. Crop to just the browser viewport (no OS chrome/taskbar)
6. Save as 1280x800 PNG minimum

---

## Screenshot List

| Filename | Page | What to capture |
|----------|------|----------------|
| `landing.png` | http://localhost:3000 | Full landing page — form on right, feature list on left |
| `landing-form.png` | http://localhost:3000 | Just the form card — with a role selected (e.g. Backend) and name filled in |
| `interview-room.png` | /interview?session=... | Interview room during agent speaking — "Agent Speaking" pill visible, waveform active |
| `voice-controls.png` | /interview?session=... | Close-up of Start Speaking / Done Speaking buttons with waveform |
| `transcript.png` | /interview?session=... | Transcript panel showing 2-3 agent messages + 1 user answer |
| `processing.png` | /interview?session=... | "Processing answer..." spinner state |
| `analytics-dashboard.png` | /results/[id] | Full analytics page — scroll to show overall score card + category grid |
| `question-breakdown.png` | /results/[id] | One question card expanded — showing 6 sub-scores + ideal answer |
| `radar-chart.png` | /results/[id] | Just the radar chart section — 6-axis performance visualization |
| `pdf-report.png` | /results/[id] | PDF preview or the generated PDF open in browser |
| `overall-score.png` | /results/[id] | The large overall score card (grade, hiring signal, overall impression) |

---

## Quick capture order

1. Open landing → screenshot → fill form → screenshot
2. Click Begin Interview → wait for intro audio → screenshot interview room
3. Answer one question → screenshot processing state
4. Complete 3-question interview
5. Screenshot results page at multiple scroll positions
6. Click "Download Report" → screenshot PDF in browser

---

*These images are referenced in README.md and will display on the GitHub repository page once uploaded.*
