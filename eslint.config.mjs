import { defineConfig, globalIgnores } from "eslint/config";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default defineConfig([
  globalIgnores(["dist/**", "coverage/**", "work/**"]),
  tseslint.configs.recommended,
  reactHooks.configs.flat.recommended,
]);
