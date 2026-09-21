import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { categories, getTool, tools, type Tool } from "../data/tools";
import { FavoriteButton } from "../components/FavoriteButton";
import { Icon } from "../components/Icon";
import { ToolErrorBoundary } from "../components/ToolErrorBoundary";
import { usePrefs } from "../prefs/Prefs";

export function Shell() {
  const [query, setQuery] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const { favorites, recent, rememberTool } = usePrefs();
  const searchRef = useRef<HTMLInputElement>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const slug = location.pathname.split("/")[1];
  const current = slug ? getTool(slug) : undefined;
  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = (tool: Tool) => !q || `${tool.name} ${tool.blurb}`.toLowerCase().includes(q);
    const favoriteTools = favorites.map((item) => getTool(item)).filter((tool): tool is Tool => Boolean(tool)).filter(matches);
    const recentTools = recent.map((item) => getTool(item)).filter((tool): tool is Tool => Boolean(tool)).filter(matches);
    const groups = categories
      .filter((category) => category.id !== "all")
      .map((category) => ({
        ...category,
        tools: tools.filter((tool) => tool.category === category.id && matches(tool)),
      }))
      .filter((group) => group.tools.length > 0);
    return { favoriteTools, recentTools, groups };
  }, [query, favorites, recent]);

  useEffect(() => {
    if (current) rememberTool(current.slug);
  }, [current, rememberTool]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && document.activeElement === searchRef.current) {
        searchRef.current?.blur();
        return;
      }
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target;
      if (target instanceof HTMLElement) {
        const tag = target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable) return;
      }
      event.preventDefault();
      searchRef.current?.focus();
      searchRef.current?.select();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function closeMenu() {
    setMenuOpen(false);
  }

  return (
    <div className={`app${menuOpen ? " nav-open" : ""}`}>
      <button className="scrim" aria-label="Close menu" onClick={closeMenu} />
      <aside className="sidebar">
        <Link to="/" className="brand" onClick={closeMenu}>
          <span className="brand-mark">W</span>
          <span>
            <span className="brand-name">WebTools</span>
            <span className="brand-sub">Handy tools, on your machine</span>
          </span>
        </Link>
        <div className="sidebar-scroll">
        {grouped.favoriteTools.length > 0 && (
          <div>
            <div className="nav-label">Favorites</div>
            <div className="nav-list">
              {grouped.favoriteTools.map((tool) => (
                <NavLink
                  key={tool.slug}
                  to={`/${tool.slug}`}
                  className={({ isActive }) => `nav-tool${isActive ? " active" : ""}`}
                  onClick={() => {
                    setQuery("");
                    closeMenu();
                  }}
                >
                  <Icon name={tool.slug} />
                  {tool.name}
                </NavLink>
              ))}
            </div>
          </div>
        )}
        {grouped.recentTools.length > 0 && (
          <div>
            <div className="nav-label">Recent</div>
            <div className="nav-list">
              {grouped.recentTools.map((tool) => (
                <NavLink
                  key={tool.slug}
                  to={`/${tool.slug}`}
                  className={({ isActive }) => `nav-tool${isActive ? " active" : ""}`}
                  onClick={() => {
                    setQuery("");
                    closeMenu();
                  }}
                >
                  <Icon name={tool.slug} />
                  {tool.name}
                </NavLink>
              ))}
            </div>
          </div>
        )}
        {grouped.groups.map((group) => (
          <div key={group.id}>
            <div className="nav-label">{group.label}</div>
            <div className="nav-list">
              {group.tools.map((tool) => (
                <NavLink
                  key={tool.slug}
                  to={`/${tool.slug}`}
                  className={({ isActive }) => `nav-tool${isActive ? " active" : ""}`}
                  onClick={() => {
                    setQuery("");
                    closeMenu();
                  }}
                >
                  <Icon name={tool.slug} />
                  {tool.name}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
        </div>
        <div className="sidebar-foot">
          <NavLink to="/settings" className={({ isActive }) => `nav-tool${isActive ? " active" : ""}`} onClick={closeMenu}>
            <Icon name="settings" />
            Settings
          </NavLink>
        </div>
      </aside>
      <header className="header">
        <button className="menu-btn" type="button" aria-label="Open menu" onClick={() => setMenuOpen(true)}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        </button>
        <div className="search-wrap">
          <input
            ref={searchRef}
            className="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              if (location.pathname !== "/") navigate("/");
            }}
            placeholder="Search tools…"
            aria-label="Search tools"
            title="Press / to search"
          />
        </div>
        <div className="privacy">
          <span className="dot" />
          {current?.local === false ? "Runs on this server" : "Local-first"}
        </div>
        <NavLink to="/settings" className={({ isActive }) => `icon-btn${isActive ? " active" : ""}`} aria-label="Settings">
          <Icon name="settings" />
        </NavLink>
      </header>
      <main className="main">
        <div className="main-inner">
          {current && (
            <div className="crumb">
              <Link to="/" className="back">
                All tools
              </Link>
              <strong> / {current.name}</strong>
              <FavoriteButton slug={current.slug} />
            </div>
          )}
          <ToolErrorBoundary resetKey={location.pathname}>
            <Suspense fallback={<p className="lede" role="status">Loading tool...</p>}><Outlet context={{ query }} /></Suspense>
          </ToolErrorBoundary>
        </div>
      </main>
    </div>
  );
}
