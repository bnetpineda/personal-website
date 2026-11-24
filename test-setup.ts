import { mock } from "bun:test";

// Next enforces the "server-only" boundary at build time (lib/client-bundle.test.ts checks it statically).
// Bun runs server modules directly in tests, so the marker is a no-op here.
mock.module("server-only", () => ({}));
