import { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronRight,
  FileText,
  Home as HomeIcon,
  Layers2,
  LoaderCircle,
  LockKeyhole,
  Maximize2,
  Minus,
  Scissors,
  Settings,
  ShieldCheck,
  Upload,
  X,
} from "lucide-react";
import type {
  ExportPlan,
  LocalFile,
  Result,
  Workspace,
} from "../../shared/types";
import { useApp, type Document } from "./store";
import { loadPdf } from "./pdf";
import { Home } from "./features/Home";
import { Reader } from "./features/Reader";
import { Merge } from "./features/Merge";
import { Split } from "./features/Split";
import { Modal } from "./components/Modal";
import { Preview } from "./components/Preview";
import { useSignature } from "./features/signature/signature.store";
type PasswordRequest = {
  incorrect: boolean;
  resolve: (password: string) => void;
  reject: () => void;
};
export function App() {
  const state = useApp();
  const { workspace, busy, error, saved, dirty, set } = state;
  const [settings, setSettings] = useState(false);
  const [preview, setPreview] = useState<ExportPlan | null>(null);
  const [pendingNav, setPendingNav] = useState<Workspace | null>(null);
  const [passwordRequest, setPasswordRequest] =
    useState<PasswordRequest | null>(null);
  const [password, setPassword] = useState("");
  const [dragging, setDragging] = useState(false);
  const [importTarget, setImportTarget] = useState<Workspace | null>(null);
  const dragDepth = useRef(0);
  const importing = useRef(false);
  useEffect(
    () => window.folio.onProgress((message) => set({ busy: message })),
    [],
  );
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (
        Object.values(useApp.getState().dirtyWorkspaces).some(Boolean) ||
        busy
      ) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [state.dirtyWorkspaces, busy]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === "o") {
        event.preventDefault();
        void open(workspace);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [workspace]);
  function navigate(next: Workspace) {
    if (next === workspace || busy) return;
    if (dirty) setPendingNav(next);
    else set({ workspace: next });
  }
  function askPassword(incorrect: boolean): Promise<string> {
    setPassword("");
    return new Promise((resolve, reject) =>
      setPasswordRequest({
        incorrect,
        resolve,
        reject: () => reject(new Error("Password entry canceled.")),
      }),
    );
  }
  async function accept(result: Result<LocalFile[]>, target: Workspace) {
    if (!result.ok) throw new Error(result.error);
    if (!result.value.length) return;
    const added: Document[] = [];
    try {
      for (const [i, file] of result.value.entries()) {
        set({ busy: `Opening ${i + 1} of ${result.value.length}…` });
        added.push(await loadPdf(file, askPassword));
      }
    } catch (error) {
      for (const doc of added) await doc.destroy();
      throw error;
    }
    const current = useApp.getState();
    set({ documents: [...current.documents, ...added], saved: [] });
    if (target === "merge" || (target === "home" && added.length > 1))
      set({
        workspace: "merge",
        mergeIds: [...current.mergeIds, ...added.map((d) => d.id)],
        dirty: true,
      });
    else if (target === "split")
      set({
        workspace: "split",
        splitId: added[0].id,
        selected: [],
        dirty: false,
      });
    else {
      await useSignature.getState().end();
      set({ workspace: "reader", activeId: added[0].id });
    }
  }
  async function importAction(
    action: () => Promise<Result<LocalFile[]>>,
    target: Workspace,
  ) {
    if (importing.current || useApp.getState().busy) return;
    importing.current = true;
    set({ busy: "Opening your documents…", error: null });
    try {
      await accept(await action(), target);
    } catch (error: any) {
      set({ error: error.message });
    } finally {
      importing.current = false;
      set({ busy: null });
    }
  }
  async function open(target: Workspace) {
    if (["split", "reader"].includes(target) && useApp.getState().dirty) {
      setImportTarget(target);
      return;
    }
    await importAction(
      () => window.folio.pickFiles(target === "merge" || target === "home"),
      target,
    );
  }
  function organize(mode: "merge" | "split", doc: Document) {
    if (mode === "merge")
      set({
        workspace: mode,
        mergeIds: [...new Set([...useApp.getState().mergeIds, doc.id])],
        dirty: true,
      });
    else set({ workspace: mode, splitId: doc.id, selected: [], dirty: false });
  }
  async function exportPdf(plan: ExportPlan) {
    if (busy) return;
    const warnings = plan.outputs.flatMap((o) =>
      o.sources.flatMap(
        (s) => state.documents.find((d) => d.id === s.id)?.warnings ?? [],
      ),
    );
    if (!preview && warnings.length) {
      setPreview(plan);
      return;
    }
    const revision = useApp.getState().revision;
    setPreview(null);
    set({ busy: "Preparing your PDFs…", error: null, saved: [] });
    try {
      const result = await window.folio.export(plan);
      if (!result.ok) throw new Error(result.error);
      if (result.value)
        set({
          saved: result.value,
          dirty: useApp.getState().revision !== revision,
        });
    } catch (error: any) {
      set({ error: error.message });
    } finally {
      set({ busy: null });
    }
  }
  const nav = [
    { id: "home" as const, label: "Home", Icon: HomeIcon },
    { id: "reader" as const, label: "Reader", Icon: BookOpen },
    { id: "merge" as const, label: "Merge", Icon: Layers2 },
    { id: "split" as const, label: "Split", Icon: Scissors },
  ];
  return (
    <div
      className="app-shell"
      onDragEnter={(event) => {
        if (event.dataTransfer.types.includes("Files")) {
          event.preventDefault();
          dragDepth.current++;
          setDragging(true);
        }
      }}
      onDragLeave={(event) => {
        if (event.dataTransfer.types.includes("Files")) {
          dragDepth.current--;
          if (!dragDepth.current) setDragging(false);
        }
      }}
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes("Files")) event.preventDefault();
      }}
      onDrop={(event) => {
        if (!event.dataTransfer.types.includes("Files")) return;
        event.preventDefault();
        dragDepth.current = 0;
        setDragging(false);
        const files = Array.from(event.dataTransfer.files);
        if (files.some((f) => !f.name.toLowerCase().endsWith(".pdf"))) {
          set({ error: "Please drop PDF files only." });
          return;
        }
        if (["split", "reader"].includes(workspace) && dirty) {
          set({
            error:
              "Save your current changes or use Open PDF before dropping a new document.",
          });
          return;
        }
        void importAction(() => window.folio.importFiles(files), workspace);
      }}
    >
      <header className="titlebar">
        <div className="brand">
          <span className="brand-mark">
            <FileText size={21} strokeWidth={1.8} />
            <span />
          </span>
          <strong>Folio</strong>
        </div>
        <span className="titlebar-caption">A little space for your PDFs</span>
        <div className="window-controls">
          <button
            aria-label="Minimize window"
            onClick={() => window.folio.window("minimize")}
          >
            <Minus size={15} />
          </button>
          <button
            aria-label="Maximize window"
            onClick={() => window.folio.window("maximize")}
          >
            <Maximize2 size={13} />
          </button>
          <button
            className="close-window"
            aria-label="Close window"
            onClick={() => window.folio.window("close")}
          >
            <X size={16} />
          </button>
        </div>
      </header>
      <div className="app-body">
        <aside className="sidebar">
          <div className="nav-section-label">WORKSPACE</div>
          <nav aria-label="Main navigation">
            {nav.map(({ id, label, Icon }) => (
              <button
                className={`nav-item ${workspace === id ? "active" : ""}`}
                key={id}
                onClick={() => navigate(id)}
                aria-current={workspace === id ? "page" : undefined}
              >
                <Icon size={19} strokeWidth={workspace === id ? 2 : 1.7} />
                <span>{label}</span>
                {workspace === id && <span className="nav-active-dot" />}
              </button>
            ))}
          </nav>
          <div className="sidebar-bottom">
            <div className="sidebar-privacy">
              <span className="privacy-symbol">
                <ShieldCheck size={22} strokeWidth={1.5} />
              </span>
              <strong>Yours. Only yours.</strong>
              <p>
                Your files stay here.
                <br />
                Right where they belong.
              </p>
              <span className="local-pill">
                <span />
                100% local
              </span>
            </div>
            <button
              className={`nav-item settings-nav ${settings ? "active" : ""}`}
              onClick={() => setSettings(true)}
            >
              <Settings size={18} strokeWidth={1.7} />
              <span>Settings</span>
            </button>
            <span className="sidebar-version">FOLIO / v0.1.0</span>
          </div>
        </aside>
        <main className={`main-content main-${workspace}`}>
          {workspace === "home" && (
            <Home
              onOpen={() => void open("home")}
              onNavigate={navigate}
              onSample={() =>
                void importAction(() => window.folio.sample(), "reader")
              }
            />
          )}
          {workspace === "reader" && (
            <Reader onOpen={() => void open("reader")} onOrganize={organize} />
          )}
          {workspace === "merge" && (
            <Merge
              onOpen={() => void open("merge")}
              onPreview={setPreview}
              onExport={exportPdf}
            />
          )}
          {workspace === "split" && (
            <Split
              onOpen={() => void open("split")}
              onPreview={setPreview}
              onExport={exportPdf}
            />
          )}
        </main>
      </div>
      {dragging && (
        <div className="drop-overlay">
          <Upload size={48} strokeWidth={1.4} />
          <h2>A new home for your PDFs.</h2>
          <p>
            Drop to{" "}
            {workspace === "merge"
              ? "add documents to your merge"
              : workspace === "split"
                ? "start splitting your document"
                : "open your documents"}
            .
          </p>
        </div>
      )}
      {busy && (
        <div className="progress-toast" role="status">
          <LoaderCircle size={19} className="spin" />
          <span>{busy}</span>
        </div>
      )}
      {error && (
        <div className="notification error-notification" role="alert">
          <AlertCircle size={21} />
          <div>
            <strong>Let's try that again.</strong>
            <p>{error}</p>
          </div>
          <button
            className="icon-button"
            aria-label="Dismiss error"
            onClick={() => set({ error: null })}
          >
            <X size={16} />
          </button>
        </div>
      )}
      {!!saved.length && (
        <div className="notification success-notification" role="status">
          <CheckCircle2 size={22} />
          <div>
            <strong>
              {saved.length > 1
                ? `${saved.length} PDFs saved successfully.`
                : "PDF saved successfully."}
            </strong>
            <p>
              {saved.length === 1
                ? saved[0].name
                : "Your new documents are ready in the chosen folder."}
            </p>
            <div className="notification-links">
              <button
                onClick={() =>
                  void importAction(
                    () => window.folio.openSaved(saved[0].id),
                    "reader",
                  )
                }
              >
                Open {saved.length > 1 ? "first PDF" : "file"}
                <ArrowRight size={12} />
              </button>
              <button
                onClick={async () => {
                  const result = await window.folio.showSaved(saved[0].id);
                  if (!result.ok) set({ error: result.error });
                }}
              >
                Show in folder
              </button>
            </div>
          </div>
          <button
            className="icon-button"
            aria-label="Dismiss success"
            onClick={() => set({ saved: [] })}
          >
            <X size={16} />
          </button>
        </div>
      )}
      {preview && (
        <Preview
          plan={preview}
          onClose={() => setPreview(null)}
          onExport={exportPdf}
        />
      )}
      {pendingNav && (
        <Modal
          title="Leave without exporting?"
          onClose={() => setPendingNav(null)}
        >
          <p className="modal-description">
            You have changes that haven't been saved as a PDF. Your setup will
            stay available during this session.
          </p>
          <div className="modal-actions">
            <button
              className="button secondary"
              autoFocus
              onClick={() => setPendingNav(null)}
            >
              Stay here
            </button>
            <button
              className="button primary"
              onClick={() => {
                set({ workspace: pendingNav });
                setPendingNav(null);
              }}
            >
              Leave workspace
            </button>
          </div>
        </Modal>
      )}
      {importTarget && (
        <Modal
          title="Replace this document?"
          onClose={() => setImportTarget(null)}
        >
          <p className="modal-description">
            Your current changes haven't been exported. Opening another PDF will
            clear these changes.
          </p>
          <div className="modal-actions">
            <button
              className="button secondary"
              onClick={() => setImportTarget(null)}
            >
              Keep editing
            </button>
            <button
              className="button primary"
              onClick={() => {
                const target = importTarget;
                setImportTarget(null);
                void importAction(() => window.folio.pickFiles(false), target);
              }}
            >
              Choose another PDF
            </button>
          </div>
        </Modal>
      )}
      {passwordRequest && (
        <Modal
          title="This PDF is password protected"
          onClose={() => {
            passwordRequest.reject();
            setPasswordRequest(null);
          }}
        >
          <p className="modal-description">
            {passwordRequest.incorrect
              ? "That password didn't work. Please try again."
              : "Enter the document password to open it. It stays in memory for this session only."}
          </p>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              passwordRequest.resolve(password);
              setPasswordRequest(null);
              setPassword("");
            }}
          >
            <label className="field-group">
              Document password
              <input
                autoFocus
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            <div className="modal-actions">
              <button
                type="button"
                className="button secondary"
                onClick={() => {
                  passwordRequest.reject();
                  setPasswordRequest(null);
                }}
              >
                Cancel
              </button>
              <button className="button primary" type="submit">
                <LockKeyhole size={16} />
                Open PDF
              </button>
            </div>
          </form>
        </Modal>
      )}
      {settings && (
        <Modal
          title="A workspace that respects your space."
          onClose={() => setSettings(false)}
        >
          <div className="settings-intro">
            <span className="brand-mark">
              <FileText size={21} />
            </span>
            <div>
              <strong>Folio</strong>
              <span>Version 0.1.0 · Windows desktop</span>
            </div>
            <span className="offline-badge">
              <span />
              Offline
            </span>
          </div>
          <div className="settings-section">
            <h3>PRIVATE BY DESIGN</h3>
            {[
              "All documents are processed on this device.",
              "No accounts, uploads, analytics, or automatic updates.",
              "Original documents are never overwritten.",
            ].map((text) => (
              <p key={text}>
                <Check size={16} />
                {text}
              </p>
            ))}
          </div>
          <div className="settings-section">
            <h3>KEYBOARD SHORTCUTS</h3>
            <p>
              Open a PDF<kbd>Ctrl O</kbd>
            </p>
            <p>
              Find in Reader<kbd>Ctrl F</kbd>
            </p>
            <p>
              Previous / next page<kbd>← / →</kbd>
            </p>
            <p>
              Move through controls<kbd>Tab</kbd>
            </p>
          </div>
          <div className="settings-section">
            <h3>LOCAL PDF ENGINE</h3>
            <p>
              PDF.js for reading<span className="settings-status">Bundled</span>
            </p>
            <p>
              qpdf 12.4.2 for page operations
              <span className="settings-status">Bundled</span>
            </p>
            <span className="field-help">
              Image-only PDFs can be read, but need OCR before their text is
              searchable.
            </span>
          </div>
          <div className="modal-actions">
            <button
              className="button primary"
              onClick={() => setSettings(false)}
            >
              Back to your workspace
              <ChevronRight size={16} />
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
