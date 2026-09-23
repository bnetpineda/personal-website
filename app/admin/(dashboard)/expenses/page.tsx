import { redirect } from "next/navigation";
import { isMonth } from "@/lib/finance/dates";
import { transactionsHref } from "../../_components/nav";

/** Old URL (bookmarks, installed-app shortcuts): expenses now live on Transactions. */
export default async function ExpensesPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const { month } = await searchParams;
  redirect(transactionsHref({ kind: "expense", month: isMonth(month) ? month : null }));
}
