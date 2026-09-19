import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { Suspense, useMemo, useState } from "react";
import { categories, getTool, tools } from "../data/tools";
import { Icon } from "../components/Icon";
import { ToolErrorBoundary } from "../components/ToolErrorBoundary";

export function Shell() {
  const [query, setQuery] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const slug = location.pathname.split("/")[1];
  const current = slug ? getTool(slug) : undefined;
  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase();
    return categories
      .filter((category) => category.id !== "all")
      .map((category) => ({
        ...category,
        tools: tools.filter((tool) => {
          if (tool.category !== category.id) return false;
          if (!q) return true;
          return `${tool.name} ${tool.blurb}`.toLowerCase().includes(q);
        }),
      }))
      .filter((group) => group.tools.length > 0);
  }, [query]);

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
        {grouped.map((group) => (
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
      </aside>
      <header className="header">
        <button className="menu-btn" type="button" aria-label="Open menu" onClick={() => setMenuOpen(true)}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        </button>
        <div className="search-wrap">
          <input
            className="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              if (location.pathname !== "/") navigate("/");
            }}
            placeholder="Search tools…"
            aria-label="Search tools"
          />
        </div>
        <div className="privacy">
          <span className="dot" />
          {current?.local === false ? "Runs on this server" : "Local-first"}
        </div>
      </header>
      <main className="main">
        <div className="main-inner">
          {current && (
            <div className="crumb">
              <Link to="/" className="back">
                All tools
              </Link>
              <strong> / {current.name}</strong>
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
