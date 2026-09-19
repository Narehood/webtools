import { useId, useState, type DragEvent, type ReactNode } from "react";

type Props = {
  label: string;
  hint: string;
  accept?: string;
  onFile: (file: File) => void | Promise<void>;
  disabled?: boolean;
  children?: ReactNode;
};

export function DropZone({ label, hint, accept = "image/*", onFile, children, disabled = false }: Props) {
  const id = useId();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function take(file?: File) {
    if (!file || disabled || loading) return;
    setError("");
    setLoading(true);
    try { await onFile(file); }
    catch (err) { setError(err instanceof Error ? err.message : "Could not open file"); }
    finally { setLoading(false); }
  }

  function onDrop(event: DragEvent) {
    event.preventDefault();
    void take(event.dataTransfer.files[0]);
    event.currentTarget.classList.remove("over");
  }

  return (
    <>
      <label
        className="drop"
        htmlFor={id}
        onDragOver={(event) => {
          event.preventDefault();
          event.currentTarget.classList.add("over");
        }}
        onDragLeave={(event) => event.currentTarget.classList.remove("over")}
        onDrop={onDrop}
      >
        <input
          id={id}
          className="hidden-file"
          type="file"
          accept={accept}
          disabled={disabled || loading}
          onChange={(event) => {
            void take(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
        {children ?? (
          <div>
            <strong>{label}</strong>
            {hint}
          </div>
        )}
      </label>
      {error && <p role="alert" className="lede">{error}</p>}
    </>
  );
}
