import { BookOpen, Files, Scissors, Upload } from "lucide-react";
export function EmptyState({
  type,
  onOpen,
}: {
  type: "reader" | "merge" | "split";
  onOpen: () => void;
}) {
  const Icon =
    type === "reader" ? BookOpen : type === "merge" ? Files : Scissors;
  return (
    <div className="empty-state">
      <div className="empty-icon">
        <Icon size={32} strokeWidth={1.5} />
      </div>
      <h2>
        {type === "reader"
          ? "Make room for a good read."
          : type === "merge"
            ? "Bring your documents together."
            : "Just the pages you need."}
      </h2>
      <p>
        {type === "reader"
          ? "Open a PDF to read, search, and explore every page."
          : type === "merge"
            ? "Add two or more PDFs, arrange them, and save as one."
            : "Open a PDF to extract pages or split it into smaller files."}
      </p>
      <button className="button primary" onClick={onOpen}>
        <Upload size={17} />
        {type === "merge" ? "Add PDF files" : "Open a PDF"}
      </button>
      <span className="empty-hint">
        or drop {type === "merge" ? "your files" : "a file"} anywhere in this
        workspace
      </span>
    </div>
  );
}
