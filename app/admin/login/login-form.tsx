"use client";

import { useActionState, useEffect, useRef } from "react";
import { LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { login, type LoginState } from "../_actions/auth";

/** Uses `action` (not onSubmit) so login also works before hydration / without JS. */
export function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, {});
  const password = useRef<HTMLInputElement>(null);

  // A wrong password puts you back in the field to try again, instead of on the page.
  useEffect(() => {
    if (state.error) password.current?.focus();
  }, [state]);

  return (
    <form action={action} noValidate>
      <input type="hidden" name="next" value={next ?? ""} />
      <FieldGroup>
        <Field data-invalid={state.error ? true : undefined}>
          <FieldLabel htmlFor="password">Password</FieldLabel>
          <Input
            ref={password}
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            autoFocus
            // Read-only, not disabled, while checking: a disabled field drops keyboard focus.
            readOnly={pending}
            aria-busy={pending}
            aria-invalid={Boolean(state.error)}
            aria-describedby={state.error ? "password-error" : undefined}
          />
          {state.error && <FieldError id="password-error">{state.error}</FieldError>}
        </Field>
        <Button type="submit" size="lg" disabled={pending} className="w-full">
          {pending ? <Spinner /> : <LogIn />}
          {pending ? "Checking…" : "Sign in"}
        </Button>
      </FieldGroup>
    </form>
  );
}
