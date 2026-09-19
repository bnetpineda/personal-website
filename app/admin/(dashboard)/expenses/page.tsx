import type { Metadata } from "next";
import { CashFlowPage } from "../../_components/cash-flow-page";

export const metadata: Metadata = {
  title: "Expenses",
};

export default async function ExpensesPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const { month } = await searchParams;
  return <CashFlowPage kind="expense" month={month} />;
}
