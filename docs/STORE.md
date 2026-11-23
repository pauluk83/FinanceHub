# Microsoft Store (AppX) package

FinanceHub has a separate Microsoft Store build target. It produces an x64 **AppX**
package for Partner Center; it does **not** change the normal GitHub NSIS release and it
does **not** upload or publish anything.

This repository uses electron-builder 26.18, whose stable Windows package target is
`appx`. The Store accepts `.appx` packages, so no MSIX target is required. If a future
electron-builder version is adopted, its `msix` target is still beta and must be checked
before replacing this path.

## What Store mode changes

`npm run dist:store` builds the renderer with Vite's `store` mode and packages it with
`electron-builder.store.cjs`.

- The renderer always uses the blank `data/web-seed.json` and the public data fixes, even
  if the private `data/workbook.json` exists on this machine.
- The GitHub updater prompt is not mounted. The main process detects the AppX host
  (`process.windowsStore`) or the packaged `financeHubStore` marker and does not register
  the GitHub update handlers. Updates are delivered by the Microsoft Store.
- The package gets a four-part version: `package.json`'s `YYYY.M.D` version plus a
  revision. Nothing in the normal `package.json` version or the NSIS release changes.
- The package is written to `release-store/`, never `release/`.

The Store package has its own Windows package identity and its own app-data folder. It
does **not** automatically read the data of an existing NSIS installation. Use FinanceHub's
backup/restore flow if a user needs to move a budget into the Store app.

## 1. Reserve the name and copy the identity

Create a free individual Partner Center account through
<https://storedeveloper.microsoft.com/> (the normal Partner Center registration can also be
used). Reserve the FinanceHub name, then open the product's **Product identity** page.

Copy these values into `store/identity.json` (copy the example first):

```powershell
Copy-Item .\store\identity.example.json .\store\identity.json
```

| Partner Center field | `store/identity.json` | Notes |
| --- | --- | --- |
| Package/Identity/Name | `identityName` | Example: `12345ZaneStanton.FinanceHub` |
| Package/Identity/Publisher | `publisher` | Example: `CN=12345ZaneStanton`; keep `CN=` exactly |
| Package/Properties/PublisherDisplayName | `publisherDisplayName` | Shown in the Store |
| Package/Properties/DisplayName | `displayName` | Usually `FinanceHub` |
| Application Id | `applicationId` | App-defined, usually `FinanceHub` |

`store/identity.json` is gitignored: identity values are local build input, not repository
source. The example file contains deliberate placeholders and is rejected by the build.
Environment variables override the file:

```text
STORE_IDENTITY_NAME
STORE_PUBLISHER
STORE_PUBLISHER_DISPLAY_NAME
STORE_DISPLAY_NAME
STORE_APPLICATION_ID
STORE_REVISION
```

Validate without building:

```powershell
npm run dist:store -- --check
```

## 2. Versioning

The AppX manifest requires four numeric parts. The build takes the three-part release
version from `package.json` and appends `STORE_REVISION` (the `revision` in
`store/identity.json`, default `0`):

```text
package.json        2026.11.22
STORE_REVISION      0
AppX manifest       2026.11.22.0
```

Every Store submission must use a version higher than the previous one. Bump the revision
for a new package on the same release date:

```powershell
$env:STORE_REVISION = '1'
npm run dist:store
```

The revision must be a whole number from 0 to 65535, and every part of the version must
also fit in 16 bits. Do not put the fourth part into `package.json`; the normal release
tooling expects `YYYY.M.D`.

## 3. Build the package

```powershell
npm run dist:store
```

The script checks the identity and version, builds the Store renderer, packages the AppX,
and renames the artifact to include the four-part version:

```text
release-store/FinanceHub-2026.11.22.0-x64.appx
```

`release-store/` is gitignored, as are the identity values and any test certificates.
A build does not upload, submit, tag, or publish.

Store submissions need branded tile and Store logo assets. The example uses
electron-builder's sample assets until `build/appx/` contains the real
`StoreLogo.png`, `Square150x150Logo.png`, `Square44x44Logo.png` and
`Wide310x150Logo.png` images. Replace those before submitting; the manifest and package
still build without them.

## 4. WACK package check

WACK is deprecated and Partner Center runs the authoritative certification, but it is a
useful local pre-check. Install the Windows SDK (including the App Certification Kit) and
run these commands from an **elevated** PowerShell. Adjust the SDK version and the
`D:\finance` paths if your installation differs.

