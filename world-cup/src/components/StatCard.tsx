import { Link } from "react-router-dom";

export function StatCard({
  label,
  value,
  sub,
  to,
}: {
  label: string;
  value: string | number;
  sub?: string;
  to?: string; // when set, the whole card links here
}) {
  const inner = (
    <>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </>
  );
  if (to) {
    return (
      <Link to={to} className="stat-card stat-card-link">
        {inner}
      </Link>
    );
  }
  return <div className="stat-card">{inner}</div>;
}
