import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, CalendarDays, FileQuestion, Gauge, LogOut, Mail, UserCircle } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import MobileBottomNav from "@/components/MobileBottomNav";
import MembershipPanel from "@/components/MembershipPanel";
import { PageHeader } from "@/components/PageHeader";
import { ensureProfile, getCurrentUser } from "@/lib/auth";
import { getGenerationAllowance } from "@/lib/membership";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

async function signOut() {
  "use server";

  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/");
}

function membershipDaysLeft(expireAt?: string | null) {
  if (!expireAt) return 0;
  const diff = new Date(expireAt).getTime() - Date.now();
  return Number.isFinite(diff) ? Math.max(0, Math.ceil(diff / 86400000)) : 0;
}

export default async function MePage() {
  const { supabase, user } = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const [profile, allowance, quizCount] = await Promise.all([
    ensureProfile(user, supabase),
    getGenerationAllowance(createSupabaseAdminClient(), user.id),
    supabase
      .from("quiz_sessions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
  ]);
  const stats: Array<{
    label: string;
    value: number | string;
    Icon: LucideIcon;
    tone: string;
  }> = [
    {
      label: "会员剩余天数",
      value: allowance.membershipLevel === "free" ? "免费版" : `${membershipDaysLeft(allowance.membershipExpireAt)} 天`,
      Icon: CalendarDays,
      tone: "text-blue-700 bg-blue-50"
    },
    {
      label: "今日已使用次数",
      value: allowance.dailyUsed,
      Icon: Gauge,
      tone: "text-emerald-700 bg-emerald-50"
    },
    {
      label: "今日总次数上限",
      value: allowance.dailyLimit,
      Icon: Gauge,
      tone: "text-amber-700 bg-amber-50"
    },
    {
      label: "Quiz 记录",
      value: quizCount.count || 0,
      Icon: FileQuestion,
      tone: "text-slate-700 bg-slate-50"
    }
  ];

  return (
    <AppShell className="max-w-4xl">
      <PageHeader
        eyebrow="Profile"
        title="账号与会员"
        subtitle="管理账号信息、会员状态和使用额度。"
        Icon={UserCircle}
        actions={
          <Link href="/" className="qgyx-secondary px-4 py-2 text-sm">
            <ArrowLeft className="h-4 w-4" />
            返回首页
          </Link>
        }
      />

      <section className="rounded-[32px] border border-blue-100/80 bg-white/75 p-5 shadow-glass backdrop-blur-xl sm:p-7">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-sm font-medium text-blue-700">
          <UserCircle className="h-4 w-4" />
          我的
        </div>
        <h1 className="text-3xl font-semibold text-slate-950">账号与会员</h1>

        <div className="mt-6 rounded-3xl border border-slate-200 bg-slate-50 p-5">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium text-slate-500">
            <Mail className="h-4 w-4" />
            账号邮箱
          </div>
          <div className="font-semibold text-slate-950">{user.email}</div>
          <div className="mt-2 text-sm text-slate-500">角色：{profile.role}</div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {stats.map(({ label, value, Icon, tone }) => (
            <div key={label} className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
              <div className={`mb-4 inline-flex h-11 w-11 items-center justify-center rounded-2xl ${tone}`}>
                <Icon className="h-5 w-5" />
              </div>
              <div className="text-sm font-medium text-slate-500">{label}</div>
              <div className="mt-1 text-3xl font-semibold text-slate-950">{value}</div>
            </div>
          ))}
        </div>

        <MembershipPanel
          membershipLevel={allowance.membershipLevel}
          membershipExpireAt={allowance.membershipExpireAt}
        />

        {allowance.isBanned ? (
          <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            账户状态异常，请联系客服处理。微信：15155132939
          </div>
        ) : null}

        <form action={signOut} className="mt-6">
          <button className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-700 px-5 py-3 font-semibold text-white transition hover:bg-blue-800 sm:w-auto">
            <LogOut className="h-5 w-5" />
            退出登录
          </button>
        </form>
      </section>

      <MobileBottomNav />
    </AppShell>
  );
}
