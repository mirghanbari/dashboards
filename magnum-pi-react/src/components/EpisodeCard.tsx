import type { Episode } from "../types";

interface EpisodeCardProps {
  episode: Episode;
  index: number;
}

// Score color ramp (warm-to-cool by quality), matching the static version.
function scoreColor(score: number): string {
  if (score >= 9.3) return "linear-gradient(90deg,#d92121,#ff7e5f)";
  if (score >= 9.0) return "linear-gradient(90deg,#ff7e5f,#f4b740)";
  if (score >= 8.7) return "linear-gradient(90deg,#f4b740,#26d0ce)";
  return "linear-gradient(90deg,#26d0ce,#1a2980)";
}

export function EpisodeCard({ episode, index }: EpisodeCardProps) {
  const pct = Math.round((episode.score / 10) * 100);
  const topClass = episode.rank <= 3 ? " top3" : "";

  return (
    <article className="card" style={{ animationDelay: `${index * 0.03}s` }}>
      <div className="card-top">
        <span className={"rank-badge" + topClass}>{episode.rank}</span>
        <div className="score">
          <span className="score-num">
            {episode.score.toFixed(1)}
            <small>/10</small>
          </span>
          <span className="score-bar">
            <span style={{ width: `${pct}%`, background: scoreColor(episode.score) }} />
          </span>
        </div>
      </div>

      <h2>{episode.title}</h2>

      <div className="tags">
        <span className="tag">Season {episode.season}</span>
        <span className="tag ep">Episode {episode.episode}</span>
      </div>

      <p className="synopsis">{episode.synopsis}</p>
    </article>
  );
}
