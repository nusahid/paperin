import fs from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
const version = "12.4.2";
const root = path.resolve("resources/binaries/qpdf");
if (process.platform !== "win32")
  throw new Error(
    "This setup script currently bundles Windows x64 qpdf. See README for other platforms.",
  );
const archive = path.resolve(`resources/binaries/qpdf-${version}.zip`);
const url = `https://github.com/qpdf/qpdf/releases/download/v${version}/qpdf-${version}-msvc64.zip`;
console.log(`Downloading qpdf ${version} from the official qpdf release…`);
const response = await fetch(url);
if (!response.ok) throw new Error(`Download failed: ${response.status}`);
const bytes = Buffer.from(await response.arrayBuffer());
const expectedHash =
  "db87077e683630c1217e0e8f9a20a9749d952ab676e881c3689187763a5de25d";
if (createHash("sha256").update(bytes).digest("hex") !== expectedHash)
  throw new Error(
    "The qpdf archive checksum did not match the pinned release.",
  );
await fs.mkdir(path.dirname(archive), { recursive: true });
await fs.writeFile(archive, bytes);
console.log(`SHA-256: ${createHash("sha256").update(bytes).digest("hex")}`);
const unpack = path.resolve("resources/binaries/unpacked-qpdf");
// Both paths are fixed children of this project's resources directory.
execFileSync(
  "powershell.exe",
  [
    "-NoProfile",
    "-WindowStyle",
    "Hidden",
    "-Command",
    `Expand-Archive -LiteralPath '${archive.replaceAll("'", "''")}' -DestinationPath '${unpack.replaceAll("'", "''")}' -Force`,
  ],
  { windowsHide: true },
);
const entries = await fs.readdir(unpack, { withFileTypes: true });
const folder = entries.find((e) => e.isDirectory());
if (!folder) throw new Error("Unexpected qpdf archive layout.");
await fs.cp(path.join(unpack, folder.name, "bin"), path.join(root, "bin"), {
  recursive: true,
});
try {
  await fs.cp(
    path.join(unpack, folder.name, "share"),
    path.join(root, "share"),
    { recursive: true },
  );
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
for (const entry of await fs.readdir(path.join(unpack, folder.name), {
  withFileTypes: true,
})) {
  if (entry.isFile() && /license|copying|copyright|notice/i.test(entry.name))
    await fs.copyFile(
      path.join(unpack, folder.name, entry.name),
      path.join(root, entry.name),
    );
}
for (const name of [
  "LICENSE.txt",
  "NOTICE.md",
  "README.md",
  "Artistic-2.0",
  "LICENSE",
]) {
  try {
    await fs.copyFile(
      path.join(unpack, folder.name, name),
      path.join(root, name),
    );
  } catch {
    /* Release-dependent filename. */
  }
}
for (const name of ["LICENSE.txt", "NOTICE.md"]) {
  const license = await fetch(
    `https://raw.githubusercontent.com/qpdf/qpdf/v${version}/${name}`,
  );
  if (!license.ok) throw new Error(`Unable to download qpdf ${name}.`);
  await fs.writeFile(path.join(root, name), await license.text());
}
await fs.rm(archive);
const expectedUnpack = path.resolve("resources/binaries/unpacked-qpdf");
if (
  unpack !== expectedUnpack ||
  !unpack.startsWith(path.resolve("resources/binaries") + path.sep)
)
  throw new Error("Unexpected cleanup location.");
await fs.rm(unpack, { recursive: true, force: true });
console.log(
  execFileSync(path.join(root, "bin/qpdf.exe"), ["--version"], {
    encoding: "utf8",
    windowsHide: true,
  }),
);
