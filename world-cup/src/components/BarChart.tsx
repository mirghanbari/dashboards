interface Datum {
  label: string;
  value: number;
  flag?: string;
  hint?: string;
}

/** Lightweight horizontal bar chart — no charting dependency. */
export function BarChart({ data, unit = "" }: { data: Datum[]; unit?: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="bar-chart">
      {data.map((d) => (
        <div className="bar-row" key={d.label}>
          <span className="bar-label" title={d.hint ?? d.label}>
            {d.flag && <span className="bar-flag">{d.flag}</span>}
            {d.label}
          </span>
          <div className="bar-track">
            <div
              className="bar-fill"
              style={{ width: `${(d.value / max) * 100}%` }}
            />
          </div>
          <span className="bar-value">
            {d.value}
            {unit}
          </span>
        </div>
      ))}
    </div>
  );
}
