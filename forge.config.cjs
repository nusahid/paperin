module.exports = {
  outDir: "dist",
  packagerConfig: {
    asar: true,
    executableName: "Folio",
    icon: "resources/icons/folio.ico",
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
      CompanyName: "Folio",
      FileDescription: "Folio — Offline PDF workspace",
    },
  },
  makers: [
    {
      name: "@electron-forge/maker-squirrel",
      config: {
        name: "Folio",
        setupIcon: "resources/icons/folio.ico",
        authors: "Folio",
        description: "Your offline PDF workspace",
      },
    },
  ],
};
