import { requireUser, canAccess } from "@/lib/auth";
import { getBranding } from "@/lib/branding";
import { NAV } from "@/lib/nav";
import { Sidebar, MobileNav, MobileTabBar } from "@/components/Sidebar";
import { logoutAction } from "@/app/login/actions";
import { Icon } from "@/components/icons";

const ROLE_LABEL: Record<string, string> = {
  OWNER: "Owner",
  MANAGER: "Manager",
  CASHIER: "Cashier",
  INVENTORY: "Inventory",
  ACCOUNTANT: "Accountant",
};

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const user = requireUser();
  const items = NAV.filter((i) => canAccess(user.role, i.key));
  const brand = getBranding();

  return (
    <div className="flex min-h-screen">
      <Sidebar items={items} brand={brand} />
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="sticky top-0 z-30 glass border-b border-edge no-print">
          <div className="flex items-center gap-3 px-4 sm:px-6 h-14">
            <MobileNav items={items} brand={brand} />
            <div className="lg:hidden font-display text-sm tracking-[0.14em] text-gold-grad truncate max-w-[45vw]">
              {brand.name.toUpperCase()}
            </div>
            <div className="flex-1" />
            <div className="text-right leading-tight hidden sm:block">
              <p className="text-[13px] text-white">{user.name}</p>
              <p className="text-[11px] text-gold-dim uppercase tracking-[0.14em]">{ROLE_LABEL[user.role]}</p>
            </div>
            <div className="w-9 h-9 rounded-full border border-gold/30 bg-gold/10 text-gold-soft flex items-center justify-center text-sm font-semibold">
              {user.name.split(" ").map((s) => s[0]).slice(0, 2).join("")}
            </div>
            <form action={logoutAction}>
              <button className="btn-ghost w-9 h-9" title="Sign out" aria-label="Sign out">
                <Icon name="logout" className="w-4 h-4" />
              </button>
            </form>
          </div>
        </header>
        <main className="flex-1 px-4 sm:px-6 py-6 pb-24 lg:pb-8 max-w-[1440px] w-full mx-auto">{children}</main>
      </div>
      <MobileTabBar items={items} />
    </div>
  );
}
