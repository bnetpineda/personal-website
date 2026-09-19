import type { Metadata } from "next";
import { CashFlowPage } from "../../_components/cash-flow-page";

export const metadata: Metadata = {
  title: "Income",
};

export default async function IncomePage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const { month } = await searchParams;
  return <CashFlowPage kind="income" month={month} />;
}
