"use client";

import { FormEvent, useEffect, useState } from "react";
import { BadgeCheck, ImagePlus, Loader2, Sparkles, UploadCloud } from "lucide-react";
import QuizCard from "@/components/QuizCard";
import ReviewCard from "@/components/ReviewCard";
import type { Quiz, WrongQuestion } from "@/types/quiz";

type UploadCardProps = {
  initialRemainingCredits: number;
  userEmail?: string | null;
};

export default function UploadCard({ initialRemainingCredits, userEmail }: UploadCardProps) {
  const [remainingCredits, setRemainingCredits] = useState(initialRemainingCredits);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [analysisText, setAnalysisText] = useState("");
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [wrongQuestions, setWrongQuestions] = useState<WrongQuestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!file) {
      setPreviewUrl("");
      return;
    }

    const nextPreview = URL.createObjectURL(file);
    setPreviewUrl(nextPreview);

    return () => URL.revokeObjectURL(nextPreview);
  }, [file]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setWrongQuestions([]);

    if (!file) {
      setError("请先选择一张题目图片。");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError("图片不能超过 5MB。");
      return;
    }

    const formData = new FormData();
    formData.append("image", file);
    setLoading(true);

    const response = await fetch("/api/analyze", {
      method: "POST",
      body: formData
    });
    const data = await response.json().catch(() => null);
    setLoading(false);

    if (!response.ok) {
      setError(data?.error || "生成 Quiz 失败，请稍后再试。");
      return;
    }

    setRemainingCredits(data.remainingCredits);
    setAnalysisText(data.analysisText);
    setQuiz(data.quiz as Quiz);
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-card sm:p-7">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-700">
              <BadgeCheck className="h-4 w-4" />
              已登录 {userEmail || ""}
            </div>
            <h1 className="text-2xl font-semibold text-slate-950 sm:text-3xl">上传题目图片生成 AI Quiz</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              支持文字题、数学题、几何图、函数图、表格和物理图。只有成功生成 Quiz 后才会扣除 1 次。
            </p>
          </div>
          <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-blue-800">
            <div className="text-sm font-medium">剩余次数</div>
            <div className="mt-1 text-3xl font-semibold">{remainingCredits}</div>
          </div>
        </div>

        {remainingCredits <= 0 ? (
          <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            次数不足，请联系管理员充值。
          </div>
        ) : null}

        <form onSubmit={handleSubmit} className="grid gap-5 lg:grid-cols-[1fr_0.9fr]">
          <label className="flex min-h-72 cursor-pointer flex-col items-center justify-center rounded-[24px] border-2 border-dashed border-blue-200 bg-blue-50/50 px-5 py-8 text-center transition hover:border-blue-300 hover:bg-blue-50">
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(event) => {
                const nextFile = event.target.files?.[0] || null;
                setFile(nextFile);
                setQuiz(null);
                setAnalysisText("");
                setWrongQuestions([]);
                setError("");
              }}
            />
            <span className="mb-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-white text-blue-600 shadow-sm">
              <ImagePlus className="h-8 w-8" />
            </span>
            <span className="text-lg font-semibold text-slate-950">{file ? file.name : "选择题目图片"}</span>
            <span className="mt-2 text-sm text-slate-500">PNG、JPG、WEBP，最大 5MB</span>
          </label>

          <div className="flex flex-col justify-between rounded-[24px] border border-slate-200 bg-slate-50 p-4">
            <div className="relative mb-4 min-h-56 overflow-hidden rounded-2xl bg-white">
              {previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={previewUrl} alt="题目图片预览" className="h-full min-h-56 w-full object-contain p-3" />
              ) : (
                <div className="flex h-full min-h-56 items-center justify-center text-slate-400">
                  <UploadCloud className="h-10 w-10" />
                </div>
              )}
            </div>

            {error ? (
              <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {error}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={loading || remainingCredits <= 0}
              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 py-3 font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
            >
              {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Sparkles className="h-5 w-5" />}
              {loading ? "正在分析并生成 Quiz" : "生成 Quiz"}
            </button>
          </div>
        </form>
      </section>

      {analysisText ? (
        <details className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-card">
          <summary className="cursor-pointer font-semibold text-slate-950">千问图片分析结果</summary>
          <p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-slate-700">{analysisText}</p>
        </details>
      ) : null}

      {quiz ? (
        <QuizCard
          quiz={quiz}
          onRequestReview={(nextWrongQuestions) => setWrongQuestions(nextWrongQuestions)}
        />
      ) : null}

      {wrongQuestions.length > 0 ? (
        <ReviewCard originalAnalysisText={analysisText} wrongQuestions={wrongQuestions} />
      ) : null}
    </div>
  );
}
