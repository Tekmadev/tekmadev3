import { requireAdmin } from "@/lib/admin";
import { Sidebar } from "@/components/admin/Sidebar";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { email, name, role } = await requireAdmin();

  return (
    <div className="min-h-screen">
      <Sidebar email={email} name={name} role={role} />
      <div className="lg:pl-64">
        <main className="mx-auto w-full max-w-6xl px-5 py-8 sm:px-8 sm:py-10">{children}</main>
      </div>
    </div>
  );
}
