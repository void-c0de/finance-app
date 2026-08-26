// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*"],
    rules: {
      // React Native Animated.Value is intentionally held in refs and read
      // while constructing animated styles. The React DOM-oriented compiler
      // rule reports those supported RN patterns as violations.
      "react-hooks/refs": "off",
      // Initial async screen/bootstrap loaders legitimately transition local
      // state from mount effects.
      "react-hooks/set-state-in-effect": "off",
    },
  }
]);
