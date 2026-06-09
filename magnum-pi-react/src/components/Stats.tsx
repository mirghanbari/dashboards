import { useMemo } from "react";
import type { Episode } from "../types";

interface StatsProps {
  episodes: Episode[];
}

export function Stats({ episodes }: StatsProps) {
  const cards = useMemo(() => {
    const scores = episodes.map((e) => e.score);
    const avg = (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2);
    const top = Math.max(...scores).toFixed(1);

    const counts: Record<number, number> = {};
    for (const e of episodes) counts[e.season] = (counts[e.season] ?? 0) + 1;
    const bestSeason = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];

    return [
      { value: String(episodes.length), label: "Episodes Ranked" },
      { value: avg, label: "Average Score" },
      { value: top, label: "Top Score" },
      { value: "S" + bestSeason, label: "Most-Featured Season" },
    ];
  }, [episodes]);

  return (
    <section className="stats" aria-label="Summary statistics">
      {cards.map((c) => (
        <div className="stat-card" key={c.label}>
          <div className="stat-value">{c.value}</div>
          <div className="stat-label">{c.label}</div>
        </div>
      ))}
    </section>
  );
}
