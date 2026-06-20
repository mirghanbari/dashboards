import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { META } from "../data";

const LINKS = [
  { to: "/", label: "Overview", end: true },
  { to: "/matches", label: "Matches", end: false },
  { to: "/teams", label: "Teams", end: false },
  { to: "/qualification", label: "Qualifying", end: false },
  { to: "/players", label: "Players", end: false },
  { to: "/stats", label: "Stats", end: false },
  // Friendlies hidden during the World Cup — route still works at /friendlies.
  // { to: "/friendlies", label: "Friendlies", end: false },
  { to: "/bracket", label: "Bracket", end: false },
  { to: "/predictions", label: "Predictions", end: false },
];

export function Nav() {
  const [open, setOpen] = useState(false);
  const location = useLocation();

  // Close the menu whenever the route changes (e.g. after tapping a link).
  useEffect(() => setOpen(false), [location.pathname]);

  return (
    <header className="nav">
      <div className="nav-inner container">
        <NavLink to="/" className="brand" end onClick={() => setOpen(false)}>
          <span className="brand-ball">⚽</span>
          <span className="brand-text">
            World Cup <strong>2026</strong>
          </span>
        </NavLink>

        <button
          className="nav-toggle"
          aria-label="Toggle navigation menu"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          {open ? "✕" : "☰"}
        </button>

        <nav id="nav-menu" className={"nav-links" + (open ? " is-open" : "")}>
          {LINKS.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.end}
              className={({ isActive }) => "nav-link" + (isActive ? " is-active" : "")}
              onClick={() => setOpen(false)}
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
