"use client";

import { useFormState, useFormStatus } from "react-dom";
import type { LoginState } from "./actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-gold w-full py-2.5 text-sm disabled:opacity-60">
      {pending ? "Signing in…" : "Sign in"}
    </button>
  );
}

export function LoginForm({ action }: { action: (prev: LoginState, fd: FormData) => Promise<LoginState> }) {
  const [state, formAction] = useFormState(action, {});
  return (
    <form action={formAction} className="space-y-4">
      <label className="field">
        <span>Email</span>
        <input name="email" type="email" autoComplete="username" required className="input" placeholder="you@hoshihits.com" defaultValue="owner@hoshihits.com" />
      </label>
      <label className="field">
        <span>Password</span>
        <input name="password" type="password" autoComplete="current-password" required className="input" placeholder="••••••••" />
      </label>
      {state.error && (
        <p className="text-ruby text-sm bg-ruby/10 border border-ruby/25 rounded-lg px-3 py-2 animate-fadein">{state.error}</p>
      )}
      <SubmitButton />
    </form>
  );
}
