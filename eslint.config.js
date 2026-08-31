import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";
import { globalIgnores } from "eslint/config";

export default tseslint.config([
  globalIgnores(["dist"]),
  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs["recommended-latest"],
      reactRefresh.configs.vite,
    ],
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "react-refresh/only-export-components": [
        "warn",
        {
          allowExportNames: [
            "useAuth",
            "useConfirm",
            "useCursor",
            "useToast",
            "useWebSocket",
            "getActiveConsumableReplacementChoices",
            "normalizeArenaError",
            "formatStats",
            "describePassive",
            "describeConsumableEffect",
            "getEffectFieldForKind",
            "formatActiveEffects",
          ],
        },
      ],
      "no-console": "warn",
      "no-control-regex": "warn",
      "no-useless-escape": "warn",
    },
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
  },
  {
    // Barrel re-export files: the rule cannot verify `export *` re-exports.
    files: ["src/components/tiptap-ui*/**/index.tsx"],
    rules: {
      "react-refresh/only-export-components": "off",
    },
  },
]);
