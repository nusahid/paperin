module.exports = {
  outDir: "dist",
  packagerConfig: {
    asar: true,
    executableName: "Paperin",
    icon: "resources/icons/paperin.ico",
    extraResource: [
      "resources/binaries/qpdf",
      "resources/samples",
      "resources/icons",
      "resources/THIRD_PARTY_NOTICES.md",
    ],
    ignore: [
      /^\/dist($|\/)/,
      /^\/src($|\/)/,
      /^\/tests($|\/)/,
      /^\/scripts($|\/)/,
      /^\/resources($|\/)/,
      /^\/test-results($|\/)/,
      /^\/playwright-report($|\/)/,
    ],
    win32metadata: {
      CompanyName: "Paperin",
      FileDescription: "Paperin — Offline PDF workspace",
    },
  },
  makers: [
    {
      name: "@electron-forge/maker-squirrel",
      config: {
        name: "Paperin",
        setupExe: "Paperin-Setup.exe",
        setupIcon: "resources/icons/paperin.ico",
        loadingGif: "resources/icons/paperin-installer.gif",
        authors: "Paperin",
        description: "Your offline PDF workspace",
      },
    },
  ],
};
