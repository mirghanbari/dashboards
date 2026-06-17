// ---------------------------------------------------------------------------
// fetch-data.mjs — the "AI agent" that goes out to the internet during the
// tournament and refreshes the dashboard's data.
//
// It asks Claude (with the server-side web_search tool) for the latest results,
// live scores, group standings, and top scorers, then MERGES that into the
// existing JSON files in src/data/ — updating match scores/status, team records,
// and player goal/assist tallies without disturbing the squad structure.
//
// Run locally:
//   export ANTHROPIC_API_KEY=sk-ant-...
//   npm run fetch-data
//
// In CI it is invoked by .github/workflows/update-data.yml on a schedule.
//
// Requires: npm i (installs @anthropic-ai/sdk, a devDependency) and an API key.
// If ANTHROPIC_API_KEY is not set, the script exits without touching the data,
// so a missing key never corrupts the committed dataset.
// ---------------------------------------------------------------------------
import Anthropic from "@anthropic-ai/sdk";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "src", "data");

if (!process.env.ANTHROPIC_API_KEY) {
  console.error(
    "ANTHROPIC_API_KEY is not set — skipping live fetch (existing data left untouched).",
  );
  process.exit(0);
}

const readJson = (file) => JSON.parse(readFileSync(join(DATA_DIR, file), "utf8"));
const writeJson = (file, obj) =>
  writeFileSync(join(DATA_DIR, file), JSON.stringify(obj, null, 2) + "\n");

const teams = readJson("teams.json");
const matches = readJson("matches.json");
const players = readJson("players.json");
const meta = readJson("meta.json");

const teamByCode = new Map(teams.map((t) => [t.code, t]));

// The shape we ask the agent to return. Kept compact so one response covers it.
const SCHEMA_HINT = `
Return ONLY a JSON object (no prose, no markdown fences) of this exact shape:
{
  "asOf": "ISO-8601 timestamp of the data",
  "matches": [
    {
      "homeCode": "3-letter FIFA code", "awayCode": "3-letter FIFA code",
      "homeScore": int|null, "awayScore": int|null,
      "status": "scheduled"|"live"|"finished", "minute": "clock token like \"23\", \"45+2\", or \"HT\""|null,
      "stage": "group"|"round32"|"round16"|"quarter"|"semi"|"third"|"final"
    }
  ],
  "scorers": [
    { "name": "player full name", "teamCode": "3-letter FIFA code", "goals": int, "assists": int }
  ]
}
Use official 3-letter FIFA codes (e.g. ARG, FRA, USA, MAR). Only include matches
you have concrete information about. Omit anything you are unsure of.`;

const VALID_CODES = [...teamByCode.keys()].join(", ");

const prompt = `You are a sports-data agent maintaining a ${meta.tournament} dashboard.
Today is ${new Date().toISOString().slice(0, 10)}.

Use web search to find the most recent ${meta.tournament} results: completed match
scores, any matches currently in progress (with the score and minute), and the
current top goal scorers and assist providers.

The 48 teams in this tournament use these FIFA codes: ${VALID_CODES}.

${SCHEMA_HINT}`;

const client = new Anthropic();

console.log("Asking the agent for the latest tournament data…");

const stream = client.messages.stream({
  model: "claude-opus-4-8",
  max_tokens: 32000,
  thinking: { type: "adaptive" },
  tools: [{ type: "web_search_20260209", name: "web_search" }],
  messages: [{ role: "user", content: prompt }],
});

const message = await stream.finalMessage();

// Pull the text blocks out of the final message and parse the JSON payload.
const text = message.content
  .filter((b) => b.type === "text")
  .map((b) => b.text)
  .join("")
  .trim();

function extractJson(raw) {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : raw;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No JSON object found in response.");
  return JSON.parse(body.slice(start, end + 1));
}

let payload;
try {
  payload = extractJson(text);
} catch (err) {
  console.error("Could not parse agent output as JSON:", err.message);
  console.error("Raw output was:\n", text.slice(0, 2000));
  process.exit(1);
}

// ---- Merge match results into matches.json + recompute team records ----------
function recompute() {
  for (const t of teams) {
    t.played = t.won = t.drawn = t.lost = 0;
    t.goalsFor = t.goalsAgainst = t.points = 0;
  }
  for (const m of matches) {
    if (m.status !== "finished" || m.group === null) continue;
    const home = teamByCode.get(teams.find((t) => t.id === m.homeTeamId)?.code);
    const away = teamByCode.get(teams.find((t) => t.id === m.awayTeamId)?.code);
    if (!home || !away || m.homeScore == null || m.awayScore == null) continue;
    home.played++; away.played++;
    home.goalsFor += m.homeScore; home.goalsAgainst += m.awayScore;
    away.goalsFor += m.awayScore; away.goalsAgainst += m.homeScore;
    if (m.homeScore > m.awayScore) { home.won++; away.lost++; home.points += 3; }
    else if (m.homeScore < m.awayScore) { away.won++; home.lost++; away.points += 3; }
    else { home.drawn++; away.drawn++; home.points++; away.points++; }
  }
}

let matchUpdates = 0;
for (const u of payload.matches ?? []) {
  const home = teamByCode.get(u.homeCode);
  const away = teamByCode.get(u.awayCode);
  if (!home || !away) continue;
  const m = matches.find(
    (x) =>
      (x.homeTeamId === home.id && x.awayTeamId === away.id) ||
      (x.homeTeamId === away.id && x.awayTeamId === home.id),
  );
  if (!m) continue;
  // Orient the scores to match the stored fixture's home/away.
  const flipped = m.homeTeamId === away.id;
  m.homeScore = flipped ? u.awayScore ?? null : u.homeScore ?? null;
  m.awayScore = flipped ? u.homeScore ?? null : u.awayScore ?? null;
  m.status = u.status ?? m.status;
  m.minute = u.status === "live" && u.minute != null ? String(u.minute) : null;
  matchUpdates++;
}

// ---- Merge scorer tallies into players.json ----------------------------------
let scorerUpdates = 0;
const DIACRITICS = /[̀-ͯ]/g; // combining marks, stripped after NFD
const norm = (s) => s.toLowerCase().normalize("NFD").replace(DIACRITICS, "");
for (const s of payload.scorers ?? []) {
  const team = teamByCode.get(s.teamCode);
  if (!team) continue;
  const p = players.find(
    (x) => x.teamId === team.id && norm(x.name) === norm(s.name),
  );
  if (!p) continue;
  if (typeof s.goals === "number") p.goals = s.goals;
  if (typeof s.assists === "number") p.assists = s.assists;
  scorerUpdates++;
}

recompute();

meta.lastUpdated = new Date().toISOString();
meta.source = "fetch-data.mjs (Claude + web search)";
meta.note = `Live data refreshed ${meta.lastUpdated}. As-of ${payload.asOf ?? "unknown"}.`;

writeJson("matches.json", matches);
writeJson("teams.json", teams);
writeJson("players.json", players);
writeJson("meta.json", meta);

console.log(
  `Done. Updated ${matchUpdates} matches and ${scorerUpdates} scorers. Standings recomputed.`,
);
