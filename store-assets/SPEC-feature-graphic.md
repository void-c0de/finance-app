# Feature graphic — production spec (design task)

Google Play requires a **1024 × 500 px** feature graphic (PNG or JPG, no alpha
needed, ≤ 15 MB) for the store listing. This is the one asset that cannot be
derived from an existing file — it needs an original composition + typography.
The icon (`store-assets/play-icon-512.png`) is done; this is the remaining
design blocker.

## Hard constraints (Play + policy)

- Exactly **1024 × 500 px**.
- **No** app screenshots inside it, **no** device frames, **no** "Editor's
  Choice" / award / rating badges, **no** bank logos, **no** star ratings, **no**
  price. (All of these get the listing rejected or are dishonest.)
- Text must stay readable and must not be clipped — Play overlays a play button
  and may crop ~15% on some surfaces. Keep the safe zone to the **centre
  ~924 × 400 px**; keep essential text out of the far corners.
- Must not imply features the app does not have (no "your bank in one tap", no
  "invest", no "instant transfers").

## Visual identity to reuse

| Element | Value |
| --- | --- |
| Brand mark | the "F" glyph from `assets/images/icon.png` (white F on brand blue) |
| Brand blue | sample from the icon centre ≈ `#4497E7` → `#3E7EE7` (a blue gradient, top-left lighter) |
| App name | "Finance App" *(pending the final public name — see `LEGAL_PLACEHOLDERS.md` #8)* |
| Typography | the app uses the system font stack; use a clean geometric sans (e.g. Inter / SF Pro / Roboto) for the wordmark |
| Tone | calm, precise, non-salesy — matches the in-app copy and `STORE_LISTING.md` |

## Recommended layout

```
┌────────────────────────────────────────────────────────────┐ 1024×500
│  [ brand-blue gradient background, subtle ]                 │
│                                                            │
│     ⬛ F        Finance App                                 │
│              Überblick. Budgets. Sparziele. Offline-first.  │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

- Left third: the "F" mark in a rounded square (~180 px), vertically centred.
- Right two-thirds: app name (~64–72 px), one honest tagline line (~28–32 px)
  drawn from `STORE_LISTING.md` — e.g. *"Deine Finanzen — lokal verschlüsselt,
  offline nutzbar."* Do **not** mention Premium or banking in the graphic.
- Background: flat brand blue or a gentle top-left→bottom-right gradient. No
  photos.

## Deliverable

`store-assets/feature-graphic.png` (1024 × 500). Once present, `npm run
release:doctor` flips `FEATURE GRAPHIC` to PASS and `check:legal` / the closed-
test checklist stop flagging it.

## Why this is not auto-generated here

Rendering a legible wordmark needs an embedded font and kerning decisions; a
programmatic block-text placeholder would violate the "no huge unreadable text"
guidance and look unprofessional on the store. This is a 20-minute job in any
design tool (Figma/Canva/Affinity) with the values above.
