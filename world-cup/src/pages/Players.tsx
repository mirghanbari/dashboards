import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { PLAYERS, TEAMS, getTeam } from "../data";
import type { Player, Position } from "../types";

type SortKey = "goals" | "assists" | "appearances" | "minutes" | "yellowCards" | "name";

const SORTS: { value: SortKey; label: string }[] = [
  { value: "goals", label: "Goals" },
  { value: "assists", label: "Assists" },
  { value: "appearances", label: "Apps" },
  { value: "minutes", label: "Minutes" },
  { value: "yellowCards", label: "Cards" },
  { value: "name", label: "Name" },
];

const POSITIONS: (Position | "all")[] = ["all", "GK", "DEF", "MID", "FWD"];

export function Players() {
  const [search, setSearch] = useState("");
  const [position, setPosition] = useState<Position | "all">("all");
  const [team, setTeam] = useState("all");
  const [sort, setSort] = useState<SortKey>("goals");

  const teamOptions = useMemo(
    () => [...TEAMS].sort((a, b) => a.name.localeCompare(b.name)),
    [],
  );

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = PLAYERS.filter((p) => {
      if (position !== "all" && p.position !== position) return false;
      if (team !== "all" && p.teamId !== team) return false;
      if (q && !p.name.toLowerCase().includes(q) && !p.club.toLowerCase().includes(q))
        return false;
      return true;
    });
    const cmp = (a: Player, b: Player) => {
      if (sort === "name") return a.name.localeCompare(b.name);
      return (b[sort] as number) - (a[sort] as number) || b.goals - a.goals;
    };
    return filtered.sort(cmp).slice(0, 300);
  }, [search, position, team, sort]);

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
            <select value={team} onChange={(e) => setTeam(e.target.value)}>
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
            <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
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
            <th className="col-player">Player</th>
            <th className="col-team">Team</th>
            <th>Pos</th>
            <th>Apps</th>
            <th>G</th>
            <th>A</th>
            <th>Min</th>
            <th>🟨</th>
            <th>🟥</th>
          </tr>
        </thead>
        <tbody>
          {visible.map((p, i) => {
            const t = getTeam(p.teamId);
            return (
              <tr key={p.id}>
                <td className="col-rank">{i + 1}</td>
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
