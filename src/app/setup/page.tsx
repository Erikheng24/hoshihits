import { redirect } from "next/navigation";
import { needsSetup } from "@/lib/db";
import { getBranding } from "@/lib/branding";
import { createOwnerAction } from "./actions";
import { SetupForm } from "./SetupForm";

export const dynamic = "force-dynamic";

export default function SetupPage({ searchParams }: { searchParams: { email?: string } }) {
  // Once an account exists this page is closed for good.
  if (!needsSetup()) redirect("/login");
  const brand = getBranding();

  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md animate-rise">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl border border-gold/40 bg-panel shadow-gold-glow mb-5 overflow-hidden">
            {brand.logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={brand.logo} alt="" className="w-full h-full object-cover" />
            ) : (
              <svg viewBox="0 0 96 96" className="w-9 h-9" aria-hidden="true">
                <path d="M48 16l7.8 20.4L76 44l-20.2 7.6L48 72l-7.8-20.4L20 44l20.2-7.6z" fill="#D4AF37" />
              </svg>
            )}
          </div>
          <h1 className="font-display text-2xl tracking-[0.1em] text-gold-grad">{brand.name.toUpperCase()}</h1>
          <p className="text-fog text-sm mt-2">Welcome — let's create your owner account.</p>
        </div>

        <div className="card p-7">
          <SetupForm action={createOwnerAction} defaultEmail={searchParams.email} />
        </div>

        <p className="text-[12px] text-fog text-center mt-5 leading-relaxed">
          This is a one-time step. You'll be the <span className="text-gold-dim">Owner</span> with full access, and you
          can add staff logins afterwards from <span className="text-mist">Employees</span>.
        </p>
      </div>
    </main>
  );
}
