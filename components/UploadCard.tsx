"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  BadgeCheck,
  BookOpenText,
  Check,
  Download,
  Eye,
  FileQuestion,
  FileText,
  ImagePlus,
  Layers3,
  RotateCcw,
  ScanSearch,
  Sparkles,
  Trash2,
  UploadCloud
} from "lucide-react";
import clsx from "clsx";
import MarkdownRenderer from "@/components/MarkdownRenderer";
import { LoadingSkeleton } from "@/components/LoadingSkeleton";
import QuizCard from "@/components/QuizCard";
import ReviewCard from "@/components/ReviewCard";
import { useGenerationTask } from "@/components/GenerationTaskProvider";
import { useLanguagePreference } from "@/components/LanguageSwitcher";
import type { StudyMode, StudyRecordPayload, WrongQuestion } from "@/types/quiz";

type UploadCardProps = {
  initialRemainingCredits: number;
  initialDailyRemaining?: number;
  initialDailyLimit?: number;
  initialSpeedMode?: "fast" | "slow";
  initialHasActiveMembershipBenefits?: boolean;
  initialAllowed?: boolean;
  accountMessage?: string;
  userEmail?: string | null;
};

type AllowanceSnapshot = {
  remainingCredits: number;
  dailyRemaining: number;
  dailyLimit: number;
  allowed: boolean;
  hasActiveMembershipBenefits: boolean;
  speedMode: "fast" | "slow";
};

const modeOptions: Array<{
  value: StudyMode;
  title: string;
  description: string;
  Icon: typeof FileQuestion;
}> = [
  {
    value: "quiz",
    title: "生成 Quiz",
    description: "生成交互式题目，答完自动判分、保存记录和错题。",
    Icon: FileQuestion
  },
  {
    value: "analysis",
    title: "题目解析",
    description: "只输出识别结果、答案、分步骤解析、知识点和易错点。",
    Icon: ScanSearch
  },
  {
    value: "quiz_analysis",
    title: "Quiz + 解析",
    description: "先解析原题，再生成交互式 Quiz，同时保存两类记录。",
    Icon: Layers3
  }
];

function getFileKind(file: File | null) {
  if (!file) return "none";
  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) return "pdf";
  if (file.type.startsWith("image/")) return "image";
  return "unsupported";
}

function normalizeAllowanceSnapshot(
  payload: Record<string, unknown>,
  fallback: AllowanceSnapshot
): AllowanceSnapshot {
  const dailyRemaining =
    typeof payload.dailyRemaining === "number"
      ? payload.dailyRemaining
      : typeof payload.remaining === "number"
        ? payload.remaining
        : fallback.dailyRemaining;
  const dailyLimit =
    typeof payload.dailyLimit === "number"
      ? payload.dailyLimit
      : typeof payload.daily_limit === "number"
        ? payload.daily_limit
        : fallback.dailyLimit;
  const remainingCredits =
    typeof payload.remainingCredits === "number"
      ? payload.remainingCredits
      : typeof payload.creditsRemaining === "number"
        ? payload.creditsRemaining
        : fallback.remainingCredits;

  return {
    remainingCredits,
    dailyRemaining,
    dailyLimit,
    allowed: typeof payload.allowed === "boolean" ? payload.allowed : dailyRemaining > 0,
    hasActiveMembershipBenefits:
      typeof payload.hasActiveMembershipBenefits === "boolean"
        ? payload.hasActiveMembershipBenefits
        : fallback.hasActiveMembershipBenefits,
    speedMode: payload.speedMode === "slow" || payload.speed_mode === "slow" ? "slow" : "fast"
  };
}

