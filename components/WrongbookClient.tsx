"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { BookOpenCheck, CalendarCheck, RotateCcw, Search, SlidersHorizontal, Sparkles, TrendingUp } from "lucide-react";
import QuizCard from "@/components/QuizCard";
import QuizMathText, { InlineQuizMathText } from "@/components/QuizMathText";
import { translateTagLabel } from "@/lib/labels";
import type { Quiz, QuizQuestion } from "@/types/quiz";

export type WrongbookItem = {
  id: string;
  question: string;
  options: string[];
  answer_index: number;
  user_answer_index: number;
  explanation: string;
  knowledge_point: string | null;
  difficulty: "easy" | "medium" | "hard" | null;
  subject: string | null;
  category?: string | null;
  question_type: string | null;
  error_type: string | null;
  error_reason: string | null;
  improvement_suggestion: string | null;
  tags: string[] | null;
  created_at: string;
};

function itemTags(item: WrongbookItem) {
  return Array.from(
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
}

function searchText(item: WrongbookItem) {
  return [
    item.question,
    item.options?.[item.answer_index],
    item.options?.[item.user_answer_index],
    item.explanation,
    item.error_reason,
    item.improvement_suggestion,
    ...itemTags(item)
  ]
    .join(" ")
    .toLowerCase();
}

function shortErrorType(item: WrongbookItem) {
  const text = `${item.error_type || ""} ${item.error_reason || ""}`;

  if (/计算|算错|符号|代数/.test(text)) return "计算错误";
  if (/概念|定义|公式|性质/.test(text)) return "概念没理解";
  if (/审题|条件|看错|漏看/.test(text)) return "审题不清";
  if (/方法|思路|不会|模型/.test(text)) return "方法不会";
  return item.error_type || "审题不清";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit"
  }).format(new Date(value));
}

function oneLineReason(item: WrongbookItem) {
  return (item.error_reason || item.improvement_suggestion || "先抓住题干条件，再按知识点重做一遍。")
    .replace(/\s+/g, " ")
    .slice(0, 32);
}

function isDueToday(item: WrongbookItem) {
  const created = new Date(item.created_at).getTime();
  if (!Number.isFinite(created)) return true;

  const days = Math.floor((Date.now() - created) / 86400000);
  return [0, 1, 3, 7, 14].includes(days) || days > 14;
}

