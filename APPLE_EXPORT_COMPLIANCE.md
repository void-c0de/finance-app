# Apple export compliance — Finance App

## Declaration

`app.json → expo.ios.infoPlist.ITSAppUsesNonExemptEncryption = false`
(asserted by `npm run test:ios-config`).

This sets `ITSAppUsesNonExemptEncryption` to `NO` in `Info.plist`, so App Store
Connect **does not** ask the export-compliance question at each upload.

## Why `false` is correct

Finance App uses encryption, but only encryption that is **exempt** under
US EAR §740.17(b) / the App Store "standard encryption" exemption:

| Use | Algorithm | Exempt? |
| --- | --- | --- |
| Database at rest | SQLCipher — AES-256 | Yes — data protection for the app's own data |
| Cloud transport | HTTPS / TLS (system) | Yes — provided by the OS |
| Password breach check | SHA-1 k-anonymity prefix (HIBP) | Yes — not encryption of user content |
| Auth tokens | stored via Keychain (system) | Yes |

The app does **not**:

- implement proprietary or non-standard cryptography;
- provide encryption as a primary feature to the user (it is incidental data
  protection);
- fall under the "mass market" reporting requirement beyond the standard
  exemption.

## If Apple ever requires the annual self-classification report

Most apps in this category qualify for the **exemption** and need only the
`Info.plist` key. If a French import declaration or a US self-classification
report is ever requested:

- Encryption: AES-256 (SQLCipher), TLS (system).
- No key length above the mass-market threshold implemented by us.
- CCATS: not required (standard exemption).

Keep this file updated if any non-exempt cryptography is ever added (e.g. a
custom E2E-encryption feature for backups).
