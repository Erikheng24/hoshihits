import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getBranding } from "@/lib/branding";
import { needsSetup } from "@/lib/db";
import { IS_DEMO } from "@/lib/demo";
import { loginAction, enterDemoAction } from "./actions";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  if (getSession()) redirect("/dashboard");
  if (needsSetup()) redirect("/setup"); // brand-new install — create the owner first
  const brand = getBranding();
  return (
    <main className="min-h-screen flex items-center justify-center px-4">
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
          <h1 className="font-display text-3xl tracking-[0.12em] text-gold-grad">{brand.name.toUpperCase()}</h1>
          <p className="text-fog text-sm mt-2 tracking-wide">{brand.tagline}</p>
        </div>

        {IS_DEMO && (
          <div className="card p-5 mb-4 border-gold/40 bg-gold/[0.05] text-center">
            <p className="text-[11px] uppercase tracking-[0.2em] text-gold-soft mb-1">Demo / Sandbox</p>
            <p className="text-[13px] text-mist mb-3">Explore the whole system with sample data — add products, ring up a sale, place an order. Nothing here is real; it resets automatically.</p>
            <form action={enterDemoAction}>
              <button className="btn-gold w-full py-3 justify-center text-sm">Enter the demo →</button>
            </form>
          </div>
        )}

        <div className="card p-7">
          <LoginForm action={loginAction} />
        </div>

        <p className="text-[12px] text-fog text-center mt-5">
          Staff accounts are created by the owner under Employees.
        </p>
      </div>
    </main>
  );
}
