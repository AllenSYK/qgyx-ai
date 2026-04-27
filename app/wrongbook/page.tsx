import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, BookOpenCheck, Filter } from "lucide-react";
import MathText from "@/components/MathText";
import MobileBottomNav from "@/components/MobileBottomNav";
import QuizCard from "@/components/QuizCard";
import { getCurrentUser } from "@/lib/auth";
import type { QuizQuestion } from "@/types/quiz";

type WrongRow = {
  id: string;
  question: string;
  options: string[];
  answer_index: number;
  user_answer_index: number;
  explanation: string;
  knowledge_point: string;
  difficulty: "easy" | "medium" | "hard";
  created_at: string;
};

export default async function WrongbookPage({
  searchParams
}: {
  searchParams?: Promise<{ knowledge?: string }>;
}) {
  const { supabase, user } = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const params = await searchParams;
  const selectedKnowledge = params?.knowledge || "";
  let query = supabase
    .from("wrong_questions")
    .select("id,question,options,answer_index,user_answer_index,explanation,knowledge_point,difficulty,created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(30);

  if (selectedKnowledge) {
    query = query.eq("knowledge_point", selectedKnowledge);
  }

  const { data } = await query;
  const wrongs = (data || []) as WrongRow[];
  const knowledgePoints = Array.from(new Set(wrongs.map((item) => item.knowledge_point).filter(Boolean)));
  const practiceQuestions: QuizQuestion[] = wrongs.slice(0, 5).map((item) => ({
    question: item.question,
    options: item.options,
    answerIndex: item.answer_index,
    explanation: item.explanation,
    knowledgePoint: item.knowledge_point || "错题知识点",
    difficulty: item.difficulty || "medium"
  }));

  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl px-4 py-6 pb-24 sm:px-6 lg:px-8">
      <Link href="/" className="mb-6 inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700">
        <ArrowLeft className="h-4 w-4" />
        返回首页
      </Link>

      <section className="mb-6 rounded-[28px] border border-slate-200 bg-white p-5 shadow-card sm:p-7">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-sm font-medium text-blue-700">
          <BookOpenCheck className="h-4 w-4" />
          错题本
        </div>
        <h1 className="text-3xl font-semibold text-slate-950">历史错题</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">展示答题后自动保存的错题，支持按知识点筛选和重新练习。</p>

        {knowledgePoints.length > 0 ? (
          <div className="mt-5 flex flex-wrap gap-2">
            <Link href="/wrongbook" className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700">
              <Filter className="h-4 w-4" />
              全部
            </Link>
            {knowledgePoints.map((point) => (
              <Link
                key={point}
                href={`/wrongbook?knowledge=${encodeURIComponent(point)}`}
                className="rounded-full bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700"
              >
                {point}
              </Link>
            ))}
          </div>
        ) : null}
      </section>

      {wrongs.length === 0 ? (
        <section className="rounded-[28px] border border-slate-200 bg-white p-8 text-center shadow-card">
          <p className="text-slate-600">暂无错题记录。完成一组练习后，错题会自动进入这里。</p>
        </section>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 lg:grid-cols-2">
            {wrongs.map((item) => (
              <article key={item.id} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-3 flex flex-wrap gap-2 text-xs font-medium">
                  <span className="rounded-full bg-blue-50 px-3 py-1 text-blue-700">{item.knowledge_point}</span>
                  <span className="rounded-full bg-rose-50 px-3 py-1 text-rose-700">你选了 {item.user_answer_index + 1}</span>
                </div>
                <MathText as="div" text={item.question} className="font-semibold leading-7 text-slate-950" />
                <MathText as="div" text={item.explanation} className="mt-3 text-sm leading-6 text-slate-600" />
              </article>
            ))}
          </div>

          {practiceQuestions.length > 0 ? (
            <QuizCard
              quiz={{
                title: "错题重新练习",
                summary: "从最近错题中抽取，用于快速回顾。",
                sourceType: "image",
                questions: practiceQuestions
              }}
            />
          ) : null}
        </div>
      )}

      <MobileBottomNav />
    </main>
  );
}
