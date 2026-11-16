# Folio

A local Windows PDF workspace, built from the supplied Folio PRD and UI reference. Electron, React, TypeScript, Vite, PDF.js, qpdf, Zustand, Zod, and Lucide. Fonts, workers, PDF rendering resources, and the native PDF engine are bundled locally.

## Run

Requires **Windows x64** and **Node.js 22.13+** (or Node.js 24+). Internet is needed for initial dependency and engine setup only.

```powershell
npm ci
npm run setup:qpdf
npm run dev
```

To run the production build:

```powershell
npm run build
npm start
```

The sample document and PDF.js assets are generated/copied during `npm ci`. The qpdf setup script downloads the pinned official **12.4.2** Windows release and verifies its SHA-256 checksum. Runtime requires no external services or downloads.

## Included

- **Home:** file picker, native Explorer drag-and-drop, three workspaces, and an original eight-page sample.
- **Reader:** continuous scrolling, lazy page rendering, page/thumbnail navigation, fit page/width, 25–300% zoom, selectable/copyable text, and text search with matching-page navigation. Image-only PDFs do not become searchable without OCR.
- **Merge:** multiple input files, first-page thumbnails, drag and keyboard reorder, removal, page totals, output naming, and visual preview.
- **Split:** visual page selection, all/none/odd/even, explicit ordered ranges, extract, remove, separate ranges, and every-N-page output.
- **Export:** native Save As or folder selection, overwrite confirmation, qpdf processing outside the renderer, staged validation, page-count verification, replacement only after validation, and startup cleanup of owned staging files.
- **Privacy:** no login, telemetry, cloud, CDN, or automatic update checks. Remote requests are blocked in the production Electron session. Source files cannot be selected as output, including aliases/hard links.
- **Protected documents:** PDF.js requests the password. qpdf receives it only in memory/process arguments for this session; passwords are never persisted. Signature, form, and attachment warnings are shown before page operations.
- **Accessibility:** focus states, native controls, dialog focus management, icon labels, reduced-motion support, and keyboard shortcuts.

## Build a Windows application / installer

```powershell
npm run package
npm run make
```

The unpacked application is created under `dist/Folio-win32-x64/`. Run `Folio.exe` from that folder; keep the accompanying resources together. The Squirrel installer is written under `dist/make/squirrel.windows/x64/`. qpdf, its supporting DLLs/documentation, icons, and the sample are copied into packaged resources. The installer is unsigned; public distribution should include code signing and testing on a clean Windows machine.

## Verify

```powershell
npm run typecheck
npm test
npm run test:e2e
npm run test:package # after npm run package / npm run make
npm audit
```

The unit/integration suite runs the real bundled qpdf, checks merge/extract/split composition, validates encrypted input, and hashes source PDFs to check that they remain unchanged. Electron E2E tests use real local PDFs and processing with network emulation set offline; native dialog return values are stubbed so exports go to temporary test folders. Screenshots are saved under `test-results/screenshots/`.

Local verification: **24 unit/integration tests**, **6 Electron E2E tests**, and the packaged Windows application's offline reader/export smoke test passed. The E2E suite also checks sandbox settings, canceled export, source-file protection, and lazy rendering/navigation in a 200-page document. A Windows x64 Squirrel installer was generated successfully. The native Windows file picker was subsequently checked manually: the Open PDF dialog appeared and a selected local PDF rendered in Reader. The existing Split workspace retained its page selection during this check.

Shortcuts: `Ctrl+O` opens a document, `Ctrl+F` searches in Reader, left/right or Page Up/Page Down navigate, Tab moves focus, and Escape closes a dialog.

## Implementation notes and limits

- `src/main`: file capabilities, validated IPC, offline protocol, qpdf engine, safe export, and recovery.
- `src/preload`: a narrow typed API; Node.js and raw Electron objects are not exposed.
- `src/renderer`: React workspaces, reusable lazy PDF page component, preview, and local state.
- `src/shared`: export types and deterministic page composition shared by preview and export.
- `resources`: bundled qpdf, generated sample, app icons, and notices.

The current import limit is **512 MB per PDF**. PDF objects remain in memory for the session. Export is non-cancellable once processing begins; an individual engine invocation times out after two minutes. If a multi-file export fails while final files are being committed, already saved files are reported accurately and can remain in the destination. Manipulating pages can alter document-level features, bookmarks, forms, attachments, and signature validity. No signature validity is promised. macOS/Linux binaries, OCR, annotations, printing, and recent-file history are outside this implementation.

The PRD's startup, 20 MB rendering, and 200-page performance targets still need representative hardware benchmarking. Automated offline tests cover application requests; they are not an operating-system packet capture or a clean-machine installer certification.

The development server uses localhost and WebSocket HMR. The packaged app uses `folio://app`, an isolated sandboxed renderer, denied permission requests, blocked navigation/window creation, and no external network access.
