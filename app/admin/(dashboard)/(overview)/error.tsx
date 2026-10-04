"use client";

import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { AdminHeader } from "../../_components/shell";

/** The Overview renders its own header, so its error state does too (other pages get the shared one). */
export default function OverviewError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <>
      <AdminHeader wide />
      <main id="main-content" className="mx-auto mb-safe flex w-full max-w-screen-2xl flex-1 flex-col px-4 py-8">
        <Empty role="alert">
          <EmptyHeader>
            <EmptyTitle>Something broke</EmptyTitle>
            <EmptyDescription>{error.digest ? `Error ${error.digest}` : error.message}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button variant="outline" onClick={reset}>
              <RotateCcw /> Try again
            </Button>
          </EmptyContent>
        </Empty>
      </main>
    </>
  );
}
