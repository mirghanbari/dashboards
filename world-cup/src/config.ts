// ---------------------------------------------------------------------------
// Bracket challenge configuration.
// ---------------------------------------------------------------------------

// Public Google Apps Script Web App endpoint backing the bracket pool.
// (Public by design; the pool password gates submissions.)
export const BRACKET_API_URL =
  "https://script.google.com/macros/s/AKfycbyYgE1sEih8YktNrOax8H2gXvgl7_CIPYRjr3LE3tQjsvhIh4YDMNofWU13EMMq3JSc/exec";

// When picks lock (first kickoff). Kept in sync with the Apps Script LOCK_ISO.
export const LOCK_ISO = "2026-06-11T19:00:00Z";

// ESPN Group Stage Challenge scoring. The leaderboard recomputes live.
export const SCORING = {
  // Points for a team finishing in the exact slot you predicted: 1st/2nd/3rd/4th.
  position: [25, 15, 10, 5],
  correctThird: 5, // per 3rd-place team you picked that actually advances
  perfectGroup: 10, // bonus for nailing all four positions in a group
};

// How many 3rd-place teams advance to the knockout round (2026 format).
export const THIRDS_ADVANCING = 8;
