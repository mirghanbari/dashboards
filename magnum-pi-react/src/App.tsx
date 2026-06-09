import { useMemo, useState } from "react";
import { EPISODES } from "./data";
import type { SortKey } from "./types";
import { Hero } from "./components/Hero";
import { Stats } from "./components/Stats";
import { Controls } from "./components/Controls";
import { EpisodeCard } from "./components/EpisodeCard";

export default function App() {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("rank");
  const [activeSeason, setActiveSeason] = useState<"all" | number>("all");

  const seasons = useMemo(
    () => [...new Set(EPISODES.map((e) => e.season))].sort((a, b) => a - b),
    [],
  );

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = EPISODES.filter((ep) => {
      const seasonOk = activeSeason === "all" || ep.season === activeSeason;
      const text = (ep.title + " " + ep.synopsis).toLowerCase();
      return seasonOk && (q === "" || text.includes(q));
    });

    const sorted = [...filtered].sort((a, b) => {
      switch (sort) {
        case "score":
          return b.score - a.score || a.rank - b.rank;
        case "season":
          return a.season - b.season || a.rank - b.rank;
        case "title":
          return a.title.localeCompare(b.title);
        default:
          return a.rank - b.rank;
      }
    });

    return sorted;
  }, [search, sort, activeSeason]);

  return (
    <>
      <div className="aloha-stripe" />
      <Hero />

      <main>
        <Stats episodes={EPISODES} />

        <Controls
          search={search}
          onSearch={setSearch}
          sort={sort}
          onSort={setSort}
          seasons={seasons}
          activeSeason={activeSeason}
          onSeason={setActiveSeason}
        />

        <section className="grid" aria-live="polite">
          {visible.map((ep, i) => (
            <EpisodeCard key={ep.rank} episode={ep} index={i} />
          ))}
        </section>

        {visible.length === 0 && (
          <p className="empty">No episodes match your search.</p>
        )}
      </main>

      <footer className="site-footer">
        <p>
          <strong>Scoring:</strong> composite 10-point scale blending IMDb fan
          ratings with critical consensus.
        </p>
        <p className="sources">
          Sources: episode.ninja · episodehive · Wikipedia · ScreenRant · AV Club · IMDb
        </p>
      </footer>
    </>
  );
}
