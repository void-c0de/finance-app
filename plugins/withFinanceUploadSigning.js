const { withAppBuildGradle } = require('expo/config-plugins');

const VARIABLES_MARKER = '// @generated finance-upload-signing variables';
const CONFIG_MARKER = '// @generated finance-upload-signing config';

function withFinanceUploadSigning(config) {
  return withAppBuildGradle(config, (gradleConfig) => {
    if (gradleConfig.modResults.language !== 'groovy') {
      throw new Error('Finance upload signing currently supports Groovy build.gradle only.');
    }

    let source = gradleConfig.modResults.contents;

    if (!source.includes(VARIABLES_MARKER)) {
      const anchor = "android {";
      const variables = `${VARIABLES_MARKER}\n` +
        "def financeUploadStoreFile = findProperty('FINANCE_UPLOAD_STORE_FILE') ?: System.getenv('FINANCE_UPLOAD_STORE_FILE')\n" +
        "def financeUploadStorePassword = findProperty('FINANCE_UPLOAD_STORE_PASSWORD') ?: System.getenv('FINANCE_UPLOAD_STORE_PASSWORD')\n" +
        "def financeUploadKeyAlias = findProperty('FINANCE_UPLOAD_KEY_ALIAS') ?: System.getenv('FINANCE_UPLOAD_KEY_ALIAS')\n" +
        "def financeUploadKeyPassword = findProperty('FINANCE_UPLOAD_KEY_PASSWORD') ?: System.getenv('FINANCE_UPLOAD_KEY_PASSWORD')\n" +
        'def hasFinanceUploadSigning = [financeUploadStoreFile, financeUploadStorePassword, financeUploadKeyAlias, financeUploadKeyPassword].every { value -> value != null && !value.toString().trim().isEmpty() }\n\n';
      source = source.replace(anchor, `${variables}${anchor}`);
    }

    if (!source.includes(CONFIG_MARKER)) {
      const signingAnchor = '    }\n    buildTypes {';
      const uploadConfig = `        ${CONFIG_MARKER}\n` +
        '        if (hasFinanceUploadSigning) {\n' +
        '            upload {\n' +
        '                storeFile file(financeUploadStoreFile)\n' +
        '                storePassword financeUploadStorePassword\n' +
        '                keyAlias financeUploadKeyAlias\n' +
        '                keyPassword financeUploadKeyPassword\n' +
        '            }\n' +
        '        }\n';
      if (!source.includes(signingAnchor)) {
        throw new Error('withFinanceUploadSigning: could not find the "signingConfigs { … } buildTypes {" anchor in app/build.gradle.');
      }
      source = source.replace(signingAnchor, `${uploadConfig}    }\n    buildTypes {`);

      // The RN template writes either `signingConfig signingConfigs.debug` or
      // `signingConfig = signingConfigs.debug` (RN 0.73+). Handle both, and
      // refuse to continue silently if neither is present — a debug-signed
      // "release" AAB must never leave this build without the maintainer knowing.
      const releaseSigningRe = /(release\s*\{[\s\S]*?)signingConfig(\s*=\s*|\s+)signingConfigs\.debug/;
      if (!releaseSigningRe.test(source)) {
        throw new Error('withFinanceUploadSigning: could not find `signingConfig … signingConfigs.debug` in the release buildType — the upload-signing switch was NOT applied. Update the plugin.');
      }
      source = source.replace(
        releaseSigningRe,
        '$1signingConfig$2hasFinanceUploadSigning ? signingConfigs.upload : signingConfigs.debug',
      );
    }

    gradleConfig.modResults.contents = source;
    return gradleConfig;
  });
}

module.exports = withFinanceUploadSigning;