export default function WrongbookClient({ wrongs }: { wrongs: WrongbookItem[] }) {
  const [sortMode, setSortMode] = useState<"recent" | "weak">("recent");
  const [selectedTag, setSelectedTag] = useState("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [practiceQuiz, setPracticeQuiz] = useState<Quiz | null>(null);
  const [practicingId, setPracticingId] = useState("");
  const [practiceError, setPracticeError] = useState("");
  const [, startTransition] = useTransition();

  useEffect(() => {
    const timer = window.setTimeout(() => {
      startTransition(() => setDebouncedSearch(search.trim().toLowerCase()));
    }, 180);

    return () => window.clearTimeout(timer);
  }, [search]);

  const weaknessCount = useMemo(() => {
    const map = new Map<string, number>();
    wrongs.forEach((item) => {
      const key = item.knowledge_point || "未分类";
      map.set(key, (map.get(key) || 0) + 1);
    });
    return map;
  }, [wrongs]);

  const allTags = useMemo(() => Array.from(new Set(wrongs.flatMap(itemTags))).slice(0, 24), [wrongs]);
  const todayReview = useMemo(() => wrongs.filter(isDueToday).slice(0, 5), [wrongs]);
  const weekWrongs = useMemo(() => wrongs.filter((item) => Date.now() - new Date(item.created_at).getTime() <= 7 * 86400000), [wrongs]);

  const lastWeekWrongs = useMemo(
    () =>
      wrongs.filter((item) => {
        const age = Date.now() - new Date(item.created_at).getTime();
        return age > 7 * 86400000 && age <= 14 * 86400000;
      }),
    [wrongs]
  );

  const improvementRate = useMemo(() => {
    if (lastWeekWrongs.length === 0) return weekWrongs.length > 0 ? 12 : 0;
    return Math.max(0, Math.round(((lastWeekWrongs.length - weekWrongs.length) / lastWeekWrongs.length) * 100));
  }, [lastWeekWrongs.length, weekWrongs.length]);

  const filtered = useMemo(() => {
    let next = wrongs;

    if (selectedTag) {
      next = next.filter((item) => itemTags(item).includes(selectedTag));
    }

    if (debouncedSearch) {
      next = next.filter((item) => searchText(item).includes(debouncedSearch));
    }

    if (sortMode === "weak") {
      return [...next].sort(
        (a, b) =>
          (weaknessCount.get(b.knowledge_point || "未分类") || 0) -
          (weaknessCount.get(a.knowledge_point || "未分类") || 0)
      );
    }

    return next;
  }, [debouncedSearch, selectedTag, sortMode, weaknessCount, wrongs]);

  const reviewPracticeQuestions: QuizQuestion[] = useMemo(
    () =>
      filtered.slice(0, 5).map((item) => ({
        question: item.question,
        options: item.options,
        answerIndex: item.answer_index,
        explanation: item.explanation,
        knowledgePoint: item.knowledge_point || "错题知识点",
        difficulty: item.difficulty || "medium",
        subject: item.subject || undefined,
        questionType: item.question_type || undefined,
        tags: item.tags || []
      })),
    [filtered]
  );

  async function practiceThree(item: WrongbookItem, notice = "") {
    setPracticingId(item.id);
    setPracticeError(notice);
    setPracticeQuiz(null);

    try {
      const response = await fetch("/api/wrongbook/practice", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ wrongId: item.id })
      });

      const raw = await response.json().catch(() => null);
      const payload = raw?.data || raw;

      if (response.ok && payload?.quiz) {
        setPracticeQuiz(payload.quiz as Quiz);
        return;
      }

      setPracticeError("生成失败，请稍后重试");
    } catch {
      setPracticeError("生成失败，请稍后重试");
    } finally {
      window.setTimeout(() => setPracticingId(""), 200);
    }
  }

  function confirmStart(message: string) {
    setPracticeError("");
    return window.confirm(message);
  }

  function startRecentPractice() {
    setSortMode("recent");

    const target = wrongs[0];

    if (!target) {
      setPracticeError("暂无错题可以复习");
      return;
    }

    if (!confirmStart("确认开始按最近错题复习吗？")) return;

    void practiceThree(target);
  }

  function startWeakPractice() {
    setSortMode("weak");

    const candidates = [...wrongs].sort(
      (a, b) =>
        (weaknessCount.get(b.knowledge_point || "未分类") || 0) -
        (weaknessCount.get(a.knowledge_point || "未分类") || 0)
    );

    const target = candidates[0];

    if (!target) {
      setPracticeError("暂无错题可以复习");
      return;
    }

    if (!confirmStart("确认开始按薄弱点复习吗？")) return;

    void practiceThree(target);
  }

  function practiceKnowledgePoint() {
    const candidates = filtered.length > 0 ? filtered : wrongs;
    const target =
      candidates.find((item) => item.knowledge_point || item.category || item.tags?.[0] || item.subject || item.question_type) ||
      candidates[0];

    if (!target) {
      setPracticeError("暂无可用于知识点重练的错题");
      return;
    }

    const tag = target.knowledge_point || target.tags?.[0] || target.subject || target.question_type || "";
    setSelectedTag(tag);
    setSortMode("weak");

    const notice = tag ? "" : "暂未识别到明确知识点，已为你按错题内容生成练习";
    void practiceThree(target, notice);
  }

  function startKnowledgePractice() {
    if (!confirmStart("确认开始按知识点复习吗？")) return;
    practiceKnowledgePoint();
  }

  function startTodayReview() {
    if (reviewPracticeQuestions.length === 0) {
      setPracticeError("暂无今日可复习错题");
      return;
    }

    if (!confirmStart("确认开始今日复习吗？")) return;

    setPracticeQuiz({
      title: "今日复习",
      summary: "打开就做，先把今天到点的错题过一遍。",
      sourceType: "image",
      questions: reviewPracticeQuestions.slice(0, 5)
    });
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[32px] border border-blue-100/80 bg-white/75 p-5 shadow-glass backdrop-blur-xl sm:p-7">
        <div className="grid gap-5 lg:grid-cols-[1fr_0.9fr]">
          <div>
            <h1 className="text-3xl font-semibold text-slate-950">错题本</h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              答错的题会自动整理在这里，按知识点、错因和复习时间集中巩固。
            </p>

            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <div className="rounded-3xl border border-blue-100 bg-blue-50 p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-blue-900">
                  <CalendarCheck className="h-4 w-4" />
                  今日要复习
                </div>
                <div className="mt-2 text-3xl font-semibold text-blue-950">{todayReview.length}</div>
              </div>

              <div className="rounded-3xl border border-emerald-100 bg-emerald-50 p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-emerald-900">
                  <TrendingUp className="h-4 w-4" />
                  本周进步
                </div>
                <div className="mt-2 text-3xl font-semibold text-emerald-950">{improvementRate}%</div>
              </div>

              <div className="rounded-3xl border border-amber-100 bg-amber-50 p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-amber-900">
                  <Sparkles className="h-4 w-4" />
                  已整理
                </div>
                <div className="mt-2 text-3xl font-semibold text-amber-950">{wrongs.length}</div>
              </div>
            </div>
          </div>

          <div className="rounded-[28px] border border-blue-100 bg-blue-50/80 p-4">
            <div className="mb-3 flex items-center gap-2 font-semibold text-blue-900">
              <RotateCcw className="h-5 w-5" />
              智能重练
            </div>

            <div className="grid gap-2 sm:grid-cols-3">
              <button
                type="button"
                onClick={startRecentPractice}
                disabled={Boolean(practicingId)}
                className={`min-h-12 rounded-2xl px-4 py-3 text-sm font-semibold transition duration-200 ease-out active:scale-[0.97] active:opacity-75 disabled:opacity-75 ${
                  sortMode === "recent" ? "bg-blue-600 text-white" : "bg-white text-blue-800 hover:bg-blue-100"
                }`}
              >
                最近错优先
              </button>

              <button
                type="button"
                onClick={startWeakPractice}
                disabled={Boolean(practicingId)}
                className={`min-h-12 rounded-2xl px-4 py-3 text-sm font-semibold transition duration-200 ease-out active:scale-[0.97] active:opacity-75 disabled:opacity-75 ${
                  sortMode === "weak" ? "bg-blue-600 text-white" : "bg-white text-blue-800 hover:bg-blue-100"
                }`}
              >
                薄弱点优先
              </button>

              <button
                type="button"
                onClick={startKnowledgePractice}
                disabled={Boolean(practicingId)}
                className="min-h-12 rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-blue-800 transition duration-200 ease-out hover:bg-blue-100 active:scale-[0.97] active:opacity-75 disabled:opacity-75"
              >
                按知识点重练
              </button>
            </div>

            <button
              type="button"
              onClick={startTodayReview}
              disabled={Boolean(practicingId)}
              className="mt-3 inline-flex w-full items-center justify-center rounded-2xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition duration-200 ease-out hover:bg-blue-700 active:scale-[0.97] active:opacity-75 disabled:opacity-75"
            >
              开始今日复习
            </button>
          </div>
        </div>

        {todayReview.length > 0 ? (
          <div className="mt-5 rounded-3xl border border-slate-200 bg-slate-50 p-4">
            <div className="mb-3 flex items-center gap-2 font-semibold text-slate-950">
              <BookOpenCheck className="h-5 w-5 text-blue-600" />
              今日复习清单
            </div>

            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
              {todayReview.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    if (!confirmStart("确认开始复习这道错题吗？")) return;
                    void practiceThree(item);
                  }}
                  disabled={practicingId === item.id}
                  className="rounded-2xl bg-white px-3 py-3 text-left text-sm transition duration-200 ease-out hover:bg-blue-50 active:scale-[0.97] active:opacity-75 disabled:opacity-75"
                >
                  <span className="block truncate font-semibold text-slate-950">{translateTagLabel(item.knowledge_point)}</span>
                  <span className="mt-1 block text-xs text-slate-500">{shortErrorType(item)}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <label className="mt-5 flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 focus-within:border-blue-400 focus-within:bg-white">
          <Search className="h-5 w-5 text-slate-400" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
            placeholder="搜索题目、答案、解析、错因、标签、知识点或错误类型"
          />
        </label>

        {allTags.length > 0 ? (
          <div className="mt-5">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
              <SlidersHorizontal className="h-4 w-4" />
              按标签筛选
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setSelectedTag("")}
                className={`rounded-full px-3 py-2 text-sm font-medium transition duration-200 ease-out active:scale-[0.97] active:opacity-75 ${
                  selectedTag ? "bg-slate-100 text-slate-700" : "bg-blue-600 text-white"
                }`}
              >
                全部
              </button>

              {allTags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => setSelectedTag(tag)}
                  className={`rounded-full px-3 py-2 text-sm font-medium transition duration-200 ease-out active:scale-[0.97] active:opacity-75 ${
                    selectedTag === tag ? "bg-blue-600 text-white" : "bg-blue-50 text-blue-700 hover:bg-blue-100"
                  }`}
                >
                  {translateTagLabel(tag)}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {practiceError ? (
          <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {practiceError}
          </div>
        ) : null}
      </section>

      {filtered.length === 0 ? (
        <section className="rounded-[32px] border border-blue-100/80 bg-white/75 p-8 text-center shadow-glass backdrop-blur-xl">
          <p className="text-slate-600">暂无匹配的错题记录。</p>
        </section>
      ) : (
        <>
          {practiceQuiz ? <QuizCard quiz={practiceQuiz} /> : null}

          <div className="grid gap-4 lg:grid-cols-2">
            {filtered.slice(0, 40).map((item) => (
              <article
                key={item.id}
                className="rounded-[30px] border border-blue-100/80 bg-white/75 p-5 shadow-[0_16px_42px_rgba(29,78,216,0.08)] backdrop-blur-xl transition duration-200 ease-out hover:-translate-y-0.5 hover:shadow-glass"
              >
                <Link href={`/wrongbook/${item.id}`} prefetch className="block active:opacity-70">
                  <div className="mb-3 flex flex-wrap items-center gap-2 text-xs font-medium">
                    <span className="rounded-full bg-white px-3 py-1 text-slate-600 ring-1 ring-blue-100">
                      {formatDate(item.created_at)}
                    </span>
                    <span className="rounded-full bg-blue-50 px-3 py-1 text-blue-700">
                      {translateTagLabel(item.knowledge_point)}
                    </span>
                    <span className="rounded-full bg-rose-50 px-3 py-1 text-rose-700">{shortErrorType(item)}</span>
                    <span className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-700">
                      {isDueToday(item) ? "今日复习" : "已归档"}
                    </span>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-600">
                      你选了 {String.fromCharCode(65 + item.user_answer_index)}
                    </span>
                  </div>

                  <QuizMathText as="div" text={item.question} className="font-semibold leading-7 text-slate-950" />
                </Link>

                <QuizMathText as="div" text={item.explanation} className="mt-3 text-sm leading-6 text-slate-600" />

                <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-700">
                  <div>
                    <span className="font-semibold text-rose-700">错因：</span>
                    <InlineQuizMathText text={oneLineReason(item)} className="ml-1" />
                  </div>

                  {item.improvement_suggestion ? (
                    <div>
                      <span className="font-semibold text-blue-700">建议：</span>
                      <InlineQuizMathText text={item.improvement_suggestion.slice(0, 36)} className="ml-1" />
                    </div>
                  ) : null}
                </div>

                <button
                  type="button"
                  onClick={() => {
                    if (!confirmStart("确认开始再练 3 题吗？")) return;
                    void practiceThree(item);
                  }}
                  disabled={practicingId === item.id}
                  className="mt-4 inline-flex w-full items-center justify-center rounded-2xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition duration-200 ease-out hover:bg-blue-700 active:scale-[0.97] active:opacity-75 disabled:opacity-75"
                >
                  再练 3 题
                </button>
              </article>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
