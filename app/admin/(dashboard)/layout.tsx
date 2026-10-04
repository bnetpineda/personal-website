import { cookies } from "next/headers";
import { after } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { postDueRecurringQuietly } from "@/lib/finance/service";
import { PRIVACY_COOKIE } from "../_components/nav";
import { Shell } from "../_components/shell";

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  await requireAdmin();
  // Catch up on recurring entries due today if the 06:00 cron hasn't posted them yet
  // (e.g. opening the app after midnight). Shows up on the next navigation.
  after(postDueRecurringQuietly);
  const cookieStore = await cookies();

  return <Shell initialPrivate={cookieStore.get(PRIVACY_COOKIE)?.value === "1"}>{children}</Shell>;
}
