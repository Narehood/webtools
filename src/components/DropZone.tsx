import { useId, type DragEvent, type ReactNode } from "react";

type Props = {
  label: string;
  hint: string;
  accept?: string;
  onFile: (file: File) => void;
  children?: ReactNode;
};

export function DropZone({ label, hint, accept = "image/*", onFile, children }: Props) {
  const id = useId();

  function take(file?: File) {
    if (file) onFile(file);
  }

  function onDrop(event: DragEvent) {
    event.preventDefault();
    take(event.dataTransfer.files[0]);
    event.currentTarget.classList.remove("over");
  }

  return (
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
        onChange={(event) => take(event.target.files?.[0])}
      />
      {children ?? (
        <div>
          <strong>{label}</strong>
          {hint}
        </div>
      )}
    </label>
  );
}
