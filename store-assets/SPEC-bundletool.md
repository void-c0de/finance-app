# bundletool — optional AAB validator

`npm run validate:aab` does structural validation on its own (an AAB is a zip:
it checks `BundleConfig.pb`, `base/manifest/`, `base/dex/`, `base/resources.pb`,
native libs, assets, SQLCipher). For the *full* Google check and a real
per-device download-size estimate, drop in Google's official bundletool:

1. Download the latest **`bundletool-all-<version>.jar`** from
   <https://github.com/google/bundletool/releases> (official Google repo, ~30 MB).
2. Put it at `tools/bundletool.jar` (this path is gitignored) **or** set
   `BUNDLETOOL_JAR=/abs/path/bundletool-all.jar`.
3. Re-run `npm run validate:aab`. It will then also run
   `bundletool validate` and `bundletool build-apks … --connected-device=false`
   to estimate the download size.

Do **not** commit the jar. It is a dev tool, not a project dependency.

Gradle's own `bundleRelease` task already produces a structurally valid AAB;
bundletool mainly adds the Play-side sanity checks and the size estimate.
