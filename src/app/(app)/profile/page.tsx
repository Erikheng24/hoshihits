import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { shortDate } from "@/lib/format";
import { PageHeader, Card, Badge } from "@/components/ui";
import { saveProfileAction, changePasswordAction } from "./actions";
import { ProfileDetailsForm, PasswordForm } from "./ProfileForms";

export const dynamic = "force-dynamic";

const ROLE_LABEL: Record<string, string> = {
  OWNER: "Owner", MANAGER: "Manager", CASHIER: "Cashier", INVENTORY: "Inventory", ACCOUNTANT: "Accountant",
};

export default function ProfilePage() {
  const me = requireUser();
  const row = getDb()
    .prepare("SELECT name, email, avatar, role, created_at FROM users WHERE id=?")
    .get(me.id) as { name: string; email: string; avatar: string | null; role: string; created_at: string };

  return (
    <>
      <PageHeader
        title="My Profile"
        subtitle="Your name, login email, picture and password."
        actions={<Badge tone="gold">{ROLE_LABEL[row.role] ?? row.role}</Badge>}
      />

      <div className="grid lg:grid-cols-2 gap-4">
        <Card title="Details" className="p-5">
          <ProfileDetailsForm
            action={saveProfileAction}
            initial={{ name: row.name, email: row.email, avatar: row.avatar }}
          />
        </Card>

        <div className="space-y-4">
          <Card title="Password" className="p-5">
            <PasswordForm action={changePasswordAction} />
          </Card>

          <Card title="Account" className="p-5">
            <dl className="text-sm space-y-2">
              <div className="flex justify-between"><dt className="text-fog">Role</dt><dd className="text-mist">{ROLE_LABEL[row.role] ?? row.role}</dd></div>
              <div className="flex justify-between"><dt className="text-fog">Member since</dt><dd className="text-mist">{shortDate(row.created_at)}</dd></div>
            </dl>
            <p className="text-[11px] text-fog mt-3 leading-relaxed">
              Your role decides what you can see. Only an owner can change roles, from the Employees page.
            </p>
          </Card>
        </div>
      </div>
    </>
  );
}
