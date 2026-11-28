import { getAiUsageSnapshot } from "@/lib/usage/store";

export async function GET() {
  const payload = await getAiUsageSnapshot();
  if (!payload) {
    return Response.json(
      { snapshot: null, updatedAt: null },
      {
        status: 200,
        headers: {
          "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120",
        },
      }
    );
  }
  return Response.json(payload, {
    status: 200,
    headers: {
      "Cache-Control": "public, s-maxage=30, stale-while-revalidate=300",
    },
  });
}
