import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import App from "./App";
import { Overview } from "./pages/Overview";
import { Matches } from "./pages/Matches";
import { MatchDetail } from "./pages/MatchDetail";
import { Teams } from "./pages/Teams";
import { TeamDetail } from "./pages/TeamDetail";
import { Qualification } from "./pages/Qualification";
import { Players } from "./pages/Players";
import { PlayerDetail } from "./pages/PlayerDetail";
import { Stats } from "./pages/Stats";
import { StatDetail } from "./pages/StatDetail";
import { Friendlies } from "./pages/Friendlies";
import { Bracket } from "./pages/Bracket";
import { Predictions } from "./pages/Predictions";
import "./index.css";

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("Root element #root not found");

// HashRouter keeps deep links working on GitHub Pages without server config.
createRoot(rootEl).render(
  <StrictMode>
    <HashRouter>
      <Routes>
        <Route element={<App />}>
          <Route index element={<Overview />} />
          <Route path="matches" element={<Matches />} />
          <Route path="matches/:matchId" element={<MatchDetail />} />
          <Route path="teams" element={<Teams />} />
          <Route path="teams/:teamId" element={<TeamDetail />} />
          <Route path="qualification" element={<Qualification />} />
          <Route path="players" element={<Players />} />
          <Route path="players/:playerId" element={<PlayerDetail />} />
          <Route path="stats" element={<Stats />} />
          <Route path="stats/:statKey" element={<StatDetail />} />
          <Route path="friendlies" element={<Friendlies />} />
          <Route path="bracket" element={<Bracket />} />
          <Route path="predictions" element={<Predictions />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  </StrictMode>,
);
