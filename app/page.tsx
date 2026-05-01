import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  BookOpenCheck,
  BrainCircuit,
  Camera,
  CheckCircle2,
  FileText,
  GraduationCap,
  ImageUp,
  LayoutDashboard,
  LineChart,
  LogOut,
  ShieldCheck,
  Sparkles
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { GlassCard } from "@/components/GlassCard";
import MobileBottomNav from "@/components/MobileBottomNav";
import UploadCard from "@/components/UploadCard";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { ensureProfile, ensureUserCredits, getCurrentUser } from "@/lib/auth";
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

function FeatureItem({
  title,
  description,
  Icon
}: {
  title: string;
  description: string;
  Icon: LucideIcon;
}) {
  return (
    <div className="flex gap-4 rounded-3xl border border-slate-200 bg-white/85 p-4 shadow-sm backdrop-blur">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
        <Icon className="h-5 w-5" />
      </span>
      <span>
        <span className="block font-semibold text-slate-950">{title}</span>
        <span className="mt-1 block text-sm leading-6 text-slate-600">{description}</span>
      </span>
    </div>
  );
}

export default async function HomePage() {
  const { supabase, user } = await getCurrentUser();

  const features: Array<{ title: string; description: string; Icon: LucideIcon }> = [
    {
      title: "上传后先选模式",
      description: "生成 Quiz、只看解析或 Quiz + 解析，按本次学习目标进入。",
      Icon: ImageUp
    },
    {
      title: "交互式练习",
      description: "答题后显示解析、标签和当前得分，进度刷新也能保留。",
      Icon: CheckCircle2
    },
    {
      title: "错题自动沉淀",
      description: "答错后自动进入错题本，后续在错题本里集中重练。",
      Icon: BrainCircuit
    }
  ];

  if (user) {
    const [, profile] = await Promise.all([
      ensureUserCredits(user, supabase),
      ensureProfile(user, supabase)
    ]);

    const allowance = await getGenerationAllowance(createSupabaseAdminClient(), user.id);

    return (
      <AppShell>
        <header className="mb-5 flex flex-col gap-4 rounded-[30px] border border-blue-100/80 bg-white/75 p-4 shadow-glass backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between">
          <Link href="/" className="flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-700 text-white shadow-lg shadow-blue-700/20">
              <Sparkles className="h-6 w-6" />
            </span>
            <span>
              <span className="block text-2xl font-bold text-app-text">QGYX AI</span>
              <span className="block text-sm text-app-muted">Upload your question, get instant explanation</span>
            </span>
          </Link>

          <nav className="flex flex-wrap items-center gap-2">
            <LanguageSwitcher />

            <Link
              href="/dashboard"
              prefetch
              className="qgyx-secondary px-4 py-2 text-sm"
            >
              <LayoutDashboard className="h-4 w-4" />
              用户中心
            </Link>

            {profile.role === "admin" ? (
              <Link
                href="/admin"
                prefetch
                className="qgyx-secondary px-4 py-2 text-sm"
              >
                <ShieldCheck className="h-4 w-4" />
                管理后台
              </Link>
            ) : null}

            <form action={signOut}>
              <button className="qgyx-secondary px-4 py-2 text-sm">
                <LogOut className="h-4 w-4" />
                退出
              </button>
            </form>
          </nav>
        </header>

        <GlassCard className="mb-6 overflow-hidden p-5 sm:p-7">
          <div className="grid gap-5 md:grid-cols-[1.2fr_0.8fr] md:items-center">
            <div>
              <div className="qgyx-chip mb-3">
                <GraduationCap className="h-4 w-4" />
                AI Study Assistant
              </div>
              <h2 className="text-3xl font-bold text-app-text sm:text-4xl">拍照上传题目，自动生成解析和练习</h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-app-muted">
                上传图片或 PDF 后，QGYX AI 会生成原题解析、知识点、易错点和同类练习。
              </p>
            </div>
            <div className="rounded-[28px] border border-blue-100 bg-blue-50/80 p-4">
              <div className="flex items-center gap-3">
                <span className="flex h-14 w-14 items-center justify-center rounded-3xl bg-white text-blue-700 shadow-sm">
                  <Camera className="h-7 w-7" />
                </span>
                <div>
                  <div className="text-sm font-semibold text-app-muted">今日额度</div>
                  <div className="text-3xl font-bold text-app-text">
                    {allowance.dailyRemaining} / {allowance.dailyLimit}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </GlassCard>

        <section className="mb-6 hidden gap-3 md:grid md:grid-cols-2 lg:grid-cols-4">
          {[
            { href: "/", title: "拍题生成", description: "图片生成同类型题", Icon: ImageUp },
            { href: "/", title: "PDF 生成", description: "文档总结与章节 Quiz", Icon: FileText },
            { href: "/wrongbook", title: "错题本", description: "按知识点重新练习", Icon: BookOpenCheck },
            { href: "/report", title: "学习报告", description: "趋势与提升建议", Icon: LineChart }
          ].map(({ href, title, description, Icon }) => (
            <Link
              key={title}
              href={href}
              prefetch
              className="rounded-3xl border border-slate-200 bg-white/90 p-4 shadow-sm backdrop-blur transition duration-200 ease-out hover:-translate-y-0.5 hover:shadow-card active:scale-[0.97] active:opacity-75"
            >
              <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
                <Icon className="h-5 w-5" />
              </span>
              <span className="block font-semibold text-slate-950">{title}</span>
              <span className="mt-1 block text-sm leading-6 text-slate-500">{description}</span>
            </Link>
          ))}
        </section>

        <UploadCard
          initialRemainingCredits={allowance.creditsRemaining}
          initialDailyRemaining={allowance.dailyRemaining}
          initialDailyLimit={allowance.dailyLimit}
          initialSpeedMode={allowance.speedMode}
          initialHasActiveMembershipBenefits={allowance.hasActiveMembershipBenefits}
          initialAllowed={allowance.allowed}
          accountMessage={"isBanned" in allowance && allowance.isBanned ? "账户状态异常，请联系客服处理。微信：15155132939" : ""}
          userEmail={user.email}
        />

        <MobileBottomNav />
      </AppShell>
    );
  }

  return (
    <main className="min-h-screen">
      <section className="mx-auto flex min-h-screen w-full max-w-5xl flex-col justify-center px-4 py-12 sm:px-6 lg:px-8">
        <div className="absolute right-4 top-4 sm:right-6 lg:right-8">
          <LanguageSwitcher />
        </div>

        <div className="max-w-3xl">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-blue-100 bg-white px-4 py-2 text-sm font-semibold text-blue-700 shadow-sm">
            <Sparkles className="h-4 w-4" />
            qgyx.asia
          </div>

          <h1 className="text-4xl font-semibold tracking-normal text-slate-950 sm:text-5xl lg:text-6xl">
            QGYX AI
          </h1>

          <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-600">
            Upload your question, get instant explanation
          </p>

          <div className="mt-6 rounded-[30px] border border-blue-100/80 bg-white/75 p-5 shadow-glass backdrop-blur-xl">
            <div className="qgyx-chip mb-3">AI Study Assistant</div>
            <p className="text-lg font-semibold text-app-text">拍照上传题目，自动生成解析和练习</p>
          </div>

          <div className="mt-8 grid gap-3 md:grid-cols-3">
            {features.map((feature) => (
              <FeatureItem key={feature.title} {...feature} />
            ))}
          </div>

          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/register"
              prefetch
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-blue-600 px-6 py-3 font-semibold text-white shadow-lg shadow-blue-600/20 transition duration-200 ease-out hover:-translate-y-0.5 hover:bg-blue-700 active:scale-[0.97] active:opacity-75"
            >
              立即注册
              <ArrowRight className="h-5 w-5" />
            </Link>

            <Link
              href="/login"
              prefetch
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-6 py-3 font-semibold text-slate-800 transition duration-200 ease-out hover:bg-slate-50 active:scale-[0.97] active:opacity-75"
            >
              登录
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
