"use client";

import { useEffect, useMemo, useState } from "react";
import { Brain, Loader2, NotebookPen, RefreshCw } from "lucide-react";
import MathText from "@/components/MathText";
import QuizCard from "@/components/QuizCard";
import type { Quiz, ReviewResult, WrongQuestion } from "@/types/quiz";

type ReviewCardProps = {
  originalAnalysisText: string;
  wrongQuestions: WrongQuestion[];
};

export default function ReviewCard({ originalAnalysisText, wrongQuestions }: ReviewCardProps) {
  const [review, setReview] = useState<ReviewResult | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setReview(null);
    setError("");
  }, [wrongQuestions]);

  const practiceQuiz = useMemo<Quiz | null>(
    () =>
      review
        ? {
            title: "相似练习",
            summary: "围绕本次错题的薄弱点继续练习。",
            sourceType: "image",
            questions: review.practiceQuestions
          }
        : null,
    [review]
  );

  async function requestReview() {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/review", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          originalAnalysisText,
          wrongQuestions
        })
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        setError(data?.error || "生成错题巩固失败，请稍后再试。");
        return;
      }

      setReview(data as ReviewResult);
    } catch {
      setError("网络或服务器异常，请稍后再试。");
    } finally {
      setLoading(false);
    }
  }

  if (wrongQuestions.length === 0) {
    return null;
  }

  return (
    <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-card sm:p-7">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1 text-sm font-medium text-amber-700">
            <Brain className="h-4 w-4" />
            错题巩固
          </div>
          <h2 className="text-2xl font-semibold text-slate-950">根据错题帮我巩固提升</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            已记录 {wrongQuestions.length} 道错题，巩固分析暂时不扣次数。
          </p>
        </div>

        <button
          type="button"
          onClick={requestReview}
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-amber-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-amber-600 disabled:cursor-not-allowed disabled:bg-amber-300"
        >
          {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <RefreshCw className="h-5 w-5" />}
          {loading ? "正在生成" : "生成巩固内容"}
        </button>
      </div>

      {error ? (
        <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      {review ? (
        <div className="mt-6 space-y-5">
          <div className="rounded-3xl border border-amber-100 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
            <span className="font-semibold">薄弱点总结：</span>
            <MathText text={review.weaknessSummary} className="ml-1" />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {review.mistakeAnalysis.map((item, index) => (
              <article key={`${item.question}-${index}`} className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                <MathText as="h3" text={item.question} className="mb-3 font-semibold leading-7 text-slate-950" />
                <div className="space-y-2 text-sm leading-6 text-slate-700">
                  <p>
                    <span className="font-semibold text-rose-700">错因：</span>
                    <MathText text={item.userMistake} className="ml-1" />
                  </p>
                  <p>
                    <span className="font-semibold text-blue-700">思路：</span>
                    <MathText text={item.correctThinking} className="ml-1" />
                  </p>
                  <p>
                    <span className="font-semibold text-emerald-700">知识点：</span>
                    <MathText text={item.keyPoint} className="ml-1" />
                  </p>
                </div>
              </article>
            ))}
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-4">
            <div className="mb-3 flex items-center gap-2 font-semibold text-slate-950">
              <NotebookPen className="h-5 w-5 text-blue-600" />
              巩固笔记
            </div>
            <ul className="space-y-2 text-sm leading-6 text-slate-700">
              {review.reviewNotes.map((note, index) => (
                <li key={`${note}-${index}`} className="rounded-2xl bg-slate-50 px-4 py-3">
                  <MathText text={note} />
                </li>
              ))}
            </ul>
          </div>

          {practiceQuiz && practiceQuiz.questions.length > 0 ? <QuizCard quiz={practiceQuiz} /> : null}
        </div>
      ) : null}
    </section>
  );
}
