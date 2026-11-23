'use strict';

// This file is loaded by scripts/store-build.mjs after the identity and version
// have been validated. Keeping it CommonJS avoids YAML's lack of macro expansion
// inside the AppX identity fields.
const identity = {
  identityName: process.env.STORE_IDENTITY_NAME,
  publisher: process.env.STORE_PUBLISHER,
  publisherDisplayName: process.env.STORE_PUBLISHER_DISPLAY_NAME,
  displayName: process.env.STORE_DISPLAY_NAME || 'FinanceHub',
  applicationId: process.env.STORE_APPLICATION_ID || 'FinanceHub',
};

for (const [field, value] of Object.entries(identity)) {
  if (!value) throw new Error(`Missing STORE_* value for ${field}; run npm run dist:store instead.`);
}

module.exports = {
  extends: './electron-builder.yml',

  // Store packages are kept out of release/ so the GitHub NSIS release is untouched.
  directories: {
    output: 'release-store',
  },

  // Read by electron/main.cjs so a locally built package also runs in Store mode,
  // even when process.windowsStore is not set by the test harness.
  extraMetadata: {
    financeHubStore: true,
  },

  win: {
    target: [
      {
        target: 'appx',
        arch: ['x64'],
      },
    ],
    artifactName: '${productName}-${version}-${arch}.${ext}',
  },

  appx: {
    ...identity,
    languages: ['en-GB'],
    // AppX needs X.X.X.X. The build script passes the fourth part as BUILD_NUMBER,
    // keeping package.json on the normal three-part release version.
    setBuildNumber: true,
    minVersion: '10.0.19041.0',
    maxVersionTested: '10.0.26100.0',
    backgroundColor: '#12211c',
  },
};
