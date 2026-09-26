import { cookies } from "next/headers";
import { after } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { postDueRecurringQuietly } from "@/lib/finance/service";
import { PRIVACY_COOKIE } from "../_components/nav";
import { AdminHeader, MobileNav, Shell } from "../_components/shell";

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

  return (
    <Shell initialPrivate={cookieStore.get(PRIVACY_COOKIE)?.value === "1"}>
      <AdminHeader />
      <main id="main-content" className="mx-auto w-full max-w-6xl flex-1 px-4 pt-8 pb-8 lg:pb-12">
        {children}
      </main>
      <footer className="mx-auto w-full max-w-6xl px-4 pb-28 font-mono text-xs text-muted-foreground lg:pb-8">
        Private dashboard · Crypto prices by{" "}
        <a className="underline underline-offset-4" href="https://www.coingecko.com/" target="_blank" rel="noopener noreferrer">
          CoinGecko
        </a>{" "}
        · FX by{" "}
        <a className="underline underline-offset-4" href="https://frankfurter.dev/" target="_blank" rel="noopener noreferrer">
          Frankfurter
        </a>{" "}
        (ECB)
      </footer>
      <MobileNav />
    </Shell>
  );
}
