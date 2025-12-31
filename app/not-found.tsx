import Link from "next/link";
import { Button } from "@/components/ui/button";
import { FileQuestion } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4 text-center">
      <div className="mb-6 rounded-full bg-secondary-background p-6 border-2 border-border shadow-shadow">
        <FileQuestion className="h-12 w-12 text-main" />
      </div>
      <h1 className="mb-2 text-4xl font-heading md:text-6xl">404</h1>
      <h2 className="mb-6 text-xl font-medium md:text-2xl">Page Not Found</h2>
      <p className="mb-8 max-w-md text-foreground/80">
        Oops! The page you&apos;re looking for doesn&apos;t exist. It might have been moved or deleted.
      </p>
      <Button asChild size="lg">
        <Link href="/">Return Home</Link>
      </Button>
    </div>
  );
}
