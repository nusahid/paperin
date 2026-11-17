import fs from "node:fs/promises";

// Open once and read at most the observed size plus one byte. A file that grows
// during import cannot bypass the allocation limit or silently change the snapshot.
export async function readConversionFile(location: string, limit: number) {
  const file = await fs.open(location, "r");
  try {
    const stat = await file.stat();
    if (!stat.isFile() || !stat.size)
      throw new Error("This file couldn't be opened.");
    if (stat.size > limit)
      throw new Error("This file exceeds the supported size.");
    const bytes = Buffer.alloc(stat.size + 1);
    let used = 0;
    while (used < bytes.length) {
      const { bytesRead } = await file.read(
        bytes,
        used,
        bytes.length - used,
        null,
      );
      if (!bytesRead) break;
      used += bytesRead;
    }
    if (used !== stat.size)
      throw new Error("This file has changed. Please add it again.");
    return bytes.subarray(0, used);
  } finally {
    await file.close();
  }
}
