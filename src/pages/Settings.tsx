import { Link } from "react-router-dom";
import { getTool } from "../data/tools";
import { ACCENTS, usePrefs, type ThemeMode } from "../prefs/Prefs";

const themes: { id: ThemeMode; label: string }[] = [
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
  { id: "system", label: "System" },
];

export function Settings() {
  const { theme, setTheme, accent, setAccent, favorites, toggleFavorite, clearFavorites, recentEnabled, setRecentEnabled, recent, clearRecent } = usePrefs();
  const saved = favorites.map((slug) => getTool(slug)).filter((tool) => tool != null);
  const opened = recent.map((slug) => getTool(slug)).filter((tool) => tool != null);

  return (
    <div className="settings-page">
      <header className="tool-head">
        <h1>Settings</h1>
        <p className="lede">Theme, accent, and favorites stay in this browser. Nothing here is uploaded.</p>
      </header>

      <section className="panel stack">
        <h2>Appearance</h2>
        <p className="lede">Light, dark, or match this device.</p>
        <div className="segment" role="group" aria-label="Color mode">
          {themes.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={theme === item.id}
              onClick={() => setTheme(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </section>

      <section className="panel stack">
        <h2>Accent</h2>
        <p className="lede">Used for buttons, the active tool, and favorite stars.</p>
        <div className="accent-grid">
          {ACCENTS.map((item) => (
            <button
              key={item.id}
              type="button"
              className="accent-choice"
              aria-pressed={accent === item.value}
              onClick={() => setAccent(item.value)}
            >
              <span className="accent-swatch" style={{ background: item.value }} />
              {item.label}
            </button>
          ))}
        </div>
        <label className="field">
          <span>Custom color</span>
          <input
            type="color"
            value={accent}
            aria-label="Custom accent color"
            onChange={(event) => setAccent(event.target.value)}
          />
        </label>
      </section>

      <section className="panel stack">
        <h2>Favorites</h2>
        <p className="lede">
          Hover a tool in the sidebar and click the star, or star it on the home page or its own page. Favorites stay at the top of the sidebar and the home page.
        </p>
        {saved.length === 0 ? (
          <p className="record-empty">No favorites yet.</p>
        ) : (
          <ul className="favorite-list">
            {saved.map((tool) => (
              <li key={tool.slug}>
                <Link to={`/${tool.slug}`}>{tool.name}</Link>
                <button type="button" className="btn ghost" onClick={() => toggleFavorite(tool.slug)}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
        {saved.length > 0 && (
          <button type="button" className="btn ghost" onClick={clearFavorites}>
            Clear favorites
          </button>
        )}
      </section>

      <section className="panel stack">
        <h2>Recent</h2>
        <p className="lede">Off until you turn it on. The last few tools you open then show on the home page and in the sidebar.</p>
        <div className="segment" role="group" aria-label="Recent tools">
          <button type="button" aria-pressed={!recentEnabled} onClick={() => setRecentEnabled(false)}>
            Off
          </button>
          <button type="button" aria-pressed={recentEnabled} onClick={() => setRecentEnabled(true)}>
            On
          </button>
        </div>
        {recentEnabled && opened.length === 0 && <p className="record-empty">Nothing opened yet.</p>}
        {recentEnabled && opened.length > 0 && (
          <ul className="favorite-list">
            {opened.map((tool) => (
              <li key={tool.slug}>
                <Link to={`/${tool.slug}`}>{tool.name}</Link>
              </li>
            ))}
          </ul>
        )}
        {recentEnabled && opened.length > 0 && (
          <button type="button" className="btn ghost" onClick={clearRecent}>
            Clear recent
          </button>
        )}
      </section>
    </div>
  );
}
