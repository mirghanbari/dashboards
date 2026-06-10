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

/** The 8 third-place teams currently advancing, by live standings. */
export function advancingThirds(): Set<string> {
  const thirds: ReturnType<typeof standingsForGroup> = [];
  for (const g of groupLetters) {
    const rows = standingsForGroup(g);
    if (rows[2]) thirds.push(rows[2]);
  }
  return new Set(
    [...thirds].sort(strength).slice(0, THIRDS_ADVANCING).map((t) => t.id),
  );
}

/** A group is decided once all four teams have played their three matches. */
const groupComplete = (g: string) => {
  const rows = standingsForGroup(g);
  return rows.length === 4 && rows.every((t) => t.played >= 3);
};
export const groupStageComplete = () => groupLetters.every(groupComplete);

export interface ScoreBreakdown {
  total: number;
  positionPoints: number;
  perfectGroups: number;
  perfectBonus: number;
  thirdsCorrect: number;
  thirdsPoints: number;
}

/**
 * Live scoring — everything starts at 0 and updates as games finish:
 * - Position points are provisional against the current live standings; a slot
 *   only scores once the team sitting in it has actually played a match.
 * - The Perfect-Group bonus locks in only once a group is fully played.
 * - Third-place points are awarded once the whole group stage is decided.
 */
export function scoreEntry(picks: Picks): ScoreBreakdown {
  let positionPoints = 0;
  let perfectGroups = 0;
  for (const g of groupLetters) {
    const rows = standingsForGroup(g);
    const pred = picks.groups[g] ?? [];
    let groupCorrect = 0;
    for (let i = 0; i < 4; i++) {
      const actual = rows[i];
      if (actual && actual.played > 0 && pred[i] === actual.id) {
        positionPoints += SCORING.position[i]; // 25 / 15 / 10 / 5 by slot
        groupCorrect++;
      }
    }
    if (groupCorrect === 4 && groupComplete(g)) perfectGroups++;
  }
  let thirdsCorrect = 0;
  if (groupStageComplete()) {
    const advancing = advancingThirds();
    thirdsCorrect = (picks.thirds ?? []).filter((id) => advancing.has(id)).length;
  }
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

/** Forget this browser's working entry so the next submit creates a new bracket.
 *  Already-submitted entries stay on the leaderboard (they keep their own ids). */
export function clearLocalEntry() {
  localStorage.removeItem(LS.entryId);
  localStorage.removeItem(LS.picks);
  localStorage.removeItem(LS.name);
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
