import type { Metadata } from "next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Sign in",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string | string[]; session?: string | string[] }> }) {
  const { next, session } = await searchParams;

  return (
    <main className="flex min-h-svh items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardDescription className="font-mono text-xs tracking-wider uppercase">bnetpineda.dev / admin</CardDescription>
          <CardTitle className="text-2xl">Sign in</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {session === "ended" && <p role="status" className="text-sm text-muted-foreground">You were signed out on every device. Sign in again to continue.</p>}
          <LoginForm next={typeof next === "string" ? next : undefined} />
        </CardContent>
      </Card>
    </main>
  );
}
