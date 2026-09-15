import type { CSSProperties } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { tools } from "../data/tools";
import { Icon } from "../components/Icon";

export function Home() {
  const { query } = useOutletContext<{ query: string }>();
  const q = query.trim().toLowerCase();
  const visible = tools.filter((tool) => `${tool.name} ${tool.blurb} ${tool.category}`.toLowerCase().includes(q));
  const pinned = tools.filter((tool) => tool.featured);
  const searching = q.length > 0;

  return (
    <div>
      <section className="hero">
        <h1>Handy tools for everyday work</h1>
        <p>
          Collection of self-hosted utilities. Images and text stay in this browser; status, WHOIS,
          and certificates are checked from this machine.
        </p>
      </section>
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
          <h2 className="section-title">Favorites</h2>
          <div className="grid">
            {pinned.map((tool) => (
              <ToolCard key={tool.slug} tool={tool} />
            ))}
          </div>
          <h2 className="section-title">All the tools</h2>
          <div className="grid">
            {tools.map((tool) => (
              <ToolCard key={tool.slug} tool={tool} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function ToolCard({ tool }: { tool: (typeof tools)[number] }) {
  return (
    <Link to={`/${tool.slug}`} className="card">
      <div className="card-top">
        <span
          className="icon-tile"
          style={{ "--tile": tool.tile, "--tile-ink": tool.tileInk } as CSSProperties}
        >
          <Icon name={tool.slug} />
        </span>
      </div>
      <div>
        <h2>{tool.name}</h2>
        <p>{tool.blurb}</p>
      </div>
      <span className={`badge ${tool.local ? "local" : "network"}`}>
        {tool.local ? "On device" : "This server"}
      </span>
    </Link>
  );
}
