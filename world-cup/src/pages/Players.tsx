import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { PLAYERS, TEAMS, getTeam } from "../data";
import type { Player, Position } from "../types";

type SortKey =
  | "goals"
  | "assists"
  | "appearances"
  | "minutes"
  | "yellowCards"
  | "redCards"
  | "name"
  | "jersey"
  | "team"
  | "position";
type SortDir = "asc" | "desc";

const SORTS: { value: SortKey; label: string }[] = [
  { value: "goals", label: "Goals" },
  { value: "assists", label: "Assists" },
  { value: "appearances", label: "Apps" },
  { value: "minutes", label: "Minutes" },
  { value: "yellowCards", label: "Cards" },
  { value: "jersey", label: "Jersey #" },
  { value: "name", label: "Name" },
];

// The natural first direction when a column is freshly selected: text columns
// read A→Z, the counting stats read highest-first, and jersey reads like a
// squad list (1, 2, 3…).
const DEFAULT_DIR: Record<SortKey, SortDir> = {
  name: "asc",
  team: "asc",
  position: "asc",
  jersey: "asc",
  goals: "desc",
  assists: "desc",
  appearances: "desc",
  minutes: "desc",
  yellowCards: "desc",
  redCards: "desc",
};

const POSITIONS: (Position | "all")[] = ["all", "GK", "DEF", "MID", "FWD"];

