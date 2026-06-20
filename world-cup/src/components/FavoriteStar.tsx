import { toggleFavorite, useFavorites } from "../favorites";

// A star button to add/remove a team from "Your teams". Stops click/keyboard
// events from bubbling so it can sit safely inside a clickable row or link.
export function FavoriteStar({ teamId, className = "" }: { teamId: string; className?: string }) {
  const on = useFavorites().includes(teamId);
  return (
    <button
      type="button"
      className={"fav-star" + (on ? " is-on" : "") + (className ? " " + className : "")}
      aria-pressed={on}
      aria-label={on ? "Remove from your teams" : "Add to your teams"}
      title={on ? "Remove from your teams" : "Add to your teams"}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleFavorite(teamId);
      }}
    >
      {on ? "★" : "☆"}
    </button>
  );
}
