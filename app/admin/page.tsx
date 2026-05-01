import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ShieldAlert } from "lucide-react";
import AdminUsersTable from "@/components/AdminUsersTable";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { requireAdminUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const { user, isAdmin } = await requireAdminUser();

  if (!user) {
    redirect("/login");
  }

  if (!isAdmin) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col justify-center px-4 py-10">
        <section className="rounded-[28px] border border-slate-200 bg-white p-8 text-center shadow-card">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-50 text-rose-600">
            <ShieldAlert className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-semibold text-slate-950">无权访问管理员后台</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">只有 profiles.role = admin 的账号可以访问。</p>
          <Link
            href="/dashboard"
            className="mt-6 inline-flex items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 py-3 font-semibold text-white transition hover:bg-blue-700"
          >
            <ArrowLeft className="h-5 w-5" />
            返回用户中心
          </Link>
        </section>
      </main>
    );
  }

  return (
    <AppShell wide>
      <PageHeader
        eyebrow="Admin"
        title="管理后台"
        subtitle="用户、会员、额度、订单和任务状态统一管理。"
        Icon={ShieldAlert}
        actions={
          <Link href="/dashboard" className="qgyx-secondary px-4 py-2 text-sm">
            <ArrowLeft className="h-4 w-4" />
            返回用户中心
          </Link>
        }
      />
      <AdminUsersTable />
    </AppShell>
  );
}
