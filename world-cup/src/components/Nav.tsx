import { NavLink } from "react-router-dom";
import { META } from "../data";

const LINKS = [
  { to: "/", label: "Overview", end: true },
  { to: "/matches", label: "Matches", end: false },
  { to: "/teams", label: "Teams", end: false },
  { to: "/players", label: "Players", end: false },
  { to: "/stats", label: "Stats", end: false },
  { to: "/friendlies", label: "Friendlies", end: false },
  { to: "/bracket", label: "Bracket", end: false },
];

export function Nav() {
  return (
    <header className="nav">
      <div className="nav-inner container">
        <NavLink to="/" className="brand" end>
          <span className="brand-ball">⚽</span>
          <span className="brand-text">
            World Cup <strong>2026</strong>
          </span>
        </NavLink>

        <nav className="nav-links">
          {LINKS.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.end}
              className={({ isActive }) =>
                "nav-link" + (isActive ? " is-active" : "")
              }
            >
              {l.label}
            </NavLink>
          ))}
        </nav>

        <span className="nav-host" title={META.hosts.join(" · ")}>
          🇺🇸 🇨🇦 🇲🇽
        </span>
      </div>
    </header>
  );
}
