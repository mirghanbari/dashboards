// Attack / defense strength bars from DTAI's team ratings. Both values are
// pre-normalized to 0..1 across the 48 World Cup teams (1 = strongest of the
// field), so a full bar means best-in-tournament in that dimension.
export function RatingBars({
  attack,
  defense,
  compact = false,
}: {
  attack: number | null;
  defense: number | null;
  compact?: boolean;
}) {
  if (attack == null || defense == null) return null;
  return (
    <div className={"rating-bars" + (compact ? " is-compact" : "")}>
      <div className="rating-row">
        <span className="rating-cap">ATT</span>
        <div className="rating-track">
          <div className="rating-fill rating-att" style={{ width: `${attack * 100}%` }} />
        </div>
      </div>
      <div className="rating-row">
        <span className="rating-cap">DEF</span>
        <div className="rating-track">
          <div className="rating-fill rating-def" style={{ width: `${defense * 100}%` }} />
        </div>
      </div>
    </div>
  );
}
