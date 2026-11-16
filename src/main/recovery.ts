import fs from "node:fs/promises";
import path from "node:path";
// Short-lived journal of app-created staging folders. No source paths or PDF
// contents are persisted; the journal is removed when an export completes.
const marker = "folio-export-staging-v1";
export async function recoverExports(journal: string) {
  try {
    const directories: unknown = JSON.parse(await fs.readFile(journal, "utf8"));
    if (!Array.isArray(directories)) return;
    for (const directory of directories) {
      if (
        typeof directory !== "string" ||
        !path.isAbsolute(directory) ||
        !/^\.folio-export-[a-zA-Z0-9]+$/.test(path.basename(directory))
      )
        continue;
      try {
        const stat = await fs.lstat(directory);
        if (!stat.isDirectory() || stat.isSymbolicLink()) continue;
        if (
          (await fs.readFile(path.join(directory, ".folio-owned"), "utf8")) !==
          marker
        )
          continue;
        await fs.rm(directory, { recursive: true, force: true });
      } catch {
        /* Already removed, unavailable drive, or no longer owned. */
      }
    }
    await fs.rm(journal, { force: true });
  } catch {
    /* Never touch unknown paths. */
  }
}
export async function trackExport(journal: string, directory: string) {
  if (!/^\.folio-export-[a-zA-Z0-9]+$/.test(path.basename(directory)))
    throw new Error("Invalid staging folder.");
  await fs.writeFile(path.join(directory, ".folio-owned"), marker, {
    flag: "wx",
  });
  await fs.mkdir(path.dirname(journal), { recursive: true });
  await fs.writeFile(journal, JSON.stringify([directory]));
}
