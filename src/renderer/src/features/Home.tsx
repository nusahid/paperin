import {
  ArrowRight,
  BookOpen,
  Check,
  ChevronRight,
  FilePlus2,
  FolderOpen,
  Layers2,
  LockKeyhole,
  Scissors,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import type { Workspace } from "../../../shared/types";
export function Home({
  onOpen,
  onNavigate,
  onSample,
}: {
  onOpen: () => void;
  onNavigate: (workspace: Workspace) => void;
  onSample: () => void;
}) {
  return (
    <div className="home-page">
      <div className="home-topline">
        <span>YOUR LOCAL WORKSPACE</span>
        <span className="offline-badge">
          <span />
          Offline & ready
        </span>
      </div>
      <header className="home-heading">
        <h1>
          Your PDF workspace<span>.</span>
        </h1>
        <p>
          A little less paperwork. A little more peace of mind.
          <br />
          Read, merge, and split your PDFs — all in one place.
        </p>
      </header>
      <section className="drop-zone" aria-label="Drop PDF files here">
        <div className="drop-art" aria-hidden="true">
          <div className="art-sheet art-sheet-back">
            <i />
            <i />
            <i />
          </div>
          <div className="art-sheet art-sheet-front">
            <FilePlus2 size={35} strokeWidth={1.4} />
            <span>PDF</span>
          </div>
          <div className="art-plus">+</div>
        </div>
        <h2>Drop your PDFs here</h2>
        <p>or choose a file from your device</p>
        <button className="button primary browse-button" onClick={onOpen}>
          <FolderOpen size={18} />
          Browse files
          <ArrowRight size={17} />
        </button>
        <span className="drop-footnote">
          PDF files only. Your originals stay untouched.
        </span>
      </section>
      <div className="tools-label">A simple tool for every step</div>
      <div className="tool-cards">
        {[
          {
            id: "reader" as const,
            Icon: BookOpen,
            title: "Read PDF",
            description: "Settle in. Find what matters.",
            detail: "View, navigate & search",
          },
          {
            id: "merge" as const,
            Icon: Layers2,
            title: "Merge PDFs",
            description: "Bring it all together.",
            detail: "Combine & arrange files",
          },
          {
            id: "split" as const,
            Icon: Scissors,
            title: "Split PDF",
            description: "Keep just what you need.",
            detail: "Extract & separate pages",
          },
        ].map(({ id, Icon, title, description, detail }) => (
          <button className="tool-card" key={id} onClick={() => onNavigate(id)}>
            <span className="tool-icon">
              <Icon size={23} strokeWidth={1.65} />
            </span>
            <h3>
              {title}
              <ChevronRight size={17} />
            </h3>
            <p>{description}</p>
            <span className="tool-detail">{detail}</span>
          </button>
        ))}
      </div>
      <div className="home-bottom">
        <div className="privacy-note">
          <ShieldCheck size={19} />
          <div>
            <strong>Private by nature.</strong>
            <span>
              No uploads. No accounts. Just your documents, on your device.
            </span>
          </div>
        </div>
        <button className="sample-link" onClick={onSample}>
          Try a sample PDF
          <ArrowRight size={14} />
        </button>
      </div>
      <footer className="home-footer">
        <span>
          <LockKeyhole size={12} />
          100% on your device
        </span>
        <span>
          <Check size={13} />
          Works without internet
        </span>
        <span>
          <Sparkles size={12} />
          Made to keep things simple
        </span>
      </footer>
    </div>
  );
}
