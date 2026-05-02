import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, CheckCircle2, FileQuestion, ScanSearch, XCircle } from "lucide-react";
import MathText from "@/components/MathText";
import MobileBottomNav from "@/components/MobileBottomNav";
import QuizMathText, { InlineQuizMathText } from "@/components/QuizMathText";
import { getCurrentUser, getProfile } from "@/lib/auth";
import { translateTagLabel, formatModeLabel } from "@/lib/labels";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { QuizQuestion } from "@/types/quiz";

export const dynamic = "force-dynamic";

type QuizRecordDetail = {
  id: string;
  user_id: string;
  session_id: string | null;
  quiz_title: string | null;
  mode: string | null;
  questions: QuizQuestion[];
  answers: Record<string, number> | null;
  score: number | null;
  wrong_questions: Array<Record<string, unknown>>;
  is_completed: boolean | null;
  created_at: string;
};

type AnalysisRecordDetail = {
  id: string;
  user_id: string;
  image_url: string | null;
  mode: string | null;
  recognized_text: string | null;
  answer: string | null;
  explanation: string | null;
  knowledge_points: string[] | null;
  common_mistakes: string[] | null;
  similar_ideas: string[] | null;
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

function answerLabel(index: number | undefined) {
  return typeof index === "number" ? `${String.fromCharCode(65 + index)}. ` : "";
}

function optionText(options: string[] | undefined, index: number | undefined) {
  if (!options || typeof index !== "number") return "未作答";
  return options[index] || "";
}

export default async function RecordDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const profile = await getProfile(user.id, supabase);
  const isAdmin = profile?.role === "admin";
  const client = isAdmin ? createSupabaseAdminClient() : supabase;
  const [{ data: quizRecord }, { data: analysisRecord }] = await Promise.all([
    client.from("quiz_records").select("*").eq("id", id).maybeSingle(),
    client.from("analysis_records").select("*").eq("id", id).maybeSingle()
  ]);

  if (quizRecord) {
    const record = quizRecord as QuizRecordDetail;

    if (!isAdmin && record.user_id !== user.id) {
      notFound();
    }

    const questions = Array.isArray(record.questions) ? record.questions : [];
    const answers = record.answers || {};
    const score = record.score || 0;
    const wrongs = Array.isArray(record.wrong_questions) ? record.wrong_questions : [];

    return (
      <main className="mx-auto min-h-screen w-full max-w-5xl px-4 py-6 pb-24 sm:px-6 lg:px-8">
        <Link href="/records" prefetch className="mb-6 inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition active:scale-[0.98]">
          <ArrowLeft className="h-4 w-4" />
          返回记录
        </Link>

        <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-card sm:p-7">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-sm font-medium text-blue-700">
            <FileQuestion className="h-4 w-4" />
            {formatModeLabel(record.mode)}
          </div>
          <h1 className="text-3xl font-semibold text-slate-950">{record.quiz_title || "Quiz 详情"}</h1>
          <p className="mt-2 text-sm text-slate-500">生成时间：{formatDate(record.created_at)}</p>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <div className="rounded-3xl bg-blue-50 p-4 text-blue-900">
              <div className="text-sm">得分</div>
              <div className="mt-1 text-2xl font-semibold">{score}/{questions.length}</div>
            </div>
            <div className="rounded-3xl bg-rose-50 p-4 text-rose-900">
              <div className="text-sm">错题数</div>
              <div className="mt-1 text-2xl font-semibold">{wrongs.length}</div>
            </div>
            <div className="rounded-3xl bg-slate-50 p-4 text-slate-900">
              <div className="text-sm">原图</div>
              <div className="mt-1 text-sm font-semibold">未保存原图 URL</div>
            </div>
          </div>

          <div className="mt-6 space-y-4">
            {questions.map((question, index) => {
              const userAnswerIndex = answers[String(index)];
              const isCorrect = userAnswerIndex === question.answerIndex;
              const tags = Array.from(new Set([question.subject, question.questionType, question.knowledgePoint, question.difficulty, ...(question.tags || [])].filter(Boolean) as string[]));
              const wrong = wrongs.find((item) => item.question === question.question);

              return (
                <article key={`${question.question}-${index}`} className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div className="font-semibold text-slate-950">题目 {index + 1}</div>
                    <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ${isCorrect ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
                      {isCorrect ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                      {isCorrect ? "答对" : "答错"}
                    </span>
                  </div>
                  <QuizMathText as="div" text={question.question} className="font-semibold leading-7 text-slate-950" />
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl bg-white px-4 py-3 text-sm text-slate-700">
                      <span className="font-semibold">你的答案：</span>
                      <span>{answerLabel(userAnswerIndex)}</span>
                      <InlineQuizMathText text={optionText(question.options, userAnswerIndex)} />
                    </div>
                    <div className="rounded-2xl bg-white px-4 py-3 text-sm text-slate-700">
                      <span className="font-semibold">正确答案：</span>
                      <span>{answerLabel(question.answerIndex)}</span>
                      <InlineQuizMathText text={optionText(question.options, question.answerIndex)} />
                    </div>
                  </div>
                  <div className="mt-4 rounded-2xl bg-white px-4 py-3 text-sm leading-7 text-slate-700">
                    <span className="font-semibold">详细解析：</span>
                    <QuizMathText as="div" text={question.explanation || "本题未预生成解析；新版本仅对错题按需生成解析。"} />
                  </div>
                  {wrong ? (
                    <div className="mt-4 rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm leading-6 text-rose-900">
                      <div className="font-semibold">错因分析</div>
                      <QuizMathText as="div" text={String(wrong.errorReason || wrong.error_reason || "暂无错因分析")} className="mt-1" />
                      {wrong.improvementSuggestion || wrong.improvement_suggestion ? (
                        <div className="mt-2">
                          <span>建议：</span>
                          <InlineQuizMathText text={String(wrong.improvementSuggestion || wrong.improvement_suggestion)} />
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  <div className="mt-4 flex flex-wrap gap-2">
                    {tags.map((tag) => (
                      <span key={tag} className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600">
                        {translateTagLabel(tag)}
                      </span>
                    ))}
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <MobileBottomNav />
      </main>
    );
  }

  if (analysisRecord) {
    const record = analysisRecord as AnalysisRecordDetail;

    if (!isAdmin && record.user_id !== user.id) {
      notFound();
    }

    return (
      <main className="mx-auto min-h-screen w-full max-w-5xl px-4 py-6 pb-24 sm:px-6 lg:px-8">
        <Link href="/records" prefetch className="mb-6 inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition active:scale-[0.98]">
          <ArrowLeft className="h-4 w-4" />
          返回记录
        </Link>

        <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-card sm:p-7">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-sm font-medium text-blue-700">
            <ScanSearch className="h-4 w-4" />
            题目解析
          </div>
          <h1 className="text-3xl font-semibold text-slate-950">解析详情</h1>
          <p className="mt-2 text-sm text-slate-500">生成时间：{formatDate(record.created_at)}</p>

          <div className="mt-6 space-y-4">
            {record.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={record.image_url} alt="原图" className="max-h-[420px] w-full rounded-3xl border border-slate-200 object-contain" />
            ) : null}
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
              <div className="mb-2 text-sm font-semibold text-slate-500">识别出的题目</div>
              <MathText as="div" text={record.recognized_text || "暂无识别内容"} className="leading-7 text-slate-800" />
            </div>
            <div className="rounded-3xl border border-blue-100 bg-blue-50 p-4">
              <div className="mb-2 text-sm font-semibold text-blue-700">答案</div>
              <MathText as="div" text={record.answer || "暂无答案"} className="leading-7 text-blue-950" />
            </div>
            <div className="rounded-3xl border border-slate-200 bg-white p-4">
              <div className="mb-2 text-sm font-semibold text-slate-500">分步骤解析</div>
              <MathText as="div" text={record.explanation || "暂无解析"} className="leading-7 text-slate-800" />
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-3xl border border-emerald-100 bg-emerald-50 p-4">
                <div className="mb-3 text-sm font-semibold text-emerald-800">知识点</div>
                <div className="flex flex-wrap gap-2">
                  {(record.knowledge_points || []).map((point) => (
                    <span key={point} className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-emerald-800">
                      {translateTagLabel(point)}
                    </span>
                  ))}
                </div>
              </div>
              <div className="rounded-3xl border border-rose-100 bg-rose-50 p-4">
                <div className="mb-3 text-sm font-semibold text-rose-800">易错点</div>
                <ul className="space-y-2 text-sm leading-6 text-rose-900/80">
                  {(record.common_mistakes || []).map((mistake) => (
                    <li key={mistake} className="rounded-2xl bg-white/70 px-3 py-2">
                      {translateTagLabel(mistake)}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        <MobileBottomNav />
      </main>
    );
  }

  notFound();
}
