import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, BookOpenCheck } from "lucide-react";
import MobileBottomNav from "@/components/MobileBottomNav";
import QuizMathText, { InlineQuizMathText } from "@/components/QuizMathText";
import { getCurrentUser, getProfile } from "@/lib/auth";
import { translateTagLabel } from "@/lib/labels";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type WrongDetail = {
  id: string;
  user_id: string;
  question: string;
  options: string[];
  answer_index: number;
  user_answer_index: number;
  explanation: string | null;
  knowledge_point: string | null;
  difficulty: string | null;
  subject: string | null;
  question_type: string | null;
  error_type: string | null;
  error_reason: string | null;
  improvement_suggestion: string | null;
  tags: string[] | null;
  created_at: string;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

export default async function WrongDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const profile = await getProfile(user.id, supabase);
  const client = profile?.role === "admin" ? createSupabaseAdminClient() : supabase;
  const { data } = await client.from("wrong_questions").select("*").eq("id", id).maybeSingle();

  if (!data) {
    notFound();
  }

  const item = data as WrongDetail;

  if (profile?.role !== "admin" && item.user_id !== user.id) {
    notFound();
  }

  const tags = Array.from(
    new Set(
      [
        item.subject,
        item.question_type,
        item.knowledge_point,
        item.difficulty,
        item.error_type,
        ...(item.tags || [])
      ].filter(Boolean) as string[]
    )
  );

  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl px-4 py-6 pb-24 sm:px-6 lg:px-8">
      <Link href="/wrongbook" prefetch className="mb-6 inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition active:scale-[0.98]">
        <ArrowLeft className="h-4 w-4" />
        返回错题本
      </Link>

      <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-card sm:p-7">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-sm font-medium text-blue-700">
          <BookOpenCheck className="h-4 w-4" />
          错题详情
        </div>
        <h1 className="text-3xl font-semibold text-slate-950">错题记录</h1>
        <p className="mt-2 text-sm text-slate-500">生成时间：{formatDate(item.created_at)}</p>

        <div className="mt-6 rounded-3xl border border-slate-200 bg-slate-50 p-5">
          <div className="mb-2 text-sm font-semibold text-slate-500">题目</div>
          <QuizMathText as="div" text={item.question} className="font-semibold leading-7 text-slate-950" />
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-3xl border border-rose-100 bg-rose-50 p-4 text-sm text-rose-900">
            <div className="font-semibold">你的答案</div>
            <div className="mt-2">
              <span>{String.fromCharCode(65 + item.user_answer_index)}. </span>
              <InlineQuizMathText text={item.options?.[item.user_answer_index] || ""} />
            </div>
          </div>
          <div className="rounded-3xl border border-emerald-100 bg-emerald-50 p-4 text-sm text-emerald-900">
            <div className="font-semibold">正确答案</div>
            <div className="mt-2">
              <span>{String.fromCharCode(65 + item.answer_index)}. </span>
              <InlineQuizMathText text={item.options?.[item.answer_index] || ""} />
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-3xl border border-slate-200 bg-white p-4">
          <div className="mb-2 text-sm font-semibold text-slate-500">详细解析</div>
          <QuizMathText as="div" text={item.explanation || "暂无解析"} className="leading-7 text-slate-700" />
        </div>

        <div className="mt-4 rounded-3xl border border-rose-100 bg-rose-50 p-4 text-sm leading-6 text-rose-900">
          <div className="font-semibold">错因分析</div>
          <QuizMathText as="div" text={item.error_reason || "暂无错因分析"} className="mt-2" />
          {item.improvement_suggestion ? (
            <div className="mt-2">
              <span>建议：</span>
              <InlineQuizMathText text={item.improvement_suggestion} />
            </div>
          ) : null}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {tags.map((tag) => (
            <span key={tag} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
              {translateTagLabel(tag)}
            </span>
          ))}
        </div>
      </section>

      <MobileBottomNav />
    </main>
  );
}
