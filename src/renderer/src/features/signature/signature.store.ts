import { create } from "zustand";
import type {
  SignatureImage,
  SignaturePlacement,
} from "../../../../shared/signature";
import { useApp } from "../../store";

export type ImageAsset = Omit<SignatureImage, "bytes"> & { url: string };
type Snapshot = { placements: SignaturePlacement[]; imageId: string | null };
const empty = (): Snapshot => ({ placements: [], imageId: null });
type State = {
  documentId: string | null;
  sessionId: string | null;
  images: ImageAsset[];
  current: Snapshot;
  past: Snapshot[];
  future: Snapshot[];
  selectedId: string | null;
  placing: boolean;
  locked: boolean;
  savedKey: string;
  begin: (documentId: string, sessionId: string) => void;
  importImage: (
    image: SignatureImage,
    placements?: SignaturePlacement[],
  ) => void;
  select: (id: string | null) => void;
  place: (value: boolean) => void;
  lock: (value: boolean) => void;
  add: (p: SignaturePlacement) => void;
  update: (id: string, patch: Partial<SignaturePlacement>) => void;
  remove: () => void;
  undo: () => void;
  redo: () => void;
  markSaved: () => void;
  end: () => Promise<void>;
};
function key(s: Snapshot) {
  return JSON.stringify(s.placements);
}
function dirty(s: Snapshot, savedKey: string) {
  const app = useApp.getState();
  // Reader can be retained while another workspace is visible.
  app.set({
    dirtyWorkspaces: { ...app.dirtyWorkspaces, reader: key(s) !== savedKey },
  });
}
export const useSignature = create<State>((set, get) => {
  function commit(next: Snapshot) {
    const state = get();
    if (JSON.stringify(state.current) === JSON.stringify(next)) return;
    set({
      current: next,
      past: [...state.past, state.current].slice(-50),
      future: [],
    });
    dirty(next, state.savedKey);
  }
  return {
    documentId: null,
    sessionId: null,
    images: [],
    current: empty(),
    past: [],
    future: [],
    selectedId: null,
    placing: false,
    locked: true,
    savedKey: "[]",
    begin: (documentId, sessionId) => set({ documentId, sessionId }),
    importImage: (image, placements) => {
      const { bytes, ...metadata } = image;
      const asset = {
        ...metadata,
        url: URL.createObjectURL(
          new Blob([new Uint8Array(bytes)], { type: "image/png" }),
        ),
      };
      const state = get();
      set({ images: [...state.images, asset], placing: false });
      // Replacing the current image updates its placements as one undo action.
      commit({
        imageId: image.id,
        placements: placements ?? state.current.placements,
      });
    },
    select: (selectedId) => set({ selectedId, placing: false }),
    place: (placing) => set({ placing, selectedId: null }),
    lock: (locked) => set({ locked }),
    add: (p) => {
      commit({
        ...get().current,
        placements: [...get().current.placements, p],
      });
      set({ selectedId: p.id, placing: false });
    },
    update: (id, patch) =>
      commit({
        ...get().current,
        placements: get().current.placements.map((p) =>
          p.id === id ? { ...p, ...patch } : p,
        ),
      }),
    remove: () => {
      const s = get();
      commit({
        ...s.current,
        placements: s.current.placements.filter((p) => p.id !== s.selectedId),
      });
      set({ selectedId: null });
    },
    undo: () => {
      const s = get(),
        previous = s.past.at(-1);
      if (!previous) return;
      set({
        current: previous,
        past: s.past.slice(0, -1),
        future: [s.current, ...s.future],
        selectedId: null,
        placing: false,
      });
      dirty(previous, s.savedKey);
    },
    redo: () => {
      const s = get(),
        next = s.future[0];
      if (!next) return;
      set({
        current: next,
        past: [...s.past, s.current].slice(-50),
        future: s.future.slice(1),
        selectedId: null,
        placing: false,
      });
      dirty(next, s.savedKey);
    },
    markSaved: () => {
      set({ savedKey: key(get().current) });
      dirty(get().current, get().savedKey);
    },
    end: async () => {
      const s = get();
      if (s.sessionId) {
        const result = await window.paperin.endSignature(s.sessionId);
        if (!result.ok) {
          useApp.getState().set({ error: result.error });
          return;
        }
      }
      s.images.forEach((i) => URL.revokeObjectURL(i.url));
      set({
        documentId: null,
        sessionId: null,
        images: [],
        current: empty(),
        past: [],
        future: [],
        selectedId: null,
        placing: false,
        locked: true,
        savedKey: "[]",
      });
      dirty(empty(), "[]");
    },
  };
});
