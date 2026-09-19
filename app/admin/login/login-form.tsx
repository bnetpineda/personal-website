"use client";

import { useActionState } from "react";
import { LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { login, type LoginState } from "../_actions/auth";

/** Uses `action` (not onSubmit) so login also works before hydration / without JS. */
export function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, {});

  return (
    <form action={action} noValidate>
      <input type="hidden" name="next" value={next ?? ""} />
      <FieldGroup>
        <Field data-invalid={state.error ? true : undefined}>
          <FieldLabel htmlFor="password">Password</FieldLabel>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            autoFocus
            disabled={pending}
            aria-invalid={Boolean(state.error)}
          />
          {state.error && <FieldError>{state.error}</FieldError>}
        </Field>
        <Button type="submit" size="lg" disabled={pending} className="w-full">
          {pending ? <Spinner /> : <LogIn />}
          {pending ? "Checking…" : "Sign in"}
        </Button>
      </FieldGroup>
    </form>
  );
}
