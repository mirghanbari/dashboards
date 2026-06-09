import { groupLetters, standingsForGroup, getTeam } from "./data";
import { BRACKET_API_URL, SCORING, THIRDS_ADVANCING, LOCK_ISO } from "./config";

// A bracket entry's picks: predicted finishing order per group (team ids, 1st→4th)
// and the set of 3rd-place teams the player backs to advance.
export interface Picks {
  groups: Record<string, string[]>;
  thirds: string[];
}

/** Default predicted order = current standings order for every group. */
export function defaultPicks(): Picks {
  const groups: Record<string, string[]> = {};
  for (const g of groupLetters) {
    groups[g] = standingsForGroup(g).map((t) => t.id);
  }
  return { groups, thirds: [] };
}

/** The team a player has slotted 3rd in each group — the Step 2 candidates. */
export function thirdCandidates(picks: Picks): string[] {
  return groupLetters.map((g) => picks.groups[g]?.[2]).filter(Boolean);
}

const strength = (a: { points: number; goalDiff: number; goalsFor: number; fifaRank: number },
  b: { points: number; goalDiff: number; goalsFor: number; fifaRank: number }) =>
  b.points - a.points || b.goalDiff - a.goalDiff || b.goalsFor - a.goalsFor || a.fifaRank - b.fifaRank;

/** Actual results from live standings: order per group + the 8 advancing thirds. */
export function actualResults() {
  const positions: Record<string, string[]> = {};
  const thirds: ReturnType<typeof standingsForGroup> = [];
  for (const g of groupLetters) {
    const rows = standingsForGroup(g);
    positions[g] = rows.map((t) => t.id);
    if (rows[2]) thirds.push(rows[2]);
  }
  const advancingThirds = new Set(
    [...thirds].sort(strength).slice(0, THIRDS_ADVANCING).map((t) => t.id),
  );
  return { positions, advancingThirds };
}

export interface ScoreBreakdown {
  total: number;
  positionPoints: number;
  perfectGroups: number;
  perfectBonus: number;
  thirdsCorrect: number;
  thirdsPoints: number;
}

/** Score an entry's picks against the current actual results. */
export function scoreEntry(picks: Picks): ScoreBreakdown {
  const { positions, advancingThirds } = actualResults();
  let positionPoints = 0;
  let perfectGroups = 0;
  for (const g of groupLetters) {
    const pred = picks.groups[g] ?? [];
    const actual = positions[g] ?? [];
    let groupCorrect = 0;
    for (let i = 0; i < 4; i++) {
      if (pred[i] && pred[i] === actual[i]) {
        positionPoints += SCORING.position[i]; // 25 / 15 / 10 / 5 by slot
        groupCorrect++;
      }
    }
    if (groupCorrect === 4) perfectGroups++;
  }
  const thirdsCorrect = (picks.thirds ?? []).filter((id) => advancingThirds.has(id)).length;
  const perfectBonus = perfectGroups * SCORING.perfectGroup;
  const thirdsPoints = thirdsCorrect * SCORING.correctThird;
  return {
    positionPoints,
    perfectGroups,
    perfectBonus,
    thirdsCorrect,
    thirdsPoints,
    total: positionPoints + perfectBonus + thirdsPoints,
  };
}

export const isLocked = () => Date.now() >= new Date(LOCK_ISO).getTime();

// ---------------- Local persistence (in-progress picks + identity) ----------
const LS = {
  picks: "wc-bracket-picks",
  entryId: "wc-bracket-entryId",
  name: "wc-bracket-name",
};

export function loadPicks(): Picks | null {
  try {
    const raw = localStorage.getItem(LS.picks);
    return raw ? (JSON.parse(raw) as Picks) : null;
  } catch {
    return null;
  }
}
export const savePicks = (p: Picks) => localStorage.setItem(LS.picks, JSON.stringify(p));
export const loadName = () => localStorage.getItem(LS.name) ?? "";
export const saveName = (n: string) => localStorage.setItem(LS.name, n);
export function entryId(): string {
  let id = localStorage.getItem(LS.entryId);
  if (!id) {
    id = "e-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem(LS.entryId, id);
  }
  return id;
}

// ---------------- Remote pool (Google Apps Script Web App) ------------------
export interface RemoteEntry {
  timestamp: string;
  name: string;
  entryId: string;
  picks: Picks;
}

export async function fetchEntries(): Promise<RemoteEntry[]> {
  const res = await fetch(BRACKET_API_URL, { method: "GET" });
  const data = await res.json();
  return (data.entries ?? []).filter((e: RemoteEntry) => e.picks);
}

export async function submitEntry(name: string, password: string, picks: Picks): Promise<{ ok: boolean; error?: string }> {
  const id = entryId();
  await fetch(BRACKET_API_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ name, password, picks, entryId: id }),
  });
  // Apps Script POST responses arrive via a redirect that's awkward to read
  // cross-origin, so confirm the write by reading the pool back.
  try {
    const entries = await fetchEntries();
    const mine = entries.find((e) => e.entryId === id);
    if (mine && mine.name === name) return { ok: true };
    return { ok: false, error: "Submission didn't save — check the pool password and try again." };
  } catch {
    return { ok: false, error: "Couldn't confirm the submission. Check your connection and try again." };
  }
}

export const teamName = (id: string) => getTeam(id).name;
export const teamFlag = (id: string) => getTeam(id).flag;