export function Players() {
  const [search, setSearch] = useState("");
  const [position, setPosition] = useState<Position | "all">("all");
  const [team, setTeam] = useState("all");
  const [sort, setSort] = useState<SortKey>("goals");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const teamOptions = useMemo(
    () => [...TEAMS].sort((a, b) => a.name.localeCompare(b.name)),
    [],
  );

  // Pick a column: same one flips direction, a new one starts in its natural
  // direction. Used by both the header clicks and the "Sort by" dropdown.
  function sortBy(key: SortKey) {
    if (key === sort) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSort(key);
      setSortDir(DEFAULT_DIR[key]);
    }
  }

  // Small ▲/▼ caret on the active column header.
  function Caret({ for: key }: { for: SortKey }) {
    if (key !== sort) return null;
    return <span className="sort-caret">{sortDir === "asc" ? "▲" : "▼"}</span>;
  }

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = PLAYERS.filter((p) => {
      if (position !== "all" && p.position !== position) return false;
      if (team !== "all" && p.teamId !== team) return false;
      if (q && !p.name.toLowerCase().includes(q) && !p.club.toLowerCase().includes(q))
        return false;
      return true;
    });
    // Comparable value for the active column. Text columns compare
    // alphabetically; everything else is a number.
    const value = (p: Player): string | number => {
      if (sort === "name") return p.name;
      if (sort === "team") return getTeam(p.teamId).name;
      if (sort === "position") return p.position;
      if (sort === "jersey") return p.number;
      return p[sort] as number;
    };
    const dir = sortDir === "asc" ? 1 : -1;
    const cmp = (a: Player, b: Player) => {
      const av = value(a);
      const bv = value(b);
      const c =
        typeof av === "string" && typeof bv === "string"
          ? av.localeCompare(bv)
          : (av as number) - (bv as number);
      if (c !== 0) return c * dir;
      return b.goals - a.goals; // stable tiebreak: most goals first
    };
    return filtered.sort(cmp).slice(0, 300);
  }, [search, position, team, sort, sortDir]);

  return (
    <>
      <header className="page-head">
        <h1 className="page-title">Players</h1>
        <p className="page-sub">
          Showing {visible.length} of {PLAYERS.length} players
        </p>
      </header>

      <div className="filters">
        <input
          className="search"
          type="search"
          placeholder="Search player or club…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="chip-row">
          {POSITIONS.map((p) => (
            <button
              key={p}
              className={"chip" + (position === p ? " is-active" : "")}
              onClick={() => setPosition(p)}
            >
              {p === "all" ? "All positions" : p}
            </button>
          ))}
        </div>
        <div className="filter-selects">
          <label>
            Team
            <select
              value={team}
              onChange={(e) => {
                const next = e.target.value;
                setTeam(next);
                // A single-team view reads like a squad list; the all-players
                // view reads like a leaderboard. Default the sort to match.
                const key: SortKey = next === "all" ? "goals" : "jersey";
                setSort(key);
                setSortDir(DEFAULT_DIR[key]);
              }}
            >
              <option value="all">All teams</option>
              {teamOptions.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.flag} {t.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Sort by
            <select
              value={sort}
              onChange={(e) => {
                const key = e.target.value as SortKey;
                setSort(key);
                setSortDir(DEFAULT_DIR[key]);
              }}
            >
              {SORTS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <table className="player-table">
        <thead>
          <tr>
            <th className="col-rank">#</th>
            <th
              className={"col-num pred-th" + (sort === "jersey" ? " is-sorted" : "")}
              onClick={() => sortBy("jersey")}
              title="Sort by jersey number"
            >
              No.
              <Caret for="jersey" />
            </th>
            <th
              className={"col-player pred-th" + (sort === "name" ? " is-sorted" : "")}
              onClick={() => sortBy("name")}
              title="Sort by player name"
            >
              Player
              <Caret for="name" />
            </th>
            <th
              className={"col-team pred-th" + (sort === "team" ? " is-sorted" : "")}
              onClick={() => sortBy("team")}
              title="Sort by team"
            >
              Team
              <Caret for="team" />
            </th>
            <th
              className={"pred-th" + (sort === "position" ? " is-sorted" : "")}
              onClick={() => sortBy("position")}
              title="Sort by position"
            >
              Pos
              <Caret for="position" />
            </th>
            <th
              className={"pred-th" + (sort === "appearances" ? " is-sorted" : "")}
              onClick={() => sortBy("appearances")}
              title="Sort by appearances"
            >
              Apps
              <Caret for="appearances" />
            </th>
            <th
              className={"pred-th" + (sort === "goals" ? " is-sorted" : "")}
              onClick={() => sortBy("goals")}
              title="Sort by goals"
            >
              G
              <Caret for="goals" />
            </th>
            <th
              className={"pred-th" + (sort === "assists" ? " is-sorted" : "")}
              onClick={() => sortBy("assists")}
              title="Sort by assists"
            >
              A
              <Caret for="assists" />
            </th>
            <th
              className={"pred-th" + (sort === "minutes" ? " is-sorted" : "")}
              onClick={() => sortBy("minutes")}
              title="Sort by minutes"
            >
              Min
              <Caret for="minutes" />
            </th>
            <th
              className={"pred-th" + (sort === "yellowCards" ? " is-sorted" : "")}
              onClick={() => sortBy("yellowCards")}
              title="Sort by yellow cards"
            >
              🟨
              <Caret for="yellowCards" />
            </th>
            <th
              className={"pred-th" + (sort === "redCards" ? " is-sorted" : "")}
              onClick={() => sortBy("redCards")}
              title="Sort by red cards"
            >
              🟥
              <Caret for="redCards" />
            </th>
          </tr>
        </thead>
        <tbody>
          {visible.map((p, i) => {
            const t = getTeam(p.teamId);
            return (
              <tr key={p.id}>
                <td className="col-rank">{i + 1}</td>
                <td className="col-num">{p.number || "—"}</td>
                <td className="col-player">
                  <Link to={`/players/${p.id}`} className="player-name player-link">
                    {p.name}
                  </Link>
                  <small className="player-club">
                    {[p.height, p.weight].filter(Boolean).join(" · ")}
                  </small>
                </td>
                <td className="col-team">
                  <Link to={`/teams/${t.id}`} className="team-cell">
                    <span className="team-flag">{t.flag}</span>
                    <span className="team-code">{t.code}</span>
                  </Link>
                </td>
                <td>
                  <span className={"pos-badge pos-" + p.position}>{p.position}</span>
                </td>
                <td>{p.appearances}</td>
                <td className="num-strong">{p.goals}</td>
                <td>{p.assists}</td>
                <td>{p.minutes}</td>
                <td>{p.yellowCards || ""}</td>
                <td>{p.redCards || ""}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {visible.length === 0 && <p className="empty">No players match these filters.</p>}
    </>
  );
}
