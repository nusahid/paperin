# Paperin development guide

[Back to README](../README.md) · [Publishing on GitHub](GITHUB-RELEASES.md)

## Technology and structure

Paperin uses Electron, React, TypeScript, electron-vite/Vite, PDF.js, qpdf, pdf-lib, Zustand, Zod, and Lucide. Fonts, workers, PDF.js resources, and the native PDF engine are bundled locally. The preload bridge exposes the typed `PaperinAPI` as `window.paperin`, and packaged pages use the `paperin://app` protocol.

| Location            | Responsibility                                                                                                         |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `src/main`          | File access, validated IPC, local protocol, qpdf processing, safe exports, staging recovery, and the signature worker. |
| `src/preload`       | A narrow, typed API for the renderer.                                                                                  |
| `src/renderer`      | React interface, workspaces, lazy page rendering, previews, and local state.                                           |
| `src/shared`        | Export types, signature schemas, coordinate conversion, and page composition.                                          |
| `resources`         | Icons, sample PDFs, qpdf, and third-party license notices.                                                             |
| `scripts`           | Resource setup, verified qpdf downloads, sample generation, and packaged app smoke tests.                              |
| `tests`             | Unit/integration tests and Electron E2E tests.                                                                         |
| `.github/workflows` | Installer builds and draft GitHub Releases triggered by version tags.                                                  |

## Prerequisites

- Windows x64.
- Node.js 22.13+ on the 22.x release line, or Node.js 24+, with npm.
- Git to retrieve and manage the source code.
- Internet access to install dependencies and set up qpdf. The built app does not need to download resources during use.

## Set up the project

Clone the repository and open the project folder:

```powershell
git clone https://github.com/nusahid/paperin.git Paperin
cd Paperin
npm ci
npm run setup:qpdf
npm run dev
```

`npm ci` runs `postinstall` to copy PDF.js resources and generate a sample PDF. `npm run setup:qpdf` downloads the official qpdf **12.4.2** Windows x64 release and verifies the SHA-256 checksum pinned in the script. qpdf, its DLLs, and license files are prepared in `resources/binaries/qpdf/`.

To run a production build from source:

```powershell
npm run build
npm start
```

## Project commands

| Command                | Purpose                                                      |
| ---------------------- | ------------------------------------------------------------ |
| `npm run dev`          | Run Electron with the development server and HMR.            |
| `npm run build`        | Typecheck and build the main process, preload, and renderer. |
| `npm start`            | Run the build from `out/`.                                   |
| `npm run typecheck`    | Check TypeScript types.                                      |
| `npm test`             | Run unit/integration tests with Vitest.                      |
| `npm run test:e2e`     | Build and run Electron E2E tests with Playwright.            |
| `npm run package`      | Create an unpacked Windows application folder.               |
| `npm run make`         | Build, package, and create a Squirrel Windows installer.     |
| `npm run test:package` | Run a smoke test against the packaged executable.            |
| `npm run format:check` | Check formatting with Prettier.                              |
| `npm run format`       | Format source and files covered by the script.               |
| `npm run samples`      | Regenerate sample PDFs.                                      |
| `npm run setup:qpdf`   | Set up the pinned qpdf release.                              |

## Build and distribution output

```powershell
npm run make
npm run test:package
```

Key output files:

```text
dist/
├── Paperin-win32-x64/
│   ├── Paperin.exe
│   └── ... application resources and dependencies
└── make/squirrel.windows/x64/
    ├── Paperin-Setup.exe
    ├── Paperin-<version>-full.nupkg
    └── RELEASES
```

Distribute **`Paperin-Setup.exe`** to users through GitHub Releases. Its filename stays the same across versions so the `/releases/latest/download/Paperin-Setup.exe` link remains valid.

The packaged `Paperin.exe` needs its accompanying resources. Do not distribute that executable by itself. Close a running packaged app before rebuilding into the same folder to avoid locked files.

qpdf, DLLs, license notices, icons, and the sample document are included in the package resources. The installer is currently unsigned. Clean Windows installation testing and code signing still need to be completed for wider distribution.

## Validation

```powershell
npm run typecheck
npm test
npm run test:e2e
npm run make
npm run test:package
```

The unit/integration suite runs local qpdf and checks merging, extraction, splitting, encrypted input, and source file integrity. Signature tests cover coordinate conversion, page rotation, CropBoxes, transparency, UserUnit values, and text preservation in exported PDFs.

E2E tests use local PDFs and offline network emulation. Native dialog return values are stubbed to direct exports into temporary folders. Screenshots are saved in `test-results/screenshots/`; selected documentation screenshots are copied into `docs/images/` so they can be tracked in Git.

The package smoke test checks Paperin branding, PDF.js and text rendering, PNG import, the signature worker, signature image exports, and qpdf page exports while offline. To test another executable:

```powershell
$env:PAPERIN_SMOKE_EXECUTABLE = 'D:\path\to\Paperin.exe'
npm run test:package
Remove-Item Env:PAPERIN_SMOKE_EXECUTABLE
```

Run `npm audit` to audit dependencies. Automated checks do not replace clean Windows installer testing, operating system packet capture, or reference hardware benchmarks. Startup, large-document rendering, drag/resize responsiveness, and export latency targets have not been declared benchmarked and passed.

## Security and implementation limits

- The renderer uses sandboxing and context isolation. Raw Node.js/Electron objects are not exposed through preload.
- The packaged app uses a custom local protocol and denies permission requests, external navigation, new windows, and external network requests from the app session. The development server uses localhost and WebSocket HMR.
- PDF imports are limited to 512 MB per file. PDF objects remain in memory during the session.
- Passwords are not persisted. When required for processing, they are passed to qpdf through process arguments.
- Exports validate temporary files and page counts before replacing destination files. Destinations that refer to source files, including aliases and hard links, are rejected.
- Exports cannot be canceled after processing starts. Each engine invocation has a two-minute timeout.
- If a multi-file export fails during final file commits, successfully saved files are reported and may remain in the destination.
- The signature editor accepts static PNGs and rejects encrypted PDFs, existing digital signatures, and signature form fields.
- Each PNG is limited to 15 MB, 16 million pixels, and 16,384 pixels per dimension. Each session accepts eight imports and 32 million image pixels in total. Undo/redo history is limited to 50 actions.
- Canceling the editor, opening another PDF after confirmation, or exiting the app releases the signature session. Switching workspaces retains it in memory.
- Page operations may affect document-level features such as bookmarks, forms, attachments, and signature validity.
- macOS/Linux/ARM installers, OCR, annotations, printing, recent-file history, and automatic updates are not available.
