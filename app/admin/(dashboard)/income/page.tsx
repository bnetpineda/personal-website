import { redirect } from "next/navigation";
import { isMonth } from "@/lib/finance/dates";
import { transactionsHref } from "../../_components/nav";

/** Old URL (bookmarks, installed-app shortcuts): income now lives on Transactions. */
export default async function IncomePage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const { month } = await searchParams;
  redirect(transactionsHref({ kind: "income", month: isMonth(month) ? month : null }));
}
