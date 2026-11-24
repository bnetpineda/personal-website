import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { ADMIN_MAX_DURATION_SECONDS } from "@/lib/finance/deadline";

/*
 * A Server Action runs under the maxDuration of the page that calls it, and ⌘K can sync from any admin
 * page. Actions budget their work against ADMIN_MAX_DURATION_SECONDS, so every page must export it.
 */
const DASHBOARD = join(import.meta.dir, "(dashboard)");

function pages(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return pages(path);
    return name === "page.tsx" ? [path] : [];
  });
}

describe("admin page time limits", () => {
  test("every dashboard page that renders exports the shared maxDuration", () => {
    const missing = pages(DASHBOARD).filter((file) => {
      const source = readFileSync(file, "utf8");
      // Pages that only redirect never run an action.
      if (/\bredirect\(/.test(source) && !/return\s*\(?\s*</.test(source)) return false;
      return !new RegExp(`^export const maxDuration = ${ADMIN_MAX_DURATION_SECONDS};$`, "m").test(source);
    });
    expect(missing.map((f) => f.slice(DASHBOARD.length + 1).replaceAll("\\", "/"))).toEqual([]);
  });
});
