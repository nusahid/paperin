import type { ExportPlan, Output } from "./types";
export type SplitMode = "extract" | "ranges" | "every" | "remove";
export function parseRange(value: string, count: number): number[] {
  if (!value.trim())
    throw new Error("Enter at least one page or range, for example 1–3, 7.");
  const result: number[] = [];
  for (const item of value.replace(/[–—]/g, "-").split(",")) {
    const match = item.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);
    if (!match)
      throw new Error(
        "Use page numbers and ranges separated by commas, for example 1-3, 7.",
      );
    const start = Number(match[1]),
      end = Number(match[2] ?? match[1]);
    if (start < 1 || end > count || start > end)
      throw new Error(
        `Choose pages between 1 and ${count}, with the start before the end.`,
      );
    for (let i = start; i <= end; i++) if (!result.includes(i)) result.push(i);
  }
  return result;
}
export function safeName(name: string) {
  return (
    name
      .replace(/\.pdf$/i, "")
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
      .replace(/[. ]+$/g, "")
      .trim()
      .slice(0, 120) || "document"
  );
}
export function splitPlan(
  id: string,
  count: number,
  selected: number[],
  mode: SplitMode,
  ranges: string,
  every: number,
  name: string,
): ExportPlan {
  const base = safeName(name);
  const output = (pages: number[], suffix = ""): Output => ({
    name: `${base}${suffix}.pdf`,
    sources: [{ id, pages }],
  });
  if (mode === "ranges") {
    const groups = ranges.split(";");
    return {
      outputs: groups.map((range, i) =>
        output(
          parseRange(range, count),
          `_part_${String(i + 1).padStart(3, "0")}`,
        ),
      ),
    };
  }
  if (mode === "every") {
    if (!Number.isInteger(every) || every < 1 || every > count)
      throw new Error(`Enter a whole number between 1 and ${count}.`);
    return {
      outputs: Array.from({ length: Math.ceil(count / every) }, (_, i) =>
        output(
          Array.from(
            { length: Math.min(every, count - i * every) },
            (_, p) => i * every + p + 1,
          ),
          `_part_${String(i + 1).padStart(3, "0")}`,
        ),
      ),
    };
  }
  const pages =
    mode === "remove"
      ? Array.from({ length: count }, (_, i) => i + 1).filter(
          (p) => !selected.includes(p),
        )
      : selected;
  if (!pages.length)
    throw new Error(
      mode === "remove"
        ? "Keep at least one page in the new document."
        : "Select at least one page to extract.",
    );
  return { outputs: [output(pages)] };
}
export function formatSize(bytes: number) {
  return bytes >= 1048576
    ? `${(bytes / 1048576).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
export function pageSummary(pages: number[]) {
  const parts: string[] = [];
  for (let i = 0; i < pages.length; i++) {
    const start = pages[i];
    let end = start;
    while (i + 1 < pages.length && pages[i + 1] === end + 1) end = pages[++i];
    parts.push(start === end ? String(start) : `${start}–${end}`);
  }
  return parts.join(", ");
}
