import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import { plugin as shadcn } from "@shadcn/lint";
import designSystem from "./design-system.lint.json" with { type: "json" };

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Design-system rules (see DESIGN.md). Enforced on app code built from components/ui.
    // components/ui styles itself; the public one-pager (components/sections, .site CSS)
    // predates the design system and is migrated when it's touched.
    files: ["app/admin/**/*.{ts,tsx}"],
    plugins: { shadcn },
    settings: designSystem.settings,
    rules: designSystem.rules,
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
