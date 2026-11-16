import { create } from "zustand";
import type { PDFDocumentProxy } from "pdfjs-dist";
import type { SavedFile, Workspace } from "../../shared/types";
import type { SplitMode } from "../../shared/plans";
export type Document = {
  id: string;
  name: string;
  size: number;
  pdf: PDFDocumentProxy;
  pageCount: number;
  warnings: string[];
  destroy: () => Promise<void>;
};
type State = {
  workspace: Workspace;
  documents: Document[];
  activeId: string | null;
  mergeIds: string[];
  splitId: string | null;
  selected: number[];
  busy: string | null;
  error: string | null;
  saved: SavedFile[];
  dirty: boolean;
  dirtyWorkspaces: Record<Workspace, boolean>;
  revision: number;
  mergeName: string;
  splitConfig: {
    id: string | null;
    mode: SplitMode;
    ranges: string;
    every: number;
    name: string;
    rangeInput: string;
  };
  set: (patch: Partial<Omit<State, "set">>) => void;
};
export const useApp = create<State>((update) => ({
  workspace: "home",
  documents: [],
  activeId: null,
  mergeIds: [],
  splitId: null,
  selected: [],
  busy: null,
  error: null,
  saved: [],
  dirty: false,
  dirtyWorkspaces: { home: false, reader: false, merge: false, split: false },
  revision: 0,
  mergeName: "Documents_merged.pdf",
  splitConfig: {
    id: null,
    mode: "extract",
    ranges: "",
    every: 5,
    name: "",
    rangeInput: "",
  },
  set: (patch) =>
    update((state) => {
      const workspace = patch.workspace ?? state.workspace;
      const dirtyWorkspaces = {
        ...state.dirtyWorkspaces,
        ...patch.dirtyWorkspaces,
      };
      if (patch.dirty !== undefined) dirtyWorkspaces[workspace] = patch.dirty;
      return {
        ...patch,
        dirtyWorkspaces,
        dirty: dirtyWorkspaces[workspace],
        revision: patch.dirty ? state.revision + 1 : state.revision,
      };
    }),
}));
