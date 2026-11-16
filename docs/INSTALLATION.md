# Download and install Paperin

This guide explains how to install the ready-to-use Windows app. Download the installer and run it to get started.

[⬇ Download Paperin for Windows (.exe)][download] · [Back to README](../README.md)

## Before you start

- Use a **Windows x64** computer. Check **Settings → System → About → System type** to view your system architecture.
- You need an internet connection to download the installer and enough free disk space for the installer and the app.
- You do not need to install Node.js, npm, Git, or qpdf separately to use the app.
- Installation has not yet been certified on a clean Windows machine. Minimum RAM and storage requirements have not been established through reference hardware benchmarks.

## 1. Download the installer

1. Click [**Download Paperin for Windows (.exe)**][download]. This link downloads the installer directly from the latest public release.
2. If your browser asks where to save it, choose **Downloads** or another folder.
3. Wait for the download to finish. The file should be named **`Paperin-Setup.exe`**.

If the direct link is unavailable, open the [Releases page][releases], select the release marked **Latest**, expand **Assets**, and click **`Paperin-Setup.exe`**.

**Source code (zip)** and **Source code (tar.gz)** contain the project source for developers. To install the ready-to-use app, choose **`Paperin-Setup.exe`**. You do not need the `.nupkg` or `RELEASES` files if they are also listed.

## 2. Install the app

1. Close Paperin if an earlier version is running.
2. Open **File Explorer → Downloads**, then double-click **`Paperin-Setup.exe`**.
3. Wait for installation to finish. The Squirrel installer may display only a brief installation screen, without a folder selection wizard.
4. If the app does not open automatically, press the Windows key, type **Paperin**, and open it.
5. Click **Try a sample PDF** to check the reader, or **Browse files** to open your own document.

Once installed, Paperin works without an internet connection.

## Windows SmartScreen warning

The installer is currently **unsigned**. Windows or your browser may display an unknown publisher warning or a **Windows protected your PC** message.

Check that the file came from the official repository linked in the README. If a checksum is provided, compare it as described below. After verifying the source and choosing to run the file, **More info → Run anyway** may be available. Work or school device policies may disable this option; contact your device administrator if installation is blocked. Avoid disabling antivirus or Windows protection.

## Verify the download checksum

Releases built through the project workflow include **`SHA256SUMS.txt`**. Download it from **Assets** on the same release as your installer. For a manual release, the maintainer must generate and attach this file.

Open PowerShell in the folder containing the installer:

```powershell
Get-FileHash -LiteralPath .\Paperin-Setup.exe -Algorithm SHA256
```

Compare the **Hash** value with the entry for `Paperin-Setup.exe` in `SHA256SUMS.txt`. If they differ, do not run the installer; download it again from the same release. A checksum helps detect a damaged or different file and does not replace checking the download source.

## Start using Paperin

- **Read a PDF:** click **Browse files**, select a PDF, and use **Reader**.
- **Merge PDFs:** open **Merge**, add files, arrange their order, and save the result.
- **Split a PDF:** open **Split**, choose pages or ranges, and save the result.
- **Add a signature image:** open a PDF in **Reader → Add Signature**, import a PNG, place the image, and choose **Save As**.

See the [user guide](USER-GUIDE.md) for detailed instructions.

## Update the app

Paperin does not check for updates automatically.

1. Save your work and close the app.
2. Check the version on the [Releases page][releases] and compare it with the version shown in the app.
3. Download the latest installer using the [download link][download].
4. Run the installer, reopen Paperin, and check the version.

## Uninstall the app

1. Save your work and close Paperin.
2. Open **Settings → Apps → Installed apps**, or **Apps & features** on other Windows versions.
3. Find **Paperin**, choose **Uninstall**, and follow the Windows prompts.

PDFs saved in your personal folders are managed as ordinary files. Back up important documents before changing your app installation.

## Troubleshooting

| Problem                                  | What to try                                                                                                                                                                          |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| The download button returns 404          | Check [Releases][releases]. The direct link requires a public release marked Latest with an asset named exactly `Paperin-Setup.exe`. Draft releases are not available to the public. |
| The downloaded ZIP contains source code  | Return to Assets and select `Paperin-Setup.exe`.                                                                                                                                     |
| Windows blocks the installer             | Verify the download source and read the [SmartScreen section](#windows-smartscreen-warning).                                                                                         |
| The app will not open                    | Confirm you are using Windows x64, close any remaining Paperin processes, and try again. If it still fails, report your Windows version and the error message.                       |
| A PDF asks for a password                | Enter the correct document password. Encrypted PDFs are not supported by Add Signature.                                                                                              |
| Search cannot find text in a scanned PDF | The document may contain only images. Paperin does not currently include OCR.                                                                                                        |
| A PDF cannot be imported                 | Check that it is a valid PDF no larger than 512 MB.                                                                                                                                  |
| Export fails                             | Choose a new filename and location, check folder write permissions and free disk space, and read the error message. A source file cannot be used as the export destination.          |
| A signature image cannot be imported     | Use a static PNG up to 15 MB, 16 million pixels, and 16,384 pixels per dimension. JPEG and animated PNG images are not supported.                                                    |

If the problem continues, open a [GitHub issue][issues] with reproduction steps and the error message. Do not attach PDFs or signature images containing personal information.

[download]: https://github.com/nusahid/paperin/releases/latest/download/Paperin-Setup.exe
[releases]: https://github.com/nusahid/paperin/releases
[issues]: https://github.com/nusahid/paperin/issues
