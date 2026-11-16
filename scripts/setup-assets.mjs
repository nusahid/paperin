import fs from "node:fs/promises";
import path from "node:path";
for (const folder of ["cmaps", "standard_fonts", "wasm", "iccs"]) {
  const source = path.resolve("node_modules/pdfjs-dist", folder);
  try {
    await fs.cp(source, path.resolve("src/renderer/public/pdfjs", folder), {
      recursive: true,
    });
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}
console.log("Offline PDF.js resources are ready.");
