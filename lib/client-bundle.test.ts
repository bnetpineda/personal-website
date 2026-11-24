import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

/*
 * Static import-graph guard: nothing a "use client" file reaches (statically or through import())
 * may pull in server-weight packages. zod ships ~60 KB gzipped of locales, node:crypto becomes a
 * ~140 KB browser polyfill, and fast-xml-parser is only for statement parsing on the server.
 * "use server" files are action references on the client, so the walk stops there.
 */

const ROOT = resolve(import.meta.dir, "..");
const FORBIDDEN = [/^zod(\/|$)/, /^(node:)?crypto$/, /^fast-xml-parser(\/|$)/, /^server-only$/];
const SOURCE_DIRS = ["app", "components", "lib", "hooks"];
const EXTENSIONS = [".ts", ".tsx", ".js", ".mjs"];

function files(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...files(path));
    else if (EXTENSIONS.some((e) => name.endsWith(e)) && !/\.test\.tsx?$/.test(name)) out.push(path);
  }
  return out;
}

function resolveLocal(from: string, spec: string): string | null {
  const base = spec.startsWith("@/") ? join(ROOT, spec.slice(2)) : spec.startsWith(".") ? resolve(dirname(from), spec) : null;
  if (!base) return null;
  for (const candidate of [base, ...EXTENSIONS.map((e) => base + e), ...EXTENSIONS.map((e) => join(base, "index" + e))]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

/** Runtime imports only: `import type` and `export type` are erased. */
function imports(source: string): string[] {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const specs: string[] = [];
  const statement = /(?:^|\n)\s*(import|export)\s+(type\s+)?([^'"]*?)\s*from\s*["']([^"']+)["']/g;
  for (const m of code.matchAll(statement)) {
    if (m[2]) continue;
    // `import { type A, type B } from` is erased entirely.
    const names = m[3].match(/^\{([^}]*)\}$/)?.[1];
    if (names !== undefined && names.split(",").every((n) => !n.trim() || /^type\s/.test(n.trim()))) continue;
    specs.push(m[4]);
  }
  for (const m of code.matchAll(/(?:^|\n)\s*import\s*["']([^"']+)["']/g)) specs.push(m[1]);
  // import("x") is a runtime chunk, except `import("x").Type` in a type position.
  for (const m of code.matchAll(/import\(\s*["']([^"']+)["']\s*\)(?!\.[A-Z])/g)) specs.push(m[1]);
  return specs;
}

const directive = (source: string, name: string) => new RegExp(`^\\s*(?:\\/\\/.*\\n|\\/\\*[\\s\\S]*?\\*\\/\\s*)*["']${name}["']`).test(source);

function leaks(): string[] {
  const all = SOURCE_DIRS.filter((d) => existsSync(join(ROOT, d))).flatMap((d) => files(join(ROOT, d)));
  const clientEntries = all.filter((f) => directive(readFileSync(f, "utf8"), "use client"));
  const problems = new Set<string>();
  for (const entry of clientEntries) {
    const seen = new Set<string>();
    const stack: { file: string; path: string[] }[] = [{ file: entry, path: [entry] }];
    while (stack.length) {
      const { file, path } = stack.pop()!;
      if (seen.has(file)) continue;
      seen.add(file);
      const source = readFileSync(file, "utf8");
      if (file !== entry && directive(source, "use server")) continue;
      for (const spec of imports(source)) {
        if (FORBIDDEN.some((re) => re.test(spec))) {
          // One line per offending import, named by the client entry that first reached it.
          const name = (p: string) => relative(ROOT, p).replaceAll("\\", "/");
          problems.add(`${name(file)} imports ${spec} (reached from ${name(path[0])})`);
          continue;
        }
        const next = resolveLocal(file, spec);
        if (next) stack.push({ file: next, path: [...path, next] });
      }
    }
  }
  // One line per offending import, keeping the first client entry that reached it.
  const byImport = new Map<string, string>();
  for (const p of [...problems].sort()) {
    const key = p.replace(/ \(reached from .*\)$/, "");
    if (!byImport.has(key)) byImport.set(key, p);
  }
  return [...byImport.values()];
}

describe("client bundles", () => {
  test("no client component reaches zod, node:crypto, fast-xml-parser or a server-only module", () => {
    expect(leaks()).toEqual([]);
  });
});
