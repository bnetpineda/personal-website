import { cookies } from "next/headers";
import { after } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { getAccounts, getCategories, getEntrySuggestions, getLastEntryDefaults } from "@/lib/dal";
import { todayManila } from "@/lib/finance/dates";
import { postDueRecurringQuietly } from "@/lib/finance/service";
import { getNotifications } from "@/lib/finance/notifications-dal";
import { CommandMenu } from "../_components/command-menu";
import { PRIVACY_COOKIE } from "../_components/nav";
import { QuickAdd } from "../_components/quick-add";
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
  const [cookieStore, categories, accounts, suggestions, lastExpense, lastIncome, alerts] = await Promise.all([
    cookies(),
    getCategories(),
    getAccounts(),
    getEntrySuggestions(),
    getLastEntryDefaults("expense"),
    getLastEntryDefaults("income"),
    getNotifications(),
  ]);

  const today = todayManila();
  const formCategories = (kind: "expense" | "income") =>
    categories.filter((c) => c.kind === kind).map(({ id, name, color, archived }) => ({ id, name, color, archived }));
  const defaults = (last: typeof lastExpense) => ({
    occurredOn: today,
    categoryId: last?.categoryId,
    account: last?.account,
    currency: last?.currency,
  });

  return (
    <Shell initialPrivate={cookieStore.get(PRIVACY_COOKIE)?.value === "1"}>
      <AdminHeader notifications={alerts.filter((a) => !a.dismissed).length} />
      <main id="main-content" className="mx-auto w-full max-w-6xl flex-1 px-4 pt-8 pb-8 lg:pb-12">
        {children}
      </main>
      <footer className="mx-auto w-full max-w-6xl px-4 pb-40 font-mono text-xs text-muted-foreground lg:pb-8">
        Private dashboard · Crypto prices by{" "}
        <a className="underline underline-offset-4" href="https://www.coingecko.com/" target="_blank" rel="noopener noreferrer">
          CoinGecko
        </a>{" "}
        · US quotes by{" "}
        <a className="underline underline-offset-4" href="https://finnhub.io/" target="_blank" rel="noopener noreferrer">
          Finnhub
        </a>{" "}
        · FX by{" "}
        <a className="underline underline-offset-4" href="https://frankfurter.dev/" target="_blank" rel="noopener noreferrer">
          Frankfurter
        </a>{" "}
        (ECB)
      </footer>
      <MobileNav />
      <QuickAdd
        categories={{ expense: formCategories("expense"), income: formCategories("income") }}
        accounts={accounts}
        suggestions={suggestions}
        defaults={{ expense: defaults(lastExpense), income: defaults(lastIncome) }}
      />
      <CommandMenu />
    </Shell>
  );
}
