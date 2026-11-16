# Publish source code and installers on GitHub

This guide is for repository owners and maintainers. App users should follow the [installation guide](INSTALLATION.md).

The goal is to provide a download button that **downloads `Paperin-Setup.exe` directly**, without requiring users to browse release pages or download source code.

## 1. Prepare the repository

Create a **public** GitHub repository so anyone can download the installer without signing in. If you plan to push this local Git repository to a new remote, create an empty repository without adding a README or license on GitHub first.

The documentation is configured for [nusahid/paperin](https://github.com/nusahid/paperin). Create this repository or make it publicly accessible before publishing the installer.

The direct download URL follows this pattern:

```text
https://github.com/nusahid/paperin/releases/latest/download/Paperin-Setup.exe
```

The release asset must be named exactly **`Paperin-Setup.exe`**, including capitalization. This filename is configured in `forge.config.cjs` and stays the same when the app version changes. Remove the pending release notices from the README and installation guide after publishing the public installer and verifying its download link.

See [GitHub: Linking to releases](https://docs.github.com/en/repositories/releasing-projects-on-github/linking-to-releases) for the documented URL pattern.

## 2. Upload the source code

Review the changes and file list before committing:

```powershell
git status
git diff
git remote -v
```

`node_modules/`, `out/`, `dist/`, test output, downloaded qpdf binaries, and generated resources are already excluded by `.gitignore`. Upload installers to **GitHub Releases** because they are large distribution files. GitHub Actions sets up dependencies and resources again during the build.

If there is no `origin` remote yet, run:

```powershell
git remote add origin https://github.com/nusahid/paperin.git
```

If `origin` already exists, check its address. Commit the reviewed files and push your current branch:

```powershell
git add .
git commit -m "Prepare Paperin documentation and Windows release"
git push -u origin HEAD
```

Git commands require authentication with an account that has write access to the repository.

## 3A. Build locally and upload the installer manually

Use this option to publish an installer built on your Windows computer.

```powershell
npm ci
npm run setup:qpdf
npm test
npm run test:e2e
npm run make
npm run test:package
```

The installer to upload is located at:

```text
dist/make/squirrel.windows/x64/Paperin-Setup.exe
```

Generate its checksum in PowerShell:

```powershell
$installerPath = '.\dist\make\squirrel.windows\x64\Paperin-Setup.exe'
$installerHash = (Get-FileHash -LiteralPath $installerPath -Algorithm SHA256).Hash.ToLowerInvariant()
Set-Content -LiteralPath '.\dist\make\squirrel.windows\x64\SHA256SUMS.txt' -Value "$installerHash  Paperin-Setup.exe" -Encoding ascii
```

On GitHub:

1. Open the repository, then select **Releases → Draft a new release**.
2. Create a version tag matching `package.json`, such as **`v0.1.0`**, targeting the source commit used for the build.
3. Enter a title such as **Paperin v0.1.0** and a summary of changes.
4. Attach **`Paperin-Setup.exe`** and **`SHA256SUMS.txt`** from the output folder above. `.nupkg` and `RELEASES` are not required for users installing manually.
5. State that the package is for Windows x64 and that the installer is unsigned. Include the installation guide URL for your repository.
6. Review the release, mark the stable release as **Latest**, then choose **Publish release**. It must be published and publicly accessible for anyone to download it.

If the tag also triggers the release workflow, choose one publishing route. If a release already exists for that tag, the workflow refuses to create a second release and leaves the existing release unchanged.

## 3B. Build with GitHub Actions

The repository includes a [Windows Release workflow](../.github/workflows/release-windows.yml). It builds the installer on a Windows runner when a `v*` tag is pushed. After all checks pass, it publishes a **public release** containing the installer and checksum and marks it as **Latest**. Pushing a version tag starts this publication process, so review the source and version before pushing the tag.

For the version currently listed in `package.json`:

```powershell
git tag v0.1.0
git push origin v0.1.0
```

Do not reuse a tag for a different version. For later releases, update `package.json` and its lockfile, commit and push the changes, then create a matching version tag.

The workflow:

1. Checks that the tag is `v` followed by the version in `package.json`.
2. Installs dependencies and sets up verified qpdf binaries.
3. Runs unit/integration and E2E tests, then builds the installer.
4. Runs the packaged app smoke test.
5. Generates `SHA256SUMS.txt`, saves both files as an Actions artifact, and publishes the latest GitHub Release.

After the workflow succeeds, open **Releases** and verify its notes, installer, checksum, and public download link. The installer is still unsigned. Test installation on a clean Windows machine before treating the package as ready for wider distribution.

The workflow uses the built-in `GITHUB_TOKEN` with `contents: write` permission on the release job. You do not need to put a personal token in the source code. Organization or repository policies may restrict GitHub Actions or write access; adjust the repository settings if necessary.

The workflow refuses to overwrite an existing release. If a release already exists for the tag, inspect its assets and use a new version tag for a new release. If a failed run left an unpublished draft, inspect that draft before deciding whether to remove it and rerun the workflow.

## 4. Verify public downloads

1. Open the README in a private browser window or with an account that has no maintainer access.
2. Click **Download Paperin for Windows (.exe)**.
3. Confirm that **`Paperin-Setup.exe`** is downloaded, rather than HTML or a source code ZIP.
4. Compare its checksum with **`SHA256SUMS.txt`** from the same release.
5. Install it on a clean Windows x64 machine and try the sample PDF, merging, splitting, and signature image export.
6. Follow the [installation guide](INSTALLATION.md) again to confirm it matches the published package.

The `/releases/latest/download/...` link works when the repository is accessible to the user, a published release is selected as latest, and that release contains the named asset. Drafts and prereleases do not become latest for this link. See also [GitHub CLI: creating a release](https://cli.github.com/manual/gh_release_create).

## Example release notes

```markdown
## Paperin v0.1.0

An offline PDF workspace for Windows x64.

### Download and installation

1. Download Paperin-Setup.exe from Assets.
2. Run the installer, then open Paperin from the Start Menu.
3. Click Try a sample PDF to explore the app.

Node.js and qpdf do not need to be installed separately.
The installer is unsigned.

### Features

- PDF reader with text search and page navigation.
- Merge multiple PDFs.
- Split, extract, and remove pages in a new PDF.
- PNG signature images with Save As to a new PDF.

### Limitations

- Windows x64 only; 512 MB import limit per PDF.
- OCR and automatic updates are not available.
- Signature images do not provide identity verification or digital certificates.
```
