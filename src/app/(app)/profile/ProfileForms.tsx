"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { Icon } from "@/components/icons";
import { fileToDataUrl } from "@/lib/image-client";
import type { ProfileState } from "./actions";

function Submit({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-gold px-5 py-2 text-sm disabled:opacity-60">
      {pending ? pendingLabel : label}
    </button>
  );
}

function Result({ state }: { state: ProfileState }) {
  if (state.error) return <p className="text-ruby text-[12px] bg-ruby/10 border border-ruby/25 rounded-lg px-3 py-2">{state.error}</p>;
  if (state.ok) return <p className="text-jade text-[12px] bg-jade/10 border border-jade/25 rounded-lg px-3 py-2">{state.ok}</p>;
  return null;
}

export function ProfileDetailsForm({
  action,
  initial,
}: {
  action: (prev: ProfileState, fd: FormData) => Promise<ProfileState>;
  initial: { name: string; email: string; avatar: string | null };
}) {
  const [state, formAction] = useFormState(action, {});
  const [avatar, setAvatar] = useState<string | null>(initial.avatar);
  const [field, setField] = useState<string>(""); // "" keep, "__clear__" remove, or data URL

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const url = await fileToDataUrl(file, 256, 0.85);
      setAvatar(url);
      setField(url);
    } finally {
      e.target.value = "";
    }
  }

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="avatar" value={field} />

      <div className="flex items-center gap-4">
        <span className="w-20 h-20 rounded-full border border-edge bg-panel-2 overflow-hidden flex items-center justify-center shrink-0">
          {avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatar} alt="" className="w-full h-full object-cover" />
          ) : (
            <span className="text-gold-soft text-xl font-semibold">
              {initial.name.split(" ").map((s) => s[0]).slice(0, 2).join("")}
            </span>
          )}
        </span>
        <div className="flex flex-col gap-1.5">
          <label className="btn-ghost px-3 py-1.5 text-[12px] cursor-pointer">
            <Icon name="export" className="w-3.5 h-3.5" /> {avatar ? "Change picture" : "Upload picture"}
            <input type="file" accept="image/*" className="hidden" onChange={pick} />
          </label>
          {avatar && (
            <button type="button" onClick={() => { setAvatar(null); setField("__clear__"); }} className="btn-ghost px-3 py-1.5 text-[12px] text-ruby/80">
              <Icon name="trash" className="w-3.5 h-3.5" /> Remove
            </button>
          )}
        </div>
      </div>

      <label className="field"><span>Full name</span>
        <input name="name" required className="input" defaultValue={initial.name} />
      </label>
      <label className="field"><span>Email (your login)</span>
        <input name="email" type="email" required className="input" defaultValue={initial.email} autoComplete="username" />
      </label>

      <Result state={state} />
      <div className="flex justify-end"><Submit label="Save changes" pendingLabel="Saving…" /></div>
    </form>
  );
}

export function PasswordForm({ action }: { action: (prev: ProfileState, fd: FormData) => Promise<ProfileState> }) {
  const [state, formAction] = useFormState(action, {});
  return (
    <form action={formAction} className="space-y-4">
      <label className="field"><span>Current password</span>
        <input name="current" type="password" required className="input" autoComplete="current-password" />
      </label>
      <label className="field"><span>New password</span>
        <input name="next" type="password" required minLength={8} className="input" placeholder="At least 8 characters" autoComplete="new-password" />
      </label>
      <label className="field"><span>Confirm new password</span>
        <input name="confirm" type="password" required minLength={8} className="input" autoComplete="new-password" />
      </label>
      <Result state={state} />
      <div className="flex justify-end"><Submit label="Change password" pendingLabel="Changing…" /></div>
    </form>
  );
}
