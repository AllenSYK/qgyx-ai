"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  BadgeCheck,
  BookOpenText,
  CheckCircle2,
  FileText,
  ImagePlus,
  Loader2,
  Sparkles,
  UploadCloud
} from "lucide-react";
import clsx from "clsx";
import MathText from "@/components/MathText";
import QuizCard from "@/components/QuizCard";
import ReviewCard from "@/components/ReviewCard";
import type { Quiz, StudyRecordPayload, WrongQuestion } from "@/types/quiz";

type UploadCardProps = {
  initialRemainingCredits: number;
  userEmail?: string | null;
};

const stages = ["正在识别题目", "正在生成同类型练习", "正在整理解析", "正在保存结果"];

function getFileKind(file: File | null) {
  if (!file) return "none";
  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) return "pdf";
  if (file.type.startsWith("image/")) return "image";
  return "unsupported";
}

export default function UploadCard({ initialRemainingCredits, userEmail }: UploadCardProps) {
  const [remainingCredits, setRemainingCredits] = useState(initialRemainingCredits);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [analysisText, setAnalysisText] = useState("");
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [sessionId, setSessionId] = useState("");
  const [wrongQuestions, setWrongQuestions] = useState<WrongQuestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeStage, setActiveStage] = useState(0);
  const [error, setError] = useState("");
  const [recordStatus, setRecordStatus] = useState("");

  const fileKind = useMemo(() => getFileKind(file), [file]);

  useEffect(() => {
    if (!file || fileKind !== "image") {
      setPreviewUrl("");
      return;
    }

    const nextPreview = URL.createObjectURL(file);
    setPreviewUrl(nextPreview);

    return () => URL.revokeObjectURL(nextPreview);
  }, [file, fileKind]);

  useEffect(() => {
    if (!loading) return;

    setActiveStage(0);
    const timer = window.setInterval(() => {
      setActiveStage((current) => Math.min(current + 1, stages.length - 1));
    }, 1800);

    return () => window.clearInterval(timer);
  }, [loading]);

  function resetGeneratedState() {
    setQuiz(null);
    setSessionId("");
    setAnalysisText("");
    setWrongQuestions([]);
    setRecordStatus("");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    resetGeneratedState();

    if (!file) {
      setError("请先选择题目图片或 PDF 文档。");
      return;
    }

    if (fileKind === "unsupported") {
      setError("当前支持 jpg、png、webp 和 pdf 文件。");
      return;
    }

    if (fileKind === "image" && file.size > 5 * 1024 * 1024) {
      setError("图片不能超过 5MB。");
      return;
    }

    if (fileKind === "pdf" && file.size > 10 * 1024 * 1024) {
      setError("PDF 不能超过 10MB。");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);

    setLoading(true);

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        body: formData
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        setError(data?.error || "生成 Quiz 失败，请稍后再试。");
        return;
      }

      setRemainingCredits(data.remainingCredits);
      setAnalysisText(data.analysisText);
      setSessionId(data.sessionId || "");
      setQuiz(data.quiz as Quiz);
    } catch {
      setError("网络或服务器异常，请稍后再试。");
    } finally {
      setLoading(false);
    }
  }

  async function saveStudyRecord(payload: StudyRecordPayload) {
    setRecordStatus("正在保存学习记录");

    const response = await fetch("/api/study-records", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    setRecordStatus(response.ok ? "学习记录已保存" : "学习记录保存失败，答题结果仍保留在当前页面");
  }

  return (
    <div
      className={clsx(
        "space-y-6 pb-24 transition-all duration-300 md:pb-0",
        loading && "opacity-[0.98]"
      )}
    >
      <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-card transition-all duration-300 sm:p-7">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-700">
              <BadgeCheck className="h-4 w-4" />
              已登录 {userEmail || ""}
            </div>
            <h1 className="text-2xl font-semibold text-slate-950 sm:text-3xl">AI 生成同类型练习</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              上传题目图片或文本型 PDF。AI 会根据原题题型、考点和解法，生成 3 道数据和条件都不同的新练习题。
            </p>
          </div>
          <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-blue-800">
            <div className="text-sm font-medium">剩余次数</div>
            <div className="mt-1 text-3xl font-semibold">{remainingCredits}</div>
          </div>
        </div>

        <div className="mb-5 grid gap-3 sm:grid-cols-2">
          <div className="rounded-3xl border border-blue-100 bg-blue-50 p-4">
            <div className="mb-2 flex items-center gap-2 font-semibold text-blue-800">
              <ImagePlus className="h-5 w-5" />
              图片出题
            </div>
            <p className="text-sm leading-6 text-blue-900/75">适合拍题、截图、几何图、函数图和物理图。</p>
          </div>
          <div className="rounded-3xl border border-emerald-100 bg-emerald-50 p-4">
            <div className="mb-2 flex items-center gap-2 font-semibold text-emerald-800">
              <FileText className="h-5 w-5" />
              PDF 出题
            </div>
            <p className="text-sm leading-6 text-emerald-900/75">支持文本型 PDF 的知识点总结、章节 Quiz 和同类型练习。</p>
          </div>
        </div>

        {remainingCredits <= 0 ? (
          <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            次数不足，请联系管理员充值。
          </div>
        ) : null}

        <form onSubmit={handleSubmit} className="grid gap-5 lg:grid-cols-[1fr_0.9fr]">
          <label className="flex min-h-72 cursor-pointer flex-col items-center justify-center rounded-[24px] border-2 border-dashed border-blue-200 bg-blue-50/50 px-5 py-8 text-center transition-all duration-300 hover:border-blue-300 hover:bg-blue-50">
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,application/pdf,.pdf"
              className="sr-only"
              disabled={loading}
              onChange={(event) => {
                const nextFile = event.target.files?.[0] || null;
                setFile(nextFile);
                resetGeneratedState();
                setError("");
              }}
            />
            <span className="mb-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-white text-blue-600 shadow-sm transition-transform duration-300">
              {fileKind === "pdf" ? <FileText className="h-8 w-8" /> : <ImagePlus className="h-8 w-8" />}
            </span>
            <span className="text-lg font-semibold text-slate-950">{file ? file.name : "选择图片或 PDF"}</span>
            <span className="mt-2 text-sm text-slate-500">JPG、PNG、WEBP 最大 5MB；PDF 最大 10MB</span>
          </label>

          <div className="flex flex-col justify-between rounded-[24px] border border-slate-200 bg-slate-50 p-4 transition-all duration-300">
            <div className="relative mb-4 min-h-56 overflow-hidden rounded-2xl bg-white">
              {previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={previewUrl} alt="题目图片预览" className="h-full min-h-56 w-full object-contain p-3" />
              ) : fileKind === "pdf" ? (
                <div className="flex h-full min-h-56 flex-col items-center justify-center px-5 text-center text-slate-500">
                  <FileText className="mb-3 h-12 w-12 text-emerald-600" />
                  <div className="font-semibold text-slate-900">PDF 文档已选择</div>
                  <div className="mt-2 text-sm leading-6">如果是扫描版 PDF，当前版本会提示改用截图上传。</div>
                </div>
              ) : (
                <div className="flex h-full min-h-56 flex-col items-center justify-center text-slate-400">
                  <UploadCloud className="h-10 w-10" />
                  <span className="mt-3 text-sm">等待上传</span>
                </div>
              )}

              {loading ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/75 backdrop-blur-sm transition-all">
                  <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-lg">
                    <Loader2 className="h-6 w-6 animate-spin" />
                  </div>
                  <div className="text-sm font-semibold text-slate-900">{stages[activeStage]}</div>
                  <div className="mt-1 text-xs text-slate-500">请稍等，正在生成结果</div>
                </div>
              ) : null}
            </div>

            {loading ? (
              <div className="mb-4 rounded-2xl border border-blue-100 bg-white p-4">
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-blue-700">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  AI 正在工作
                </div>
                <div className="space-y-2">
                  {stages.map((stage, index) => (
                    <div key={stage} className="flex items-center gap-3 text-sm">
                      <span
                        className={clsx(
                          "flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold transition-all duration-300",
                          index < activeStage && "bg-emerald-100 text-emerald-700",
                          index === activeStage && "bg-blue-600 text-white shadow-sm",
                          index > activeStage && "bg-slate-100 text-slate-400"
                        )}
                      >
                        {index < activeStage ? <CheckCircle2 className="h-4 w-4" /> : index + 1}
                      </span>
                      <span className={clsx(index <= activeStage ? "text-slate-900" : "text-slate-400")}>{stage}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {error ? (
              <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {error}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={loading || remainingCredits <= 0}
              className="relative inline-flex w-full items-center justify-center gap-2 overflow-hidden rounded-2xl bg-blue-600 px-5 py-3 font-semibold text-white transition-all duration-300 hover:bg-blue-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-blue-300"
            >
              <span
                className={clsx(
                  "absolute inset-0 bg-white/20 transition-transform duration-500",
                  loading ? "translate-x-0" : "-translate-x-full"
                )}
              />
              {loading ? <Loader2 className="relative h-5 w-5 animate-spin" /> : <Sparkles className="relative h-5 w-5" />}
              <span className="relative">{loading ? stages[activeStage] : "生成同类型练习"}</span>
            </button>
          </div>
        </form>
      </section>

      {analysisText ? (
        <details className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-card transition-all duration-300">
          <summary className="cursor-pointer font-semibold text-slate-950">AI 生成说明</summary>
          <MathText as="div" text={analysisText} className="mt-4 text-sm leading-7 text-slate-700" />
        </details>
      ) : null}

      {quiz ? (
        <div className="space-y-3 animate-in fade-in duration-300">
          {recordStatus ? (
            <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
              <BookOpenText className="h-4 w-4 text-blue-600" />
              {recordStatus}
            </div>
          ) : null}
          <QuizCard
            quiz={quiz}
            sessionId={sessionId}
            onComplete={(payload: StudyRecordPayload) => void saveStudyRecord(payload)}
            onRequestReview={(nextWrongQuestions: WrongQuestion[]) => setWrongQuestions(nextWrongQuestions)}
          />
        </div>
      ) : null}

      {wrongQuestions.length > 0 ? <ReviewCard originalAnalysisText={analysisText} wrongQuestions={wrongQuestions} /> : null}
    </div>
  );
}
