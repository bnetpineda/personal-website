"use client";

import { ErrorState } from "./_components/error-state";

/**
 * Catches what the dashboard's own boundary can't: a failure in its layout (the session check, the
 * shell's data) or on the sign-in page. There is no shell here, so it stands on its own.
 */
export default function AdminRootError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <main id="main-content" className="mx-auto flex min-h-svh w-full max-w-xl flex-col justify-center px-4 py-8">
      <ErrorState error={error} retry={retry} />
    </main>
  );
}
