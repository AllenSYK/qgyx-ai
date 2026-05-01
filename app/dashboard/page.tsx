import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, BookOpenCheck, Camera, Crown, FileQuestion, Gauge, LogOut, Mail, ShieldCheck, Sparkles } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { GlassCard } from "@/components/GlassCard";
import MobileBottomNav from "@/components/MobileBottomNav";
import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
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

export default async function DashboardPage() {
  const { supabase, user } = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const [profile, allowance] = await Promise.all([
    ensureProfile(user, supabase),
    getGenerationAllowance(createSupabaseAdminClient(), user.id)
  ]);
  const [quizCount, analysisCount, wrongCount] = await Promise.all([
    supabase
      .from("quiz_sessions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id),
    supabase
      .from("analysis_records")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id),
    supabase
      .from("wrong_questions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
  ]);
  const stats = [
    {
      label: "今日剩余额度",
      value: `${allowance.dailyRemaining}/${allowance.dailyLimit}`,
      Icon: Gauge,
      tone: "blue" as const,
      helper: allowance.speedMode === "slow" ? "慢速队列" : "快速通道"
    },
    {
      label: "已完成解析数",
      value: analysisCount.count || 0,
      Icon: FileQuestion,
      tone: "cyan" as const
    },
    {
      label: "错题数量",
      value: wrongCount.count || 0,
      Icon: BookOpenCheck,
      tone: "rose" as const
    },
    {
      label: "会员状态",
      value: allowance.membershipLevel === "free" ? "Free" : allowance.membershipLevel.toUpperCase(),
      Icon: Crown,
      tone: "emerald" as const,
      helper: allowance.membershipLevel === "free" ? "3 次/天" : `${membershipDaysLeft(allowance.membershipExpireAt)} 天`
    }
  ];

  return (
    <AppShell>
      <PageHeader
        eyebrow="Dashboard"
        title="用户中心"
        subtitle="今日额度、学习记录和会员状态都在这里。"
        Icon={Sparkles}
        actions={
          <>
            <Link href="/" className="qgyx-primary px-4 py-2 text-sm">
              <Camera className="h-4 w-4" />
              上传题目
            </Link>
        <form action={signOut}>
          <button className="qgyx-secondary px-4 py-2 text-sm">
            <LogOut className="h-4 w-4" />
            退出
          </button>
        </form>
          </>
        }
      />

      <GlassCard className="p-5 sm:p-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-sm font-medium text-blue-700">
              <Mail className="h-4 w-4" />
              {user.email}
            </div>
            <h1 className="text-3xl font-semibold text-slate-950">用户中心</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              查看会员状态、今日使用情况和学习记录。
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Link
              href="/me"
              prefetch
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-blue-200 bg-blue-50 px-5 py-3 font-semibold text-blue-700 transition hover:bg-blue-100 active:scale-[0.97] active:opacity-75"
            >
              开通会员 / 续费会员
              <ArrowRight className="h-5 w-5" />
            </Link>
            <Link
              href="/"
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 py-3 font-semibold text-white transition hover:bg-blue-700 active:scale-[0.97] active:opacity-75"
            >
              进入 AI Quiz
              <ArrowRight className="h-5 w-5" />
            </Link>
          </div>
        </div>

        <div className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {stats.map((item) => (
            <StatCard key={item.label} {...item} />
          ))}
        </div>

        <div className="mt-6 rounded-[30px] border-2 border-dashed border-blue-200 bg-blue-50/70 p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <span className="flex h-14 w-14 items-center justify-center rounded-3xl bg-white text-blue-700 shadow-sm">
                <Camera className="h-7 w-7" />
              </span>
              <div>
                <div className="font-bold text-app-text">上传图片或 PDF</div>
                <div className="text-sm text-app-muted">拍照上传题目，生成解析和练习。</div>
              </div>
            </div>
            <Link href="/" className="qgyx-primary">
              开始上传
              <ArrowRight className="h-5 w-5" />
            </Link>
          </div>
        </div>

        {profile.role === "admin" ? (
          <div className="mt-6">
            <Link
              href="/admin"
              className="inline-flex items-center gap-2 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-700 transition hover:bg-blue-100"
            >
              <ShieldCheck className="h-5 w-5" />
              打开管理员后台
            </Link>
          </div>
        ) : null}
      </GlassCard>
      <MobileBottomNav />
    </AppShell>
  );
}
