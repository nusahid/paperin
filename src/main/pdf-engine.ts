import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import fs from "node:fs/promises";
import { z } from "zod";
import type { ExportPlan } from "../shared/types";
const exec = promisify(execFile);
export type RegisteredFile = { path: string; password?: string; hash?: string };
const source = z
  .object({
    id: z.string().uuid(),
    pages: z.array(z.number().int().positive()).min(1).max(100000),
  })
  .strict();
const output = z
  .object({
    name: z
      .string()
      .min(5)
      .max(180)
      .regex(/^[^<>:"/\\|?*\x00-\x1f]+\.pdf$/i),
    sources: z.array(source).min(1).max(500),
  })
  .strict();
export const planSchema = z
  .object({ outputs: z.array(output).min(1).max(1000) })
  .strict();
export async function runQpdf(binary: string, args: string[]) {
  try {
    return (
      await exec(binary, args, {
        windowsHide: true,
        timeout: 120000,
        maxBuffer: 16 * 1024 * 1024,
      })
    ).stdout;
  } catch (error: any) {
    // qpdf exit 3 means the output is valid but warnings were generated.
    if (error.code === 3) return String(error.stdout ?? "");
    if (String(error.stderr).includes("invalid password"))
      throw new Error(
        "This PDF requires a valid password. Open it in Reader first.",
      );
    if (error.code === "ENOENT")
      throw new Error(
        "The local PDF engine is missing. Run npm run setup:qpdf and restart Paperin.",
      );
    if (error.killed)
      throw new Error("PDF processing timed out. Try a smaller document.");
    throw new Error(
      "This document could not be processed safely. It may be damaged or unsupported.",
    );
  }
}
export async function validatePlan(
  binary: string,
  plan: ExportPlan,
  files: Map<string, RegisteredFile>,
) {
  planSchema.parse(plan);
  const names = plan.outputs.map((o) => o.name.toLowerCase());
  if (new Set(names).size !== names.length)
    throw new Error("Each output needs a unique file name.");
  const counts = new Map<string, number>();
  for (const output of plan.outputs)
    for (const source of output.sources) {
      const file = files.get(source.id);
      if (!file)
        throw new Error(
          "A source document is no longer available. Please reopen it.",
        );
      if (!counts.has(source.id)) {
        const count = Number(
          (
            await runQpdf(binary, [
              ...(file.password ? [`--password=${file.password}`] : []),
              "--show-npages",
              file.path,
            ])
          ).trim(),
        );
        if (!Number.isInteger(count) || count < 1)
          throw new Error("Could not read the source page count.");
        counts.set(source.id, count);
      }
      if (source.pages.some((p) => p > counts.get(source.id)!))
        throw new Error("The selected page range exceeds the document length.");
    }
}
export async function generateOutput(
  binary: string,
  output: ExportPlan["outputs"][number],
  files: Map<string, RegisteredFile>,
  destination: string,
) {
  const args = ["--empty", "--pages"];
  for (const source of output.sources) {
    const file = files.get(source.id)!;
    args.push(file.path);
    if (file.password) args.push(`--password=${file.password}`);
    args.push(source.pages.join(","));
  }
  args.push("--", destination);
  await runQpdf(binary, args);
  await runQpdf(binary, ["--check", destination]);
  const pages = Number(
    (await runQpdf(binary, ["--show-npages", destination])).trim(),
  );
  if (pages !== output.sources.reduce((n, s) => n + s.pages.length, 0))
    throw new Error("Output validation failed. No file has been saved.");
  if (!(await fs.stat(destination)).size)
    throw new Error("The output file is empty.");
}
export async function assertNotSource(
  destination: string,
  files: Map<string, RegisteredFile>,
) {
  const normalize = (p: string) =>
    process.platform === "win32"
      ? path.resolve(p).toLowerCase()
      : path.resolve(p);
  let actualDestination = destination;
  try {
    actualDestination = await fs.realpath(destination);
  } catch {
    /* New output. */
  }
  for (const file of files.values()) {
    const actualSource = await fs.realpath(file.path);
    if (normalize(actualDestination) === normalize(actualSource))
      throw new Error(
        "Choose a new file name. Paperin keeps your original documents unchanged.",
      );
    try {
      const [a, b] = await Promise.all([
        fs.stat(destination),
        fs.stat(file.path),
      ]);
      if (a.ino && a.ino === b.ino && a.dev === b.dev)
        throw new Error(
          "The destination points to an original document. Choose another location.",
        );
    } catch (error: any) {
      if (error.code !== "ENOENT") throw error;
    }
  }
}
