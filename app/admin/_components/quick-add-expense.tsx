"use client";

import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CashFlowForm, type CashFlowFormProps } from "./cash-flow-form";
import { FormSheet } from "./form";

/** Floating "+ Expense" button on small screens; opens quick-add from any admin page. */
export function QuickAddExpense(props: Omit<CashFlowFormProps, "kind" | "entry">) {
  return (
    <div className="fixed right-4 bottom-24 z-40 mb-safe lg:hidden">
      <FormSheet
        title="Add expense"
        trigger={
          <Button size="lg">
            <Plus /> Expense
          </Button>
        }
      >
        <CashFlowForm kind="expense" {...props} />
      </FormSheet>
    </div>
  );
}
