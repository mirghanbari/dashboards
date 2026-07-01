import { useMemo } from "react";
import { Link } from "react-router-dom";
import { MATCHES, applyLive, knockoutBracket, useLiveMatches } from "../data";
import type { BracketMatch, BracketSlot } from "../data";

function Side({ slot, decided }: { slot: BracketSlot; decided: boolean }) {
  if (!slot.team) {
    return (
      <div className="kb-side is-tbd">
        <span className="kb-slot">{slot.slotLabel}</span>
      </div>
    );
  }
  const cls =
    "kb-side" +
    (slot.isWinner ? " is-winner" : decided ? " is-loser" : "");
  return (
    <div className={cls}>
      <span className="kb-flag">{slot.team.flag}</span>
      <span className="kb-name">{slot.team.name}</span>
      <span className="kb-score">{slot.score ?? ""}</span>
    </div>
  );
}

function MatchBox({ m }: { m: BracketMatch }) {
  const live = m.status === "live";
  const decided = m.status === "finished";
  return (
    <Link
      to={`/matches/${m.id}`}
      className={"kb-card" + (live ? " is-live" : "")}
      aria-label={`Match ${m.id} details`}
    >
      {live && <span className="kb-live">● LIVE</span>}
      <Side slot={m.home} decided={decided} />
      <Side slot={m.away} decided={decided} />
    </Link>
  );
}

export function KnockoutBracket() {
  const live = useLiveMatches();
  const { rounds, thirdPlace } = useMemo(
    () => knockoutBracket(applyLive(MATCHES, live)),
    [live],
  );

  return (
    <>
      <p className="kb-note">
        The live knockout bracket. Winners advance automatically as results land —
        penalty-shootout results included. Tap any match for details.
      </p>
      <div className="kb">
        {rounds.map((round) => (
          <div className="kb-round" key={round.stage}>
            <h3 className="kb-round-title">{round.name}</h3>
            <div className="kb-matches">
              {round.matches.map((m) => (
                <div className="kb-match" key={m.id}>
                  <MatchBox m={m} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      {thirdPlace && (
        <div className="kb-third">
          <h3 className="kb-round-title">Third-place play-off</h3>
          <div className="kb-match kb-match-solo">
            <MatchBox m={thirdPlace} />
          </div>
        </div>
      )}
    </>
  );
}
