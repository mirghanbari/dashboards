import type { SortKey } from "../types";

interface ControlsProps {
  search: string;
  onSearch: (value: string) => void;
  sort: SortKey;
  onSort: (value: SortKey) => void;
  seasons: number[];
  activeSeason: "all" | number;
  onSeason: (value: "all" | number) => void;
}

export function Controls({
  search,
  onSearch,
  sort,
  onSort,
  seasons,
  activeSeason,
  onSeason,
}: ControlsProps) {
  return (
    <section className="controls">
      <div className="search-wrap">
        <span className="search-ico" aria-hidden="true">
          ⌕
        </span>
        <input
          id="search"
          type="search"
          placeholder="Search episodes or synopses…"
          autoComplete="off"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
        />
      </div>

      <div className="control-group">
        <label htmlFor="sort">Sort</label>
        <select
          id="sort"
          value={sort}
          onChange={(e) => onSort(e.target.value as SortKey)}
        >
          <option value="rank">By Rank</option>
          <option value="score">By Score (high → low)</option>
          <option value="season">By Season</option>
          <option value="title">By Title (A → Z)</option>
        </select>
      </div>

      <div className="season-filters" aria-label="Filter by season">
        <button
          className={"chip" + (activeSeason === "all" ? " active" : "")}
          onClick={() => onSeason("all")}
        >
          All Seasons
        </button>
        {seasons.map((s) => (
          <button
            key={s}
            className={"chip" + (activeSeason === s ? " active" : "")}
            onClick={() => onSeason(s)}
          >
            Season {s}
          </button>
        ))}
      </div>
    </section>
  );
}
