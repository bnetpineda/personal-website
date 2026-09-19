"use client";

import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";

export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
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
  );
}
