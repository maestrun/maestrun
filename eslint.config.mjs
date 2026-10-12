import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default [
  { ignores: ["dist/**", "coverage/**", ".agents/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { languageOptions: { globals: globals.node } },
  {
    files: ["src/**/*.ts", "tests/**/*.ts"],
    rules: {
      eqeqeq: "error",
      "max-depth": ["error", 3],
      "max-params": ["error", 3],
      "max-lines": ["error", 150],
      "max-lines-per-function": ["error", 30],
      "@typescript-eslint/no-non-null-assertion": "error",
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/consistent-type-definitions": ["error", "type"],
      "@typescript-eslint/explicit-module-boundary-types": "error",
    },
  },
];
