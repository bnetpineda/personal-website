import { cookies } from "next/headers";
import { requireAdmin } from "@/lib/auth/session";
import { getAccounts, getCategories, getLastEntryDefaults } from "@/lib/dal";
import { todayManila } from "@/lib/finance/dates";
import { PRIVACY_COOKIE } from "../_components/nav";
import { QuickAddExpense } from "../_components/quick-add-expense";
import { AdminHeader, MobileNav, Shell } from "../_components/shell";

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  await requireAdmin();
  const [cookieStore, categories, accounts, last] = await Promise.all([
    cookies(),
    getCategories("expense"),
    getAccounts(),
    getLastEntryDefaults("expense"),
  ]);

  return (
    <Shell initialPrivate={cookieStore.get(PRIVACY_COOKIE)?.value === "1"}>
      <AdminHeader />
      <main id="main-content" className="mx-auto w-full max-w-6xl flex-1 px-4 pt-8 pb-40 lg:pb-12">
        {children}
      </main>
      <footer className="mx-auto w-full max-w-6xl px-4 pb-32 font-mono text-xs text-muted-foreground lg:pb-8">
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
      <QuickAddExpense
        categories={categories.map(({ id, name, archived }) => ({ id, name, archived }))}
        accounts={accounts}
        defaults={{ occurredOn: todayManila(), categoryId: last?.categoryId, account: last?.account, currency: last?.currency }}
      />
    </Shell>
  );
}