export default function UploadCard({
  initialRemainingCredits,
  initialDailyRemaining,
  initialDailyLimit,
  initialSpeedMode = "fast",
  initialHasActiveMembershipBenefits = false,
  initialAllowed,
  accountMessage = "",
  userEmail
}: UploadCardProps) {
  const { task, tasks, startGeneration, retryGeneration, retryJob, clearTask, removeTask, updateTask, selectTask } =
    useGenerationTask();

  const [file, setFile] = useState<File | null>(null);
  const [localPreviewUrl, setLocalPreviewUrl] = useState("");
  const [studyMode, setStudyMode] = useState<StudyMode | null>(task.mode);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [exportingJobId, setExportingJobId] = useState("");
  const [deletingTaskIds, setDeletingTaskIds] = useState<Record<string, boolean>>({});
  const { language } = useLanguagePreference();
  const [allowance, setAllowance] = useState<AllowanceSnapshot>(() => ({
    remainingCredits: initialRemainingCredits,
    dailyRemaining: initialDailyRemaining ?? 0,
    dailyLimit: initialDailyLimit ?? 3,
    allowed: initialAllowed ?? (initialDailyRemaining ?? 0) > 0,
    hasActiveMembershipBenefits: initialHasActiveMembershipBenefits,
    speedMode: initialSpeedMode
  }));

  const fileKind = useMemo(() => getFileKind(file), [file]);
  const selectedMode = modeOptions.find((option) => option.value === studyMode);
  const taskUsesQuiz = task.mode === "quiz" || task.mode === "quiz_analysis";
  const quizPending = Boolean(task.analysis && taskUsesQuiz && !task.quiz && task.status === "running");
  const quizFailed = Boolean(task.analysis && taskUsesQuiz && !task.quiz && task.status === "error");

  const remainingCredits = allowance.remainingCredits;
  const dailyRemaining = allowance.dailyRemaining;
  const dailyLimit = allowance.dailyLimit;

  const canGenerate = !accountMessage && allowance.allowed;

  const previewUrl = task.previewUrl || localPreviewUrl;

  useEffect(() => {
    let cancelled = false;

    async function refreshAllowance() {
      const response = await fetch("/api/membership/allowance", { cache: "no-store" });
      const raw = await response.json().catch(() => null);
      const payload = (raw?.data || raw) as Record<string, unknown> | null;

      if (!cancelled && response.ok && payload) {
        setAllowance((current) => normalizeAllowanceSnapshot(payload, current));
      }
    }

    void refreshAllowance().catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (
      typeof task.dailyRemaining === "number" ||
      typeof task.dailyLimit === "number" ||
      typeof task.remainingCredits === "number"
    ) {
      setAllowance((current) => normalizeAllowanceSnapshot(task as unknown as Record<string, unknown>, current));
    }
  }, [task.dailyLimit, task.dailyRemaining, task.remainingCredits, task.speedMode]);

  useEffect(() => {
    if (!file || fileKind !== "image") {
      setLocalPreviewUrl("");
      return;
    }

    const nextPreview = URL.createObjectURL(file);
    setLocalPreviewUrl(nextPreview);

    return () => URL.revokeObjectURL(nextPreview);
  }, [file, fileKind]);

  useEffect(() => {
    if (task.mode) {
      setStudyMode(task.mode);
    }
  }, [task.mode]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (!file) {
      setError("请先选择题目图片或 PDF 文档。");
      return;
    }

    if (!studyMode) {
      setError("请先选择本次学习模式。");
      return;
    }

    if (!canGenerate) {
      setError(accountMessage || "今日次数已用完，请明天再试或升级会员。");
      return;
    }

    setSubmitting(true);

    try {
      await startGeneration({
        file,
        mode: studyMode,
        language
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function exportPdf(jobId: string) {
    setExportingJobId(jobId);
    setError("");

    try {
      const response = await fetch("/api/export/pdf", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ jobId })
      });

      const raw = await response.json().catch(() => null);
      const payload = raw?.data || raw;

      if (!response.ok || !payload?.base64) {
        setError(raw?.error || "PDF 导出失败，请稍后再试。");
        return;
      }

      const byteCharacters = atob(payload.base64);
      const byteNumbers = Array.from(byteCharacters, (char) => char.charCodeAt(0));
      const blob = new Blob([new Uint8Array(byteNumbers)], {
        type: payload.mimeType || "application/pdf"
      });

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = payload.filename || "qgyx-ai.pdf";
      link.click();
      URL.revokeObjectURL(url);
    } finally {
      setExportingJobId("");
    }
  }

  async function saveStudyRecord(payload: StudyRecordPayload) {
    updateTask({ recordStatus: "正在保存学习记录" });

    const response = await fetch("/api/study-records", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json().catch(() => null);
    const responsePayload = data?.data || data;

    if (response.ok) {
      updateTask({
        recordStatus: "学习记录已保存，错题本已自动更新。",
        wrongQuestions: Array.isArray(responsePayload?.wrongQuestions)
          ? (responsePayload.wrongQuestions as WrongQuestion[])
          : task.wrongQuestions
      });
      return;
    }

    updateTask({ recordStatus: "学习记录保存失败，答题结果仍保留在当前页面。" });
  }

  async function deleteTask(itemId: string, jobId: string) {
    setDeletingTaskIds((current) => ({ ...current, [itemId]: true }));

    try {
      if (jobId) {
        const response = await fetch(`/api/analysis-jobs/${encodeURIComponent(jobId)}`, {
          method: "DELETE"
        });

        if (!response.ok) {
          const raw = await response.json().catch(() => null);
          setError(raw?.error || "删除任务失败，请稍后再试。");
          setDeletingTaskIds((current) => ({ ...current, [itemId]: false }));
          return;
        }
      }

      window.setTimeout(() => removeTask(itemId), 200);
    } catch {
      setError("删除任务失败，请稍后再试。");
      setDeletingTaskIds((current) => ({ ...current, [itemId]: false }));
    }
  }

  return (
    <div className="space-y-6 pb-24 md:pb-0">
      {task.status === "running" ? (
        <div className="rounded-[28px] border border-blue-100/80 bg-white/75 px-5 py-4 text-blue-900 shadow-glass backdrop-blur-xl">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="font-semibold">任务进度</div>
              <div className="mt-1 text-sm text-blue-900/75">{task.step}</div>
            </div>
            <div className="text-2xl font-semibold">{task.progress}%</div>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/80">
            <div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${task.progress}%` }} />
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            <LoadingSkeleton className="h-3" />
            <LoadingSkeleton className="h-3" />
            <LoadingSkeleton className="h-3" />
          </div>
        </div>
      ) : null}

      <section className="overflow-hidden rounded-[32px] border border-blue-100/80 bg-white/75 shadow-glass backdrop-blur-xl">
        <div className="border-b border-blue-100/70 bg-blue-50/60 px-5 py-6 sm:px-7">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-700 ring-1 ring-emerald-100">
                <BadgeCheck className="h-4 w-4" />
                已登录 {userEmail || ""}
              </div>
              <h1 className="text-2xl font-semibold text-slate-950 sm:text-3xl">拍题学习</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                上传题目图片或文本型 PDF，先选择本次用途，再生成 Quiz、解析或组合结果。
              </p>
            </div>

            <div className="rounded-2xl border border-blue-100 bg-white px-4 py-3 text-blue-800 shadow-sm">
              <div className="text-sm font-medium">今日剩余</div>
              <div className="mt-1 text-3xl font-semibold">{Math.max(0, dailyRemaining)}</div>
              <div className="mt-1 text-xs text-blue-700/70">
                今日剩余 {Math.max(0, dailyRemaining)} / {dailyLimit} 次
              </div>
              <div className="mt-1 text-xs text-blue-700/70">
                输出语言：{language === "en" ? "English" : "中文"}
              </div>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="grid gap-5 p-5 lg:grid-cols-[1fr_0.95fr] sm:p-7">
          <label className="flex min-h-72 cursor-pointer flex-col items-center justify-center rounded-[30px] border-2 border-dashed border-blue-200 bg-blue-50/70 px-5 py-8 text-center transition-all duration-200 hover:-translate-y-0.5 hover:border-blue-300 hover:bg-blue-100/70 hover:shadow-sm">
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,application/pdf,.pdf"
              className="sr-only"
              disabled={submitting}
              onChange={(event) => {
                const nextFile = event.target.files?.[0] || null;
                clearTask();
                setFile(nextFile);
                setStudyMode(null);
                setError("");
              }}
            />
            <span className="mb-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-white text-blue-600 shadow-sm">
              {fileKind === "pdf" ? <FileText className="h-8 w-8" /> : <ImagePlus className="h-8 w-8" />}
            </span>
            <span className="text-lg font-semibold text-slate-950">
              {file ? file.name : task.file?.name || "选择图片或 PDF"}
            </span>
            <span className="mt-2 text-sm text-slate-500">JPG、PNG、WEBP 保持清晰压缩；PDF 最大 10MB</span>
          </label>

          <div className="flex flex-col rounded-[24px] border border-slate-200 bg-slate-50 p-4">
            <div className="relative mb-4 min-h-56 overflow-hidden rounded-2xl bg-white shadow-inner">
              {previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={previewUrl} alt="题目图片预览" className="h-full min-h-56 w-full object-contain p-3" />
              ) : fileKind === "pdf" || task.file?.kind === "pdf" ? (
                <div className="flex h-full min-h-56 flex-col items-center justify-center px-5 text-center text-slate-500">
                  <FileText className="mb-3 h-12 w-12 text-emerald-600" />
                  <div className="font-semibold text-slate-900">PDF 文档已选择</div>
                  <div className="mt-2 text-sm leading-6">如果是扫描版 PDF，请截图题目后以图片上传。</div>
                </div>
              ) : (
                <div className="flex h-full min-h-56 flex-col items-center justify-center text-slate-400">
                  <UploadCloud className="h-10 w-10" />
                  <span className="mt-3 text-sm">等待上传</span>
                </div>
              )}

              {task.status === "running" ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/75 backdrop-blur-sm">
                  <div className="text-sm font-semibold text-slate-900">{task.step}</div>
                </div>
              ) : null}
            </div>

            {(file || task.file) && task.status !== "success" ? (
              <div className="mb-4 rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-3 font-semibold text-slate-950">选择学习模式</div>
                <div className="grid gap-3">
                  {modeOptions.map(({ value, title, description, Icon }) => {
                    const active = studyMode === value;

                    return (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setStudyMode(value)}
                        disabled={submitting}
                        className={clsx(
                          "group flex w-full items-start gap-3 rounded-2xl border px-4 py-3 text-left transition-all duration-200 ease-out active:scale-[0.97] active:opacity-75",
                          active
                            ? "border-blue-400 bg-blue-50 shadow-[0_14px_34px_rgba(37,99,235,0.13)]"
                            : "border-slate-200 bg-white hover:border-blue-200 hover:bg-blue-50/40"
                        )}
                      >
                        <span
                          className={clsx(
                            "flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl",
                            active ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600"
                          )}
                        >
                          <Icon className="h-5 w-5" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center justify-between gap-2 font-semibold text-slate-950">
                            {title}
                            {active ? <Check className="h-4 w-4 text-blue-600" /> : null}
                          </span>
                          <span className="mt-1 block text-xs leading-5 text-slate-500">{description}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {task.status === "running" || task.status === "success" ? (
              <div className="mb-4 rounded-2xl border border-blue-100 bg-white p-4">
                <div className="mb-2 flex items-center justify-between text-sm font-semibold text-blue-700">
                  <span>{task.step}</span>
                  <span>{task.progress}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${task.progress}%` }} />
                </div>
              </div>
            ) : null}

            {error || task.error ? (
              <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {error || task.error}
              </div>
            ) : null}

            {accountMessage ? (
              <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                {accountMessage}
              </div>
            ) : null}

            <div className="mt-auto grid gap-3 sm:grid-cols-[1fr_auto]">
              <button
                type="submit"
                disabled={submitting || !canGenerate || !file || !studyMode}
                className="relative inline-flex w-full items-center justify-center gap-2 overflow-hidden rounded-2xl bg-blue-600 px-5 py-3 font-semibold text-white shadow-lg shadow-blue-600/20 transition-all duration-200 ease-out hover:bg-blue-700 active:scale-[0.97] active:opacity-75 disabled:cursor-not-allowed disabled:bg-blue-300 disabled:opacity-75 disabled:shadow-none"
              >
                <Sparkles className="relative h-5 w-5" />
                <span className="relative">{selectedMode ? `开始分析 · ${selectedMode.title}` : "选择模式后开始"}</span>
              </button>

              <button
                type="button"
                onClick={task.status === "error" ? () => void retryGeneration() : clearTask}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition duration-200 ease-out hover:bg-slate-50 active:scale-[0.97] active:opacity-75"
              >
                {task.status === "error" ? <RotateCcw className="h-4 w-4" /> : <Trash2 className="h-4 w-4" />}
                {task.status === "error" ? "重试" : "清除"}
              </button>
            </div>
          </div>
        </form>
      </section>

      {tasks.length > 0 ? (
        <section className="rounded-[28px] border border-slate-200 bg-white/95 p-5 shadow-[0_18px_55px_rgba(15,23,42,0.08)] backdrop-blur sm:p-7">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-sm font-semibold text-blue-700">任务中心</div>
              <h2 className="text-xl font-semibold text-slate-950">多任务生成进度</h2>
            </div>
            <div className="rounded-full bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
              {tasks.length} 个任务
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            {tasks.map((item) => {
              const active = item.id === task.id;
              const canExport = Boolean(item.jobId && item.originalExplanation);
              const deleting = Boolean(deletingTaskIds[item.id]);

              return (
                <article
                  key={item.id}
                  className={clsx(
                    "rounded-3xl border p-4 transition-all duration-200 ease-out",
                    deleting && "translate-y-2 opacity-0",
                    active
                      ? "border-blue-200 bg-blue-50/60 shadow-[0_16px_40px_rgba(37,99,235,0.12)]"
                      : "border-slate-200 bg-slate-50 hover:bg-white hover:shadow-sm",
                    item.jobStatus === "completed" && "ring-1 ring-emerald-100"
                  )}
                >
                  <div className="flex gap-3">
                    <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white bg-white text-slate-400 shadow-sm">
                      {item.previewUrl || item.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={item.previewUrl || item.imageUrl} alt="任务缩略图" className="h-full w-full object-cover" />
                      ) : (
                        <FileText className="h-8 w-8" />
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <span
                          className={clsx(
                            "rounded-full px-2.5 py-1 text-xs font-semibold",
                            item.jobStatus === "completed"
                              ? "bg-emerald-50 text-emerald-700"
                              : item.status === "error"
                                ? "bg-rose-50 text-rose-700"
                                : "bg-blue-50 text-blue-700"
                          )}
                        >
                          {item.jobStatus === "completed"
                            ? "已完成"
                            : item.status === "error" && item.analysis && !item.quiz
                              ? "Quiz 失败"
                              : item.status === "error"
                                ? "失败"
                                : "生成中"}
                        </span>
                        <span className="text-xs text-slate-500">
                          {item.createdAt ? new Date(item.createdAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }) : ""}
                        </span>
                      </div>

                      <div className="truncate font-semibold text-slate-950">{item.file?.name || item.jobId || "AI 任务"}</div>
                      <div className="mt-1 line-clamp-2 text-sm text-slate-600">{item.error || item.step}</div>

                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-white">
                        <div className="h-full rounded-full bg-blue-600 transition-all duration-500" style={{ width: `${item.progress}%` }} />
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-2 sm:grid-cols-4">
                    <button
                      type="button"
                      onClick={() => selectTask(item.id)}
                      disabled={deleting}
                      className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition duration-200 ease-out hover:bg-slate-50 active:scale-[0.97] active:opacity-75 disabled:opacity-75"
                    >
                      <Eye className="h-4 w-4" />
                      查看
                    </button>

                    <button
                      type="button"
                      disabled={item.status !== "error" || !item.jobId || deleting}
                      onClick={() => void retryJob(item.jobId)}
                      className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition duration-200 ease-out hover:bg-slate-50 active:scale-[0.97] active:opacity-75 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <RotateCcw className="h-4 w-4" />
                      重试
                    </button>

                    <button
                      type="button"
                      disabled={!canExport || exportingJobId === item.jobId || deleting}
                      onClick={() => void exportPdf(item.jobId)}
                      className="inline-flex items-center justify-center gap-2 rounded-2xl bg-blue-600 px-3 py-2 text-sm font-semibold text-white transition duration-200 ease-out hover:bg-blue-700 active:scale-[0.97] active:opacity-75 disabled:cursor-not-allowed disabled:bg-blue-300 disabled:opacity-75"
                    >
                      <Download className="h-4 w-4" />
                      PDF
                    </button>

                    <button
                      type="button"
                      disabled={deleting}
                      onClick={() => void deleteTask(item.id, item.jobId)}
                      className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition duration-200 ease-out hover:bg-slate-50 active:scale-[0.97] active:opacity-75 disabled:opacity-75"
                    >
                      <Trash2 className="h-4 w-4" />
                      删除
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ) : null}

      {task.recordStatus ? (
        <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm">
          <BookOpenText className="h-4 w-4 text-blue-600" />
          {task.recordStatus}
        </div>
      ) : null}

      {task.analysisText ? (
        <section className="rounded-[28px] border border-blue-100 bg-white/95 p-5 shadow-[0_18px_55px_rgba(15,23,42,0.08)] backdrop-blur sm:p-7">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-sm font-medium text-blue-700">
                <ScanSearch className="h-4 w-4" />
                {task.status === "running" ? "AI 正在实时解析" : "完整解析"}
              </div>
              <h2 className="mt-3 text-2xl font-semibold text-slate-950">
                {task.status === "running" ? "解析正在生成" : "原题解析"}
              </h2>
            </div>
            {task.status === "error" ? (
              <button
                type="button"
                onClick={() => void retryGeneration()}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition duration-200 ease-out hover:bg-blue-700 active:scale-[0.97] active:opacity-75"
              >
                <RotateCcw className="h-4 w-4" />
                重新生成解析
              </button>
            ) : null}
          </div>

          <div className="max-h-[720px] overflow-y-auto rounded-3xl border border-slate-200 bg-slate-50 p-4">
            <MarkdownRenderer as="div" text={task.analysisText} className="text-sm leading-7 text-slate-800" />
          </div>
        </section>
      ) : null}

      {task.analysis && !task.analysisText ? (
        <section className="rounded-[28px] border border-slate-200 bg-white/95 p-5 shadow-[0_18px_55px_rgba(15,23,42,0.08)] backdrop-blur sm:p-7">
          <div className="mb-5">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-sm font-medium text-blue-700">
              <ScanSearch className="h-4 w-4" />
              题目解析
            </div>
            <h2 className="text-2xl font-semibold text-slate-950">AI 已完成原题分析</h2>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1fr_0.8fr]">
            <div className="space-y-4">
              <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                <div className="mb-2 text-sm font-semibold text-slate-500">题目识别结果</div>
                <MarkdownRenderer as="div" text={task.analysis.recognizedText} className="text-sm leading-7 text-slate-800" />
              </div>

              <div className="rounded-3xl border border-blue-100 bg-blue-50 p-4">
                <div className="mb-2 text-sm font-semibold text-blue-700">正确答案</div>
                <MarkdownRenderer as="div" text={task.analysis.answer} className="text-sm leading-7 text-blue-950" />
              </div>

              <div className="rounded-3xl border border-slate-200 bg-white p-4">
                <div className="mb-2 text-sm font-semibold text-slate-500">分步骤解析</div>
                <MarkdownRenderer as="div" text={task.analysis.explanation} className="text-sm leading-7 text-slate-800" />
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-3xl border border-emerald-100 bg-emerald-50 p-4">
                <div className="mb-3 text-sm font-semibold text-emerald-800">涉及知识点</div>
                <div className="flex flex-wrap gap-2">
                  {task.analysis.knowledgePoints.map((point) => (
                    <span key={point} className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-emerald-800">
                      <MarkdownRenderer as="span" text={point} />
                    </span>
                  ))}
                </div>
              </div>

              <div className="rounded-3xl border border-rose-100 bg-rose-50 p-4">
                <div className="mb-3 text-sm font-semibold text-rose-800">易错点</div>
                <ul className="space-y-2 text-sm leading-6 text-rose-900/80">
                  {task.analysis.commonMistakes.map((mistake) => (
                    <li key={mistake} className="rounded-2xl bg-white/70 px-3 py-2">
                      <MarkdownRenderer as="span" text={mistake} />
                    </li>
                  ))}
                </ul>
              </div>

              <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                <div className="mb-3 text-sm font-semibold text-slate-700">类似题思路</div>
                <ul className="space-y-2 text-sm leading-6 text-slate-600">
                  {task.analysis.similarIdeas.map((idea) => (
                    <li key={idea} className="rounded-2xl bg-white px-3 py-2">
                      <MarkdownRenderer as="span" text={idea} />
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {task.quiz ? (
        <QuizCard
          quiz={task.quiz}
          jobId={task.jobId}
          sessionId={task.sessionId}
          analysisRecordId={task.analysisRecordId}
          mode={task.mode || "quiz"}
          onComplete={(payload: StudyRecordPayload) => void saveStudyRecord(payload)}
          onRequestReview={(nextWrongQuestions: WrongQuestion[]) => updateTask({ wrongQuestions: nextWrongQuestions })}
          onProgressChange={(answers, finished, wrongQuestions) =>
            updateTask({
              answers,
              finished,
              wrongQuestions
            })
          }
        />
      ) : null}

      {quizPending ? (
        <section className="rounded-[28px] border border-blue-100 bg-white/95 p-5 shadow-[0_18px_55px_rgba(15,23,42,0.08)] backdrop-blur sm:p-7">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-sm font-medium text-blue-700">
                <Sparkles className="h-4 w-4" />
                Quiz 正在后台生成
              </div>
              <div className="mt-3 text-sm leading-6 text-slate-600">原题解析已可查看，练习题生成完成后会自动显示。</div>
            </div>
            <div className="text-xl font-semibold text-blue-700">{task.progress}%</div>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${task.progress}%` }} />
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-4">
            <LoadingSkeleton className="h-4" />
            <LoadingSkeleton className="h-4" />
            <LoadingSkeleton className="h-4" />
            <LoadingSkeleton className="h-4" />
          </div>
        </section>
      ) : null}

      {quizFailed ? (
        <section className="rounded-[28px] border border-amber-200 bg-amber-50 p-5 text-amber-900 shadow-sm sm:p-7">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="font-semibold">Quiz 生成失败，可重试</div>
              <div className="mt-1 text-sm leading-6">{task.error || "原题解析已保留，重新生成 Quiz 不会清空当前解析。"}</div>
            </div>
            <button
              type="button"
              disabled={!task.jobId}
              onClick={() => void retryJob(task.jobId)}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-amber-600 px-4 py-3 text-sm font-semibold text-white transition duration-200 ease-out hover:bg-amber-700 active:scale-[0.97] active:opacity-75 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RotateCcw className="h-4 w-4" />
              重新生成 Quiz
            </button>
          </div>
        </section>
      ) : null}

      {task.wrongQuestions.length > 0 ? (
        <ReviewCard originalAnalysisText={task.analysisText} wrongQuestions={task.wrongQuestions} />
      ) : null}
    </div>
  );
}
