// ---------- Schema.org structured data (JSON-LD) ----------
// Builders that turn our data model into schema.org entities. The site-wide
// WebSite + tournament SportsEvent are baked statically into index.html (so
// non-JS crawlers see them); these per-entity builders are injected at runtime
// by useJsonLd on the detail pages for JS-rendering crawlers (e.g. Googlebot).

import type { Match, Player, Team } from "../types";
import { getTeam, META } from "../data";

export const SITE_URL = "https://mirghanbari.github.io/dashboards/";

/** Canonical hash-route URL for an entity, e.g. teams/usa → …/dashboards/#/teams/usa */
export const entityUrl = (hashPath: string) => `${SITE_URL}#/${hashPath}`;

const SPORT = "Soccer";

/** A national team. `nested` trims @context for use inside a parent entity. */
export function teamSchema(team: Team, nested = false) {
  return {
    ...(nested ? {} : { "@context": "https://schema.org" }),
    "@type": "SportsTeam",
    name: team.name,
    ...(team.code ? { alternateName: team.code } : {}),
    sport: SPORT,
    url: entityUrl(`teams/${team.id}`),
    memberOf: { "@type": "SportsOrganization", name: "FIFA" },
  };
}

/** A single fixture. Uses schema.org's homeTeam/awayTeam for SportsEvent. */
export function matchSchema(match: Match) {
  const home = getTeam(match.homeTeamId);
  const away = getTeam(match.awayTeamId);
  return {
    "@context": "https://schema.org",
    "@type": "SportsEvent",
    name: `${home.name} vs ${away.name}`,
    sport: SPORT,
    startDate: match.date,
    eventStatus: "https://schema.org/EventScheduled",
    superEvent: { "@type": "SportsEvent", name: META.tournament, url: SITE_URL },
    homeTeam: teamSchema(home, true),
    awayTeam: teamSchema(away, true),
    ...(match.venue
      ? {
          location: {
            "@type": "Place",
            name: match.venue,
            ...(match.city ? { address: match.city } : {}),
          },
        }
      : {}),
    url: entityUrl(`matches/${match.id}`),
  };
}

/** A player. */
export function playerSchema(player: Player) {
  const team = getTeam(player.teamId);
  return {
    "@context": "https://schema.org",
    "@type": "Person",
    name: player.name,
    jobTitle: "Association football player",
    url: entityUrl(`players/${player.id}`),
    ...(player.height ? { height: player.height } : {}),
    ...(player.weight ? { weight: player.weight } : {}),
    memberOf: teamSchema(team, true),
  };
}
