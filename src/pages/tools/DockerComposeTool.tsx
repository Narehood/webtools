import { useMemo, useState } from "react";
import { CopyButton } from "../../components/CopyButton";
import { dockerRunToCompose } from "../../lib/dockerCompose";

const SAMPLE = `docker run -d \\
  --name web \\
  --restart unless-stopped \\
  -p 8080:80 \\
  -e NODE_ENV=production \\
  -v web-data:/usr/share/nginx/html \\
  nginx:alpine`;

export function DockerComposeTool() {
  const [input, setInput] = useState(SAMPLE);
  const result = useMemo(() => {
    try {
      return { ok: true as const, ...dockerRunToCompose(input) };
    } catch (error) {
      return {
        ok: false as const,
        message: error instanceof Error ? error.message : "Could not convert this command",
      };
    }
  }, [input]);

  return (
    <>
      <header className="tool-head">
        <span className="badge local">On device</span>
        <h1>Docker run to Compose</h1>
        <p className="lede">
          Turn one docker run command into Compose YAML. Quotes are parsed here; nothing is executed or expanded.
        </p>
      </header>
      <div className="workspace">
        <section className="panel stack">
          <label className="field">
            <span>Docker run command</span>
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              spellCheck={false}
              aria-describedby="docker-compose-help"
            />
          </label>
          <p className="lede" id="docker-compose-help" style={{ marginBottom: 0 }}>
            Supports environment variables, ports, volumes, names, networks, restart policy, workdir, user,
            entrypoint, detach, auto-remove, TTY, interactive mode, and command arguments. Unsupported flags are
            reported instead of discarded.
          </p>
        </section>
        <section className="panel stack">
          {result.ok ? (
            <>
              <label className="field">
                <span>compose.yaml</span>
                <textarea readOnly value={result.yaml} spellCheck={false} />
              </label>
              <div className="row">
                <CopyButton text={result.yaml} />
              </div>
              {result.warnings.map((warning) => (
                <p className="lede" key={warning} style={{ marginBottom: 0 }}>{warning}</p>
              ))}
            </>
          ) : (
            <p className="lede" role="alert">{result.message}</p>
          )}
        </section>
      </div>
    </>
  );
}
