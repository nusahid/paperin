import { z } from "zod";

export const rearrangeSchema = z
  .object({
    documentId: z.string().uuid(),
    order: z.array(z.number().int().positive()).min(1).max(100000),
  })
  .strict();
export type RearrangePlan = z.infer<typeof rearrangeSchema>;
export type RearrangeInspection = {
  pageCount: number;
  warnings: string[];
  blocked: string | null;
};

// Original page numbers are stable IDs within a document, independent of position.
export function originalOrder(count: number): number[] {
  return Array.from({ length: count }, (_, i) => i + 1);
}
export function sameOrder(a: number[], b: number[]) {
  return a.length === b.length && a.every((id, i) => id === b[i]);
}
export function validatePermutation(order: number[], count: number) {
  if (
    order.length !== count ||
    new Set(order).size !== count ||
    order.some((id) => !Number.isInteger(id) || id < 1 || id > count)
  )
    throw new Error(
      "The page order is invalid. Reset the order and try again.",
    );
}
// The insertion boundary belongs to the displayed order before removing selection.
export function movePages(
  order: number[],
  selected: number[],
  boundary: number,
) {
  const ids = new Set(selected);
  const moving = order.filter((id) => ids.has(id));
  const target = Math.max(0, Math.min(order.length, boundary));
  const insertion = order.slice(0, target).filter((id) => !ids.has(id)).length;
  const remaining = order.filter((id) => !ids.has(id));
  remaining.splice(insertion, 0, ...moving);
  return remaining;
}
export type OrderHistory = {
  order: number[];
  past: number[][];
  future: number[][];
};
export function commitOrder(
  state: OrderHistory,
  order: number[],
): OrderHistory {
  validatePermutation(order, state.order.length);
  if (sameOrder(state.order, order)) return state;
  return { order, past: [...state.past, state.order].slice(-50), future: [] };
}
export function undoOrder(state: OrderHistory): OrderHistory {
  if (!state.past.length) return state;
  return {
    order: state.past.at(-1)!,
    past: state.past.slice(0, -1),
    future: [state.order, ...state.future],
  };
}
export function redoOrder(state: OrderHistory): OrderHistory {
  if (!state.future.length) return state;
  return {
    order: state.future[0],
    past: [...state.past, state.order].slice(-50),
    future: state.future.slice(1),
  };
}
