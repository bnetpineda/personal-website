/*
 * Local bridge for the /neo-admin-ux-score task: hands the probe to the browser run and writes what it
 * measures straight to admin-usability.json, so results are never retyped by hand. `bun run ux:bridge`.
 */
const root = new URL("../", import.meta.url);

Bun.serve({
  port: 4199,
  hostname: "127.0.0.1",
  async fetch(request) {
    const { pathname, searchParams } = new URL(request.url);
    if (pathname === "/probe") return new Response(await Bun.file(new URL("scripts/admin-usability-probe.js", root)).text());
    if (pathname === "/result" && request.method === "POST") {
      const name = searchParams.get("file") === "baseline" ? "admin-usability.baseline.json" : "admin-usability.json";
      await Bun.write(new URL(name, root), JSON.stringify(await request.json(), null, 2) + "\n");
      return new Response(`saved ${name}`);
    }
    return new Response("not found", { status: 404 });
  },
});
console.log("Bridge up on http://127.0.0.1:4199");