WACK needs to install the package for its dynamic checks. The package must be signed for
that test, and the signing certificate's subject must match the `publisher` in the
manifest. Do not submit the development-signed copy: keep the unsigned build output for
upload, and sign a **copy** for WACK.

Create a self-signed development certificate with the exact Partner Center publisher
subject, trust it for the local machine, and sign a copy:

```powershell
$publisher = (Get-Content .\store\identity.json | ConvertFrom-Json).publisher
$cert = New-SelfSignedCertificate `
  -Type Custom `
  -Subject $publisher `
  -KeyUsage DigitalSignature `
  -FriendlyName "FinanceHub AppX test" `
  -KeyExportPolicy Exportable `
  -CertStoreLocation "Cert:\CurrentUser\My" `
  -TextExtension @("2.5.29.37={text}1.3.6.1.5.5.7.3.3", "2.5.29.19={text}")

$password = ConvertTo-SecureString -String "choose-a-local-password" -Force -AsPlainText
New-Item -ItemType Directory -Force .\tmp | Out-Null
Export-PfxCertificate -Cert $cert -FilePath .\tmp\financehub-appx-test.pfx -Password $password
Export-Certificate -Cert $cert -FilePath .\tmp\financehub-appx-test.cer
Import-Certificate -FilePath .\tmp\financehub-appx-test.cer -CertStoreLocation Cert:\LocalMachine\TrustedPeople

Copy-Item .\release-store\FinanceHub-2026.11.22.0-x64.appx .\tmp\FinanceHub-wack.appx
& "${env:ProgramFiles(x86)}\Windows Kits\10\bin\10.0.26100.0\x64\signtool.exe" sign `
  /fd SHA256 /f .\tmp\financehub-appx-test.pfx /p "choose-a-local-password" `
  .\tmp\FinanceHub-wack.appx
```

Enable Windows **Developer Mode** (Settings → System → For developers), then run WACK:

```powershell
$wack = "${env:ProgramFiles(x86)}\Windows Kits\10\App Certification Kit\appcert.exe"
& $wack reset
& $wack test -appxpackagepath "D:\finance\tmp\FinanceHub-wack.appx" `
  -reportoutputpath "D:\finance\tmp\wack-appx.xml"
```

Review `tmp/wack-appx.xml` and the generated report. The pre-check passes when there are no
`FAIL` results; warnings still need a reason. Delete `tmp/` and the development certificate
afterwards. The development certificate and package are local test artifacts and must not
be committed or uploaded.

The WACK AppX command inspects the package and may install/launch it. If it cannot install,
check in this order: Developer Mode, the certificate in `TrustedPeople`, the certificate
subject exactly matching the manifest publisher, and the package architecture (x64).

## 5. Submit in Partner Center

Do this manually when the owner authorises a Store submission. The build script itself
never uploads.

1. Open the reserved product in Partner Center and choose the **MSIX or PWA app** product
   type.
2. Confirm the Product identity values still match `store/identity.json`.
3. Complete **Properties** (category, privacy policy URL, support contact), **Age ratings**,
   **Pricing and availability**, and the **Store listing** (description, screenshots,
   Store logos, support URL).
4. Under **Packages**, upload the unsigned
   `release-store/FinanceHub-2026.11.22.0-x64.appx`. Partner Center accepts `.appx`; no
   `.appxupload` is produced by this target. Do not upload the development-signed WACK copy.
5. In certification notes, state that FinanceHub works locally without an account, cloud
   sync is optional, and updates are managed by the Store. Provide a test account only if a
   reviewer needs cloud features; keep any test credentials in Partner Center, never in the
   repository.
6. Submit for certification. Submission and publication are separate actions; do not press
   **Publish** until the owner has approved the listing.

The Store re-signs the package as part of certification, so no purchased code-signing
certificate is required for this path. The normal NSIS installer remains unsigned and is
unrelated to the Store package.

Before submitting, verify:

- [ ] `store/identity.json` matches the reserved product identity exactly.
- [ ] The AppX manifest version is four parts and higher than the last submitted version.
- [ ] The package was built with `npm run dist:store` (blank seed, Store mode).
- [ ] The app opens from the installed AppX identity, not from the NSIS install.
- [ ] The in-app update prompt never appears; updates are Store-managed.
- [ ] WACK produced no `FAIL`, and every warning has a reason.
- [ ] Store logos and screenshots are the real FinanceHub assets.
- [ ] No `store/identity.json`, `release-store/`, certificate, password or package is
  committed.
