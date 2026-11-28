import { createHash, timingSafeEqual } from "node:crypto";
import { revalidatePath, revalidateTag } from "next/cache";
import { env } from "@/lib/env";
import { aiUsageSnapshotSchema } from "@/lib/usage/schema";
import { AI_USAGE_CACHE_TAG, upsertAiUsageSnapshot } from "@/lib/usage/store";

const MAX_BODY_BYTES = 256 * 1024; // 256 KB ceiling for aggregated summaries

function authorized(request: Request): boolean {
  const secret = env.usageSyncSecret() ?? env.cronSecret();
  if (!secret) return false;
  const given = createHash("sha256")
    .update(request.headers.get("authorization") ?? "")
    .digest();
  const expected = createHash("sha256").update(`Bearer ${secret}`).digest();
  return timingSafeEqual(given, expected);
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return Response.json(
      { error: "Unauthorized" },
      { status: 401, headers: { "Cache-Control": "private, no-store" } }
    );
  }

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return Response.json(
      { error: "Payload too large" },
      { status: 413, headers: { "Cache-Control": "private, no-store" } }
    );
  }

  let rawText: string;
  try {
    rawText = await request.text();
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }
  if (Buffer.byteLength(rawText, "utf8") > MAX_BODY_BYTES) {
    return Response.json({ error: "Payload too large" }, { status: 413 });
  }

  let json: unknown;
  try {
    json = JSON.parse(rawText);
  } catch {
    return Response.json({ error: "Malformed JSON" }, { status: 400 });
  }

  const parsed = aiUsageSnapshotSchema.safeParse(json);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid snapshot payload", issues: parsed.error.issues.slice(0, 5) },
      { status: 400 }
    );
  }

  const { updatedAt } = await upsertAiUsageSnapshot(parsed.data);
  revalidateTag(AI_USAGE_CACHE_TAG, "max");
  revalidatePath("/");

  return Response.json(
    {
      ok: true,
      machineId: parsed.data.machineId,
      updatedAt: updatedAt.toISOString(),
    },
    { status: 200, headers: { "Cache-Control": "private, no-store" } }
  );
}
