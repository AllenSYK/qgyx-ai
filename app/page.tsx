import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, BrainCircuit, CheckCircle2, ImageUp, LayoutDashboard, LogOut, ShieldCheck, Sparkles } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import UploadCard from "@/components/UploadCard";
import { ensureProfile, ensureUserCredits, getCurrentUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

async function signOut() {
  "use server";

  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/");
}

export default async function HomePage() {
  const { supabase, user } = await getCurrentUser();
  const steps: Array<{
    title: string;
    description: string;
    Icon: LucideIcon;
  }> = [
    {
      title: "上传题目图片",
      description: "识别文字、数学题、几何图、函数图、表格和物理图",
      Icon: ImageUp
    },
    {
      title: "生成交互 Quiz",
      description: "答题后显示正确/错误状态、解析和当前得分",
      Icon: CheckCircle2
    },
    {
      title: "错题巩固提升",
      description: "总结薄弱点、错因、正确思路，并生成 3 道相似练习",
      Icon: BrainCircuit
    }
  ];

  if (user) {
    const [credits, profile] = await Promise.all([ensureUserCredits(user, supabase), ensureProfile(user, supabase)]);

    return (
      <main className="mx-auto min-h-screen w-full max-w-6xl px-4 py-5 sm:px-6 lg:px-8">
        <header className="mb-6 flex flex-col gap-4 rounded-[28px] border border-slate-200 bg-white/85 p-4 shadow-sm backdrop-blur sm:flex-row sm:items-center sm:justify-between">
          <Link href="/" className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-600 text-white">
              <Sparkles className="h-6 w-6" />
            </span>
            <span>
              <span className="block text-lg font-semibold text-slate-950">qgyx.asia</span>
              <span className="block text-sm text-slate-500">AI 图片分析 Quiz</span>
            </span>
          </Link>
          <nav className="flex flex-wrap items-center gap-2">
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              <LayoutDashboard className="h-4 w-4" />
              用户中心
            </Link>
            {profile.role === "admin" ? (
              <Link
                href="/admin"
                className="inline-flex items-center gap-2 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700 transition hover:bg-blue-100"
              >
                <ShieldCheck className="h-4 w-4" />
                管理后台
              </Link>
            ) : null}
            <form action={signOut}>
              <button className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
                <LogOut className="h-4 w-4" />
                退出
              </button>
            </form>
          </nav>
        </header>

        <UploadCard initialRemainingCredits={credits.remaining} userEmail={user.email} />
      </main>
    );
  }

  return (
    <main className="min-h-screen">
      <section className="mx-auto grid min-h-screen w-full max-w-6xl items-center gap-10 px-4 py-10 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:px-8">
        <div>
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-blue-100 bg-white px-4 py-2 text-sm font-semibold text-blue-700 shadow-sm">
            <Sparkles className="h-4 w-4" />
            qgyx.asia
          </div>
          <h1 className="max-w-3xl text-4xl font-semibold tracking-normal text-slate-950 sm:text-5xl lg:text-6xl">
            AI 图片分析 Quiz
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-600">
            上传学习题目图片，由千问 VL 识别文字、图形、表格和知识点，再由 DeepSeek 生成中文交互测验与错题巩固。
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/register"
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-blue-600 px-6 py-3 font-semibold text-white transition hover:bg-blue-700"
            >
              立即注册
              <ArrowRight className="h-5 w-5" />
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-6 py-3 font-semibold text-slate-800 transition hover:bg-slate-50"
            >
              登录
            </Link>
          </div>
        </div>

        <div className="rounded-[32px] border border-slate-200 bg-white p-5 shadow-card">
          <div className="rounded-[26px] bg-slate-50 p-5">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-slate-500">MVP 流程</div>
                <div className="mt-1 text-xl font-semibold text-slate-950">从图片到巩固练习</div>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600 text-white">
                <BrainCircuit className="h-6 w-6" />
              </div>
            </div>

            <div className="space-y-3">
              {steps.map(({ title, description, Icon }) => (
                <div key={title} className="flex gap-4 rounded-2xl border border-slate-200 bg-white p-4">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
                    <Icon className="h-5 w-5" />
                  </span>
                  <span>
                    <span className="block font-semibold text-slate-950">{title}</span>
                    <span className="mt-1 block text-sm leading-6 text-slate-600">{description}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
