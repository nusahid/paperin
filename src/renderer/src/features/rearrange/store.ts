import { create } from "zustand";
import {
  commitOrder,
  movePages,
  originalOrder,
  redoOrder,
  sameOrder,
  undoOrder,
  type OrderHistory,
} from "../../../../shared/rearrange";
import { useApp } from "../../store";

type State = OrderHistory & {
  documentId: string | null;
  selected: number[];
  anchor: number | null;
  savedOrder: number[];
  begin: (id: string, count: number) => void;
  select: (id: number, toggle?: boolean, range?: boolean) => void;
  clear: () => void;
  all: () => void;
  move: (ids: number[], boundary: number) => void;
  reverse: () => void;
  reset: () => void;
  undo: () => void;
  redo: () => void;
  markSaved: (order: number[]) => void;
  discard: () => void;
};
export const useRearrange = create<State>((set, get) => {
  const dirty = (order: number[]) => {
    const app = useApp.getState();
    app.set({
      dirtyWorkspaces: {
        ...app.dirtyWorkspaces,
        rearrange: !sameOrder(order, get().savedOrder),
      },
      saved: [],
    });
  };
  const apply = (history: OrderHistory) => {
    if (history === get()) return;
    set(history);
    dirty(history.order);
  };
  return {
    documentId: null,
    order: [],
    selected: [],
    anchor: null,
    past: [],
    future: [],
    savedOrder: [],
    begin: (documentId, count) => {
      const order = originalOrder(count);
      set({
        documentId,
        order,
        savedOrder: order,
        selected: [],
        anchor: null,
        past: [],
        future: [],
      });
      dirty(order);
    },
    select: (id, toggle = false, range = false) => {
      const { order, selected, anchor } = get();
      if (range && anchor !== null) {
        const a = order.indexOf(anchor),
          b = order.indexOf(id);
        const ids = order.slice(Math.min(a, b), Math.max(a, b) + 1);
        set({ selected: toggle ? [...new Set([...selected, ...ids])] : ids });
      } else
        set({
          selected: toggle
            ? selected.includes(id)
              ? selected.filter((p) => p !== id)
              : [...selected, id]
            : [id],
          anchor: id,
        });
    },
    clear: () => set({ selected: [], anchor: null }),
    all: () => set({ selected: [...get().order] }),
    move: (ids, boundary) =>
      apply(commitOrder(get(), movePages(get().order, ids, boundary))),
    reverse: () => apply(commitOrder(get(), [...get().order].reverse())),
    reset: () => {
      apply(commitOrder(get(), originalOrder(get().order.length)));
      set({ selected: [], anchor: null });
    },
    undo: () => apply(undoOrder(get())),
    redo: () => apply(redoOrder(get())),
    markSaved: (savedOrder) => {
      set({ savedOrder: [...savedOrder] });
      dirty(get().order);
    },
    discard: () => {
      set({
        order: [...get().savedOrder],
        past: [],
        future: [],
        selected: [],
        anchor: null,
      });
      dirty(get().order);
    },
  };
});
