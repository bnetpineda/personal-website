import { expect, test } from "bun:test";
import { optionalRead } from "./optional-read";

test("a failed panel read gives its empty fallback instead of failing the page, and logs no query values", async () => {
  const logged: string[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => { logged.push(args.join(" ")); };
  try {
    expect(await optionalRead("teach groups", Promise.reject(new TypeError("Failed query: select ... params: Jollibee,250")), [])).toEqual([]);
    expect(await optionalRead("notifications", Promise.resolve([1, 2]), [])).toEqual([1, 2]);
  } finally {
    console.error = original;
  }
  expect(logged).toEqual(["[admin] teach groups failed: TypeError"]);
});
