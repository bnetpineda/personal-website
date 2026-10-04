import { redirect } from "next/navigation";
import { dashboardHref, type DashboardParams } from "../../_components/nav";

/** Activity moved onto the one-screen dashboard; old links and bookmarks land there with their filters. */
export default async function ActivityRedirect({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const pick = (key: keyof DashboardParams) => (typeof params[key] === "string" ? params[key] : null);
  redirect(dashboardHref({ kind: pick("kind"), month: pick("month"), category: pick("category"), q: pick("q") }));
}
