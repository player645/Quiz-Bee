# Philippine Social Science Quiz Bee

Two modes in one app:

* **Practice Mode**: self-paced study with categories, difficulty, question type and length filters, instant feedback, results by category and type, and an answer review.
* **Actual Game**: a live competition. A host creates a room, players join with a 6-character code, and a **real game server** controls the timer, validates answers, keeps the answer key private and computes scores.

The original single-file game is preserved in `legacy/original-index.html`. All 64 original questions are in `src/data/defaultQuestions.ts` and are checked against the original file by the tests.

## Contents

1. [Run it locally](#1-run-it-locally)
2. [Test with phones or other computers](#2-test-with-phones-or-other-computers)
3. [How the live game works](#3-how-the-live-game-works)
4. [Custom questionnaires](#4-custom-questionnaires)
5. [Deploy to GitHub](#5-deploy-to-github)
6. [Project layout](#6-project-layout)
7. [Limits and honest caveats](#7-limits-and-honest-caveats)

## 1. Run it locally

You need **Node.js 22.18 or newer** (<https://nodejs.org>, choose LTS). Check with `node -v`.

```bash
npm install          # also creates package-lock.json (commit it)
npm run dev:all      # starts the website (port 5173) and the game server (port 8787)
```

Open <http://localhost:5173>.

* Practice Mode needs only the website.
* Actual Game needs the game server too. `dev:all` starts both. To run them separately: `npm run dev` in one terminal and `npm run server` in another.

Other commands:

| Command | What it does |
|---|---|
| `npm test` | Runs all tests (question preservation, scoring, import validation, game engine, real HTTP/real-time server tests) |
| `npm run typecheck` | Full TypeScript check (optional) |
| `npm run build` | Production build into `dist/` |
| `npm start` | Runs the game server; if `dist/` exists it also serves the built website on the same port (<http://localhost:8787>) |

### Try a live game on one computer

1. Open <http://localhost:5173> in a normal window and choose **Host a game**, then **Create game**.
2. Open two more browser windows (use a private window for the second one so it is a separate session), choose **Join a game**, enter the code and two different names.
3. Click **Start game** on the host. Answer in the player windows, watch the reveal and standings, and continue to the end.

## 2. Test with phones or other computers

Everything on the same Wi-Fi network:

1. Run `npm run dev:all`. Vite prints a **Network** address such as `http://192.168.1.20:5173`.
2. Open that address on the phone. API calls go through the same address (Vite forwards `/api` to the game server), so nothing else needs configuring.
3. If it does not load, allow Node.js through the Windows firewall for private networks.

Alternative: `npm run build` then `npm start`, and open `http://<your-computer-ip>:8787` on the other devices.

## 3. How the live game works

**Roles.** The host's browser holds a secret host token; each player's browser holds a secret player token. They are stored in `localStorage` and sent with every request. The server rejects host actions without the host token and never sends the answer key to players.

**States.** `lobby → question → reveal → (next question or) finished`.

| Event | Rule |
|---|---|
| Start | Host only, at least 1 player. Opens question 1. |
| Question open | Everyone receives the same question and the same option order. The **server** sets the deadline. |
| Answer | One per player per question. Rejected if the question is not open, is not the current one, was already answered, or arrives after the deadline (server clock). |
| Close | The question closes at the deadline, **or** when the host clicks **Reveal answer now**, **or** (optional setting, on by default) when every joined player has answered. |
| Reveal | Correct answer, explanation, how many picked each option, and standings. Host then clicks **Next question**. |
| End | Host can end early (with a confirmation). Final standings show to everyone. |

Players see a countdown that follows the server clock (each update carries the server time), but the server alone decides whether an answer is on time.

**Scoring** (set by the host; Practice scoring is never affected):
* Wrong or missing answer: 0.
* Correct answer: the question's points (multiple choice 1, identification 2 by default) or a flat value for every question.
* Optional speed bonus: `base + round(base × 0.5 × timeLeft / totalTime)`, so up to +50%, shrinking linearly.
* Scores, correct/incorrect counts and ranks only include questions whose results have been revealed, so nothing leaks early.

**Ties.** Players are ordered by points, then by correct answers, then by name. Players equal on points and correct answers **share a rank** (1, 1, 3, ...).

**Names.** 1 to 24 characters, extra spaces removed. A name already used in the room (any capitalization) is rejected. New players can join only in the lobby.

**Refresh and reconnection.** A refreshed player keeps the same token, so they rejoin as the same player and cannot answer again; their own answer is shown as locked. After a refresh, use **Rejoin** on the home page. If the network drops, the browser reconnects automatically and shows a "Reconnecting" banner. If the host disconnects, players see a banner and the game keeps its state; the server timers still run, so questions close on schedule.

**Room lifetime.** Rooms are stored **in the server's memory**. A room is deleted 30 minutes after the game finishes or after 4 hours without activity, and **all rooms are lost if the server restarts**. There is no database.

## 4. Custom questionnaires

In **Host a game** (and Practice Mode), choose **My own questionnaire file**. Download the sample JSON or CSV from the same screen (they are also in `samples/`).

CSV columns: `type, category, question, correct` (required) and `difficulty, points, choice1..choice6, accepted, explanation, id, tags` (optional).

* `type`: `mc` or `id`.
* `mc`: 2 to 6 choices; `correct` is the correct choice's text or its letter (A, B, ...).
* `id`: `correct` is the answer; `accepted` lists extra accepted answers separated by `|`. Matching ignores capitalization, accents, punctuation and a leading "the". There is no fuzzy matching.
* `difficulty`: easy, medium or hard; **missing values become medium**. `points`: 1 to 100; defaults are 1 (mc) and 2 (id).
* Up to 200 questions and 1 MB per file. New categories work automatically in filters and results.

Errors are listed with row numbers (CSV; the header is row 1) or question numbers (JSON) and field names. Nothing starts until the file is valid; a preview table is shown first. The server validates the questionnaire again when the room is created. Imported text is always displayed as plain text, never as HTML. The built-in bank is never modified.

To add a built-in category permanently, add questions with the new `category` to `src/data/defaultQuestions.ts` (or to `scripts/migrate-original.mjs`).

## 5. Deploy to GitHub

GitHub Pages hosts only static files, so it can host the **website** but not the **game server**. Deploy in two parts.

### Part A: the game server (needed for Actual Game)

The server is one dependency-free Node process (`server/index.ts`, Node 22.18+). Host it anywhere that runs Node and supports long-lived HTTP connections, for example Render, Railway, Fly.io or a small VPS. Example using Render ("Web Service" from your GitHub repo):

* Build command: leave empty or `npm install`
* Start command: `node server/index.ts`
* Environment variables: `ALLOWED_ORIGINS=https://<your-user>.github.io` and `TRUST_PROXY=1`
* The service URL (for example `https://quizbee-api.onrender.com`) is your `VITE_API_URL`.

A `Dockerfile` is included for hosts that prefer containers (not tested here). Free tiers often **sleep when idle**, so the first request can take 30 to 60 seconds; check your provider's current limits and pricing. Run a single instance only, because rooms live in that process's memory.

No secrets are needed: there are no service accounts or API keys. Never put private credentials in frontend code or the repository.

### Part B: the website on GitHub Pages

1. Create a GitHub repository (for example `quizbee`) and push this project to the `main` branch:
   ```bash
   git init && git add . && git commit -m "Quiz Bee"
   git branch -M main
   git remote add origin https://github.com/<you>/quizbee.git
   git push -u origin main
   ```
   (Run `npm install` once first so `package-lock.json` is included.)
2. In the repository: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. **Settings → Secrets and variables → Actions → Variables → New repository variable**: name `VITE_API_URL`, value your server URL from Part A (no trailing slash). Public values only.
4. Push to `main` (or run the workflow manually in the **Actions** tab). `.github/workflows/deploy.yml` runs the tests, builds with the correct `/<repo-name>/` base path and deploys.
5. Open `https://<you>.github.io/<repo-name>/`.

The app uses hash links (`#/join/CODE`), so refreshing or sharing join links works on GitHub Pages without extra setup.

### Verify the deployed game

1. Open the public site on your computer, choose **Host a game** and create a game with the default questions.
2. Open the site on a phone (mobile data, not your Wi-Fi) and a second device; join with the code and two different names.
3. Start, answer, let one question run out the timer, refresh one player and use **Rejoin**, finish the game, and confirm the final ranking is the same on all screens.

## 6. Project layout

```
src/core/            Pure logic shared by the browser and the server: types, answer matching,
                     question selection, scoring/ranking, questionnaire import, live-game types
src/data/            Default question bank (generated from the original, safe to edit)
src/modes/practice/  Practice setup, play, results, review
src/modes/live/      Host setup, host room, player join, player room
src/components/      Reusable UI (choices, filters, import panel, leaderboard, timer)
src/services/        Game-server client (fetch + Server-Sent Events), session storage, hooks
src/styles/          base.css, practice.css, live.css
server/              Authoritative game engine (room.ts), HTTP + real-time server (app.ts, index.ts)
tests/               node:test suites (run with `npm test`)
samples/             Sample questionnaires (JSON, CSV)
legacy/              The original HTML game, untouched
scripts/             Migration script that builds the question bank from the original
docs/                Question bank review notes
.github/workflows/   GitHub Pages deployment
```

Why this backend: a small Node server lets the **server** hold the answer key, enforce deadlines and compute scores, with no accounts or paid plans needed to test locally. Real-time updates use Server-Sent Events (server to browser) plus normal HTTPS requests (browser to server).

## 7. Limits and honest caveats

* **In-memory rooms** (see section 3). For a multi-server or restart-proof setup you would add a database (for example Redis or Postgres) behind `GameRoom`.
* Server limits: 200 rooms, 100 players per room, 2 MB request bodies, basic per-IP rate limits (20 room creations per 10 minutes, 120 joins per minute). Players behind one shared network address share these limits.
* Tokens travel in the event-stream URL (browsers cannot set headers on `EventSource`). Use HTTPS in production, which every host above provides.
* Difficulty labels on the built-in questions are initial judgments; see `docs/QUESTION_BANK_NOTES.md`.
* Sound effects are not included. Animations are minimal and disabled for people who prefer reduced motion.
