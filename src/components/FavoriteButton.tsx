import { usePrefs } from "../prefs/Prefs";

export function FavoriteButton({ slug }: { slug: string }) {
  const { isFavorite, toggleFavorite } = usePrefs();
  const on = isFavorite(slug);
  return (
    <button
      type="button"
      className={`fav-btn${on ? " on" : ""}`}
      aria-pressed={on}
      aria-label={on ? "Remove from favorites" : "Add to favorites"}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        toggleFavorite(slug);
      }}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M12 3.5l2.6 5.4 6 .9-4.3 4.2 1 5.9L12 17.2 6.7 19.9l1-5.9L3.4 9.8l6-.9L12 3.5z"
          fill={on ? "currentColor" : "none"}
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
