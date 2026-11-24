"use client";

import { ErrorState } from "../../_components/error-state";
import { AdminHeader } from "../../_components/shell";

/** The Overview renders its own header, so its error state does too (other pages get the shared one). */
export default function OverviewError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <>
      <AdminHeader wide />
      <main id="main-content" className="mx-auto mb-safe flex w-full max-w-screen-2xl flex-1 flex-col px-4 py-8">
        <ErrorState error={error} retry={retry} />
      </main>
    </>
  );
}
