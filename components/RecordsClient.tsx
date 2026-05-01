"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { FileQuestion, Search, ScanSearch } from "lucide-react";
import DeleteRecordButton from "@/components/DeleteRecordButton";
import MarkdownRenderer from "@/components/MarkdownRenderer";
import { formatModeLabel, translateTagLabel } from "@/lib/labels";

export type QuizRecordListItem = {
  id: string;
  quiz_title: string | null;
  mode: string | null;
  questions: Array<Record<string, unknown>>;
  answers: Record<string, number> | null;
  score: number | null;
  wrong_questions: Array<Record<string, unknown>>;
  current_index: number | null;
  is_completed: boolean | null;
  created_at: string;
};

export type AnalysisRecordListItem = {
  id: string;
  recognized_text: string | null;
  answer: string | null;
  explanation?: string | null;
  knowledge_points: string[] | null;
  common_mistakes: string[] | null;
  tags?: string[] | null;
  created_at: string;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function quizSearchText(record: QuizRecordListItem) {
  return [
    record.quiz_title,
    record.mode,
    record.created_at,
    JSON.stringify(record.questions || []),
    JSON.stringify(record.wrong_questions || [])
  ]
    .join(" ")
    .toLowerCase();
}

function analysisSearchText(record: AnalysisRecordListItem) {
  return [
    record.recognized_text,
    record.answer,
    record.explanation,
    record.created_at,
    ...(record.knowledge_points || []),
    ...(record.common_mistakes || []),
    ...(record.tags || [])
  ]
    .join(" ")
    .toLowerCase();
}

export default function RecordsClient({
  quizRecords,
  analysisRecords
}: {
  quizRecords: QuizRecordListItem[];
  analysisRecords: AnalysisRecordListItem[];
}) {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const timer = window.setTimeout(() => {
      startTransition(() => setDebouncedSearch(search.trim().toLowerCase()));
    }, 180);

    return () => window.clearTimeout(timer);
  }, [search]);

  const filteredQuizRecords = useMemo(() => {
    if (!debouncedSearch) return quizRecords;
    return quizRecords.filter((record) => quizSearchText(record).includes(debouncedSearch));
  }, [debouncedSearch, quizRecords]);

  const filteredAnalysisRecords = useMemo(() => {
    if (!debouncedSearch) return analysisRecords;
    return analysisRecords.filter((record) => analysisSearchText(record).includes(debouncedSearch));
  }, [analysisRecords, debouncedSearch]);

  return (
    <div className="mt-6">
      <label className="mb-5 flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 focus-within:border-blue-400 focus-within:bg-white">
        <Search className="h-5 w-5 text-slate-400" />
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
          placeholder="搜索题目、解析、知识点、标签、模式、日期或错题总结"
        />
        {isPending ? <span className="text-xs text-blue-600">搜索中</span> : null}
      </label>

      <div className="grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
        <div>
          <div className="mb-3 flex items-center gap-2 font-semibold text-slate-950">
            <FileQuestion className="h-5 w-5 text-blue-600" />
            Quiz 记录
          </div>
          <div className="space-y-3">
            {filteredQuizRecords.length === 0 ? (
              <p className="rounded-2xl bg-slate-50 px-4 py-4 text-sm text-slate-500">暂无匹配的 Quiz 记录。</p>
            ) : (
              filteredQuizRecords.map((record) => {
                const questionCount = Array.isArray(record.questions) ? record.questions.length : 0;
                const score = record.score || 0;
                const wrongCount = Array.isArray(record.wrong_questions) ? record.wrong_questions.length : 0;
                const accuracy = questionCount > 0 ? Math.round((score / questionCount) * 100) : 0;
                const tags = Array.from(
                  new Set(
                    record.questions
                      .flatMap((question) => [question.knowledgePoint, question.difficulty, ...(Array.isArray(question.tags) ? question.tags : [])])
                      .filter(Boolean)
                      .map(String)
                  )
                ).slice(0, 4);

                return (
                  <article key={record.id} className="rounded-3xl border border-slate-200 bg-slate-50 p-4 transition hover:bg-white hover:shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <Link href={`/records/${record.id}`} prefetch className="min-w-0 flex-1 active:opacity-70">
                        <div className="mb-2 inline-flex rounded-full bg-white px-3 py-1 text-xs font-semibold text-blue-700 shadow-sm">
                          {formatModeLabel(record.mode)}
                        </div>
                        <h2 className="font-semibold text-slate-950">{record.quiz_title || "未命名 Quiz"}</h2>
                        <p className="mt-1 text-sm text-slate-500">{formatDate(record.created_at)}</p>
                      </Link>
                      <DeleteRecordButton id={record.id} kind="quiz" />
                    </div>
                    <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs font-semibold text-slate-600">
                      <span className="rounded-2xl bg-white px-3 py-2">{score}/{questionCount} 正确</span>
                      <span className="rounded-2xl bg-white px-3 py-2">正确率 {accuracy}%</span>
                      <span className="rounded-2xl bg-white px-3 py-2">{wrongCount} 道错题</span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {tags.map((tag) => (
                        <span key={tag} className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600">
                          {translateTagLabel(tag)}
                        </span>
                      ))}
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </div>

        <div>
          <div className="mb-3 flex items-center gap-2 font-semibold text-slate-950">
            <ScanSearch className="h-5 w-5 text-blue-600" />
            解析记录
          </div>
          <div className="space-y-3">
            {filteredAnalysisRecords.length === 0 ? (
              <p className="rounded-2xl bg-slate-50 px-4 py-4 text-sm text-slate-500">暂无匹配的解析记录。</p>
            ) : (
              filteredAnalysisRecords.map((record) => (
                <article key={record.id} className="rounded-3xl border border-slate-200 bg-slate-50 p-4 transition hover:bg-white hover:shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <Link href={`/records/${record.id}`} prefetch className="min-w-0 flex-1 active:opacity-70">
                      <MarkdownRenderer as="div" text={record.recognized_text || "题目解析"} className="line-clamp-2 font-semibold text-slate-950" />
                      <p className="mt-1 text-sm text-slate-500">{formatDate(record.created_at)}</p>
                    </Link>
                    <DeleteRecordButton id={record.id} kind="analysis" />
                  </div>
                  <MarkdownRenderer as="div" text={record.answer || "已保存解析结果"} className="mt-3 line-clamp-2 text-sm leading-6 text-slate-600" />
                  <div className="mt-3 flex flex-wrap gap-2">
                    {[...(record.knowledge_points || []), ...(record.tags || [])].slice(0, 4).map((point) => (
                      <span key={point} className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600">
                        {translateTagLabel(point)}
                      </span>
                    ))}
                  </div>
                </article>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
