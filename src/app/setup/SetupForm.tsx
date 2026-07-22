"use client";

import { useFormState, useFormStatus } from "react-dom";
import type { SetupState } from "./actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-gold w-full py-2.5 text-sm disabled:opacity-60">
      {pending ? "Creating…" : "Create owner account"}
    </button>
  );
}

export function SetupForm({
  action,
  defaultEmail,
}: {
  action: (prev: SetupState, fd: FormData) => Promise<SetupState>;
  defaultEmail?: string;
}) {
  const [state, formAction] = useFormState(action, {});
  return (
    <form action={formAction} className="space-y-4">
      <label className="field">
        <span>Your name</span>
        <input name="name" required className="input" placeholder="e.g. Sokheng Sorm" autoComplete="name" />
      </label>
      <label className="field">
        <span>Email (this becomes your login)</span>
        <input name="email" type="email" required className="input" defaultValue={defaultEmail} autoComplete="username" />
      </label>
      <label className="field">
        <span>Password</span>
        <input name="password" type="password" required minLength={8} className="input" placeholder="At least 8 characters" autoComplete="new-password" />
      </label>
      <label className="field">
        <span>Confirm password</span>
        <input name="confirm" type="password" required minLength={8} className="input" autoComplete="new-password" />
      </label>
      {state.error && (
        <p className="text-ruby text-sm bg-ruby/10 border border-ruby/25 rounded-lg px-3 py-2 animate-fadein">{state.error}</p>
      )}
      <SubmitButton />
    </form>
  );
}
