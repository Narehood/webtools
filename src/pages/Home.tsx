import { useState, type CSSProperties } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { FavoriteButton } from "../components/FavoriteButton";
import { categories, tools, type Tool, type ToolCategory } from "../data/tools";
import { Icon } from "../components/Icon";
import { usePrefs } from "../prefs/Prefs";

export function Home() {
  const { query } = useOutletContext<{ query: string }>();
  const { favorites, recent } = usePrefs();
  const [category, setCategory] = useState<ToolCategory | "all">("all");
  const q = query.trim().toLowerCase();
  const matches = (tool: Tool) => {
    if (category !== "all" && tool.category !== category) return false;
    return `${tool.name} ${tool.blurb} ${tool.category}`.toLowerCase().includes(q);
  };
  const visible = tools.filter(matches);
  const pinned = tools.filter((tool) => tool.featured && matches(tool));
  const favoriteTools = favorites.map((slug) => tools.find((tool) => tool.slug === slug)).filter((tool): tool is Tool => Boolean(tool)).filter(matches);
  const recentTools = recent
    .map((slug) => tools.find((tool) => tool.slug === slug))
    .filter((tool): tool is Tool => Boolean(tool))
    .filter((tool) => matches(tool) && !favoriteTools.some((favorite) => favorite.slug === tool.slug));
  const searching = q.length > 0;
  const categoryLabel = categories.find((item) => item.id === category)?.label ?? "All tools";

  return (
    <div>
      <section className="hero">
        <h1>Handy tools for everyday work</h1>
        <p>
          Collection of self-hosted utilities. Images and text stay in this browser; status, WHOIS,
          and certificates are checked from this machine. Star a tool to pin it under Favorites. Press / to search.
        </p>
      </section>
      <div className="segment catalog-chips" role="group" aria-label="Categories">
        {categories.map((item) => (
          <button key={item.id} type="button" aria-pressed={category === item.id} onClick={() => setCategory(item.id)}>
            {item.label}
          </button>
        ))}
      </div>
      {visible.length === 0 ? (
        <div className="empty">No tools match that search.</div>
      ) : searching ? (
        <>
          <h2 className="section-title">Results</h2>
          <div className="grid">
            {visible.map((tool) => (
              <ToolCard key={tool.slug} tool={tool} />
            ))}
          </div>
        </>
      ) : (
        <>
          {favoriteTools.length > 0 && (
            <>
              <h2 className="section-title">Favorites</h2>
              <div className="grid">
                {favoriteTools.map((tool) => (
                  <ToolCard key={tool.slug} tool={tool} />
                ))}
              </div>
            </>
          )}
          {recentTools.length > 0 && (
            <>
              <h2 className="section-title">Recent</h2>
              <div className="grid">
                {recentTools.map((tool) => (
                  <ToolCard key={tool.slug} tool={tool} />
                ))}
              </div>
            </>
          )}
          {category === "all" && pinned.length > 0 && (
            <>
              <h2 className="section-title">Featured tools</h2>
              <div className="grid">
                {pinned.map((tool) => (
                  <ToolCard key={tool.slug} tool={tool} />
                ))}
              </div>
            </>
          )}
          <h2 className="section-title">{category === "all" ? "All the tools" : categoryLabel}</h2>
          <div className="grid">
            {visible.map((tool) => (
              <ToolCard key={tool.slug} tool={tool} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function ToolCard({ tool }: { tool: Tool }) {
  return (
    <article className="card">
      <div className="card-top">
        <span
          className="icon-tile"
          style={{ "--tile": tool.tile, "--tile-ink": tool.tileInk } as CSSProperties}
        >
          <Icon name={tool.slug} />
        </span>
        <FavoriteButton slug={tool.slug} />
      </div>
      <Link to={`/${tool.slug}`} className="card-link">
        <h2>{tool.name}</h2>
        <p>{tool.blurb}</p>
      </Link>
      <span className={`badge ${tool.local ? "local" : "network"}`}>
        {tool.local ? "On device" : "This server"}
      </span>
    </article>
  );
}
