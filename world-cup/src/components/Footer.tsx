import { META } from "../data";

export function Footer() {
  const updated = new Date(META.lastUpdated).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
  return (
    <footer className="footer">
      <div className="footer-inner container">
        <div>
          <strong>{META.tournament}</strong>
          <p className="footer-note">{META.note}</p>
        </div>
        <div className="footer-meta">
          <p>
            Hosts: {META.hosts.join(", ")}
          </p>
          <p>
            Data updated: <time>{updated}</time>
          </p>
          <p className="footer-source">Source: {META.source}</p>
        </div>
      </div>
    </footer>
  );
}
