"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BookOpenCheck,
  CheckCircle2,
  ChevronRight,
  Circle,
  RotateCcw,
  Tags,
  XCircle
} from "lucide-react";
import clsx from "clsx";
import QuizMathText, { InlineQuizMathText } from "@/components/QuizMathText";
import type { Quiz, StudyMode, StudyRecordPayload, WrongQuestion } from "@/types/quiz";

type QuizCardProps = {
  quiz: Quiz;
  jobId?: string;
  sessionId?: string;
  analysisRecordId?: string;
  mode?: StudyMode;
  onComplete?: (payload: StudyRecordPayload) => void;
  onRequestReview?: (wrongQuestions: WrongQuestion[]) => void;
  onProgressChange?: (answers: Record<number, number>, finished: boolean, wrongQuestions: WrongQuestion[]) => void;
};

type SavedQuizState = {
  quizTitle: string;
  currentIndex: number;
  answers: Record<string, number>;
  finished: boolean;
};

function toNumberAnswerMap(input: unknown): Record<number, number> {
  if (!input || typeof input !== "object") {
    return {};
  }

  return Object.fromEntries(
    Object.entries(input as Record<string, unknown>)
      .map(([key, value]) => [Number(key), Number(value)])
      .filter(([key, value]) => Number.isInteger(key) && Number.isInteger(value))
  );
}

export default function QuizCard({
  quiz,
  jobId,
  sessionId,
  analysisRecordId,
  mode = "quiz",
  onComplete,
  onRequestReview,
  onProgressChange
}: QuizCardProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [finished, setFinished] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [answeringIndex, setAnsweringIndex] = useState<number | null>(null);
  const [answerMessages, setAnswerMessages] = useState<Record<number, string>>({});
  const [wrongExplanationMap, setWrongExplanationMap] = useState<Record<string, {
    whyWrong?: string;
    explanation?: string;
    correctMethod?: string;
    similarTip?: string;
  }>>({});
  const [explanationStatus, setExplanationStatus] = useState("");

  const persistenceKey = useMemo(() => {
    const quizSignature = `${quiz.title}:${quiz.questions.length}:${quiz.questions[0]?.question || ""}`;
    return `qgyx:quiz-state:${sessionId || quizSignature}`;
  }, [quiz.questions, quiz.title, sessionId]);

  useEffect(() => {
    setHydrated(false);

    try {
      const raw = window.localStorage.getItem(persistenceKey);

      if (raw) {
        const saved = JSON.parse(raw) as SavedQuizState;

        if (saved.quizTitle === quiz.title) {
          setCurrentIndex(Math.min(Math.max(saved.currentIndex || 0, 0), quiz.questions.length - 1));
          setAnswers(toNumberAnswerMap(saved.answers));
          setFinished(Boolean(saved.finished));
        } else {
          setCurrentIndex(0);
          setAnswers({});
          setFinished(false);
        }
      } else {
        setCurrentIndex(0);
        setAnswers({});
        setFinished(false);
      }
    } catch {
      setCurrentIndex(0);
      setAnswers({});
      setFinished(false);
    } finally {
      setHydrated(true);
    }
  }, [persistenceKey, quiz.questions.length, quiz.title]);

  const current = quiz.questions[currentIndex] || quiz.questions[0];
  const selected = answers[currentIndex];
  const hasAnswered = typeof selected === "number";
  const isCorrect = hasAnswered && selected === current.answerIndex;
  const answeredCount = Object.keys(answers).length;
  const correctCount = quiz.questions.filter((question, index) => answers[index] === question.answerIndex).length;
  const accuracy = quiz.questions.length > 0 ? Math.round((correctCount / quiz.questions.length) * 100) : 0;
  const currentTags = Array.from(
    new Set(
      [
        current.subject || quiz.subject,
        current.questionType || quiz.questionType,
        current.knowledgePoint,
        current.difficulty,
        ...(current.tags || [])
      ].filter(Boolean) as string[]
    )
  );

  const wrongQuestions = useMemo(() => {
    return quiz.questions
      .map((question, index) => {
        const userAnswerIndex = answers[index];

        if (typeof userAnswerIndex !== "number" || userAnswerIndex === question.answerIndex) {
          return null;
        }

        const tags = Array.from(
          new Set(
            [
              question.subject || quiz.subject,
              question.questionType || quiz.questionType,
              question.knowledgePoint,
              question.difficulty,
              ...(question.tags || [])
            ].filter(Boolean) as string[]
          )
        );

        return {
          ...question,
          userAnswerIndex,
          correctAnswerIndex: question.answerIndex,
          sessionId,
          subject: question.subject || quiz.subject,
          questionType: question.questionType || quiz.questionType,
          tags
        };
      })
      .filter(Boolean) as WrongQuestion[];
  }, [answers, quiz.questionType, quiz.questions, quiz.subject, sessionId]);

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    window.localStorage.setItem(
      persistenceKey,
      JSON.stringify({
        quizTitle: quiz.title,
        currentIndex,
        answers,
        finished
      })
    );
  }, [answers, currentIndex, finished, hydrated, persistenceKey, quiz.title]);

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    onProgressChange?.(answers, finished, wrongQuestions);
  }, [answers, finished, hydrated, wrongQuestions]);

  useEffect(() => {
    if (!hydrated || !sessionId) {
      return;
    }

    if (answeredCount === 0 && currentIndex === 0 && !finished) {
      return;
    }

    const timer = window.setTimeout(() => {
      void fetch("/api/quiz-records", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          sessionId,
          analysisRecordId,
          mode,
          quizTitle: quiz.title,
          questions: quiz.questions,
          answers,
          currentIndex,
          isCompleted: finished,
          questionCount: quiz.questions.length,
          correctCount,
          knowledgePoints: Array.from(new Set(quiz.questions.map((question) => question.knowledgePoint).filter(Boolean))),
          wrongQuestions,
          score: correctCount
        })
      }).catch(() => undefined);
    }, 600);

    return () => window.clearTimeout(timer);
  }, [
    analysisRecordId,
    answeredCount,
    answers,
    correctCount,
    currentIndex,
    finished,
    hydrated,
    mode,
    quiz.questions,
    quiz.title,
    sessionId,
    wrongQuestions
  ]);

  function selectAnswer(index: number) {
    if (hasAnswered || finished) return;

    setAnswers((previous) => ({
      ...previous,
      [currentIndex]: index
    }));

    if (!jobId || !current.id) {
      return;
    }

    setAnsweringIndex(currentIndex);
    void fetch("/api/quiz/answer", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        jobId,
        questionId: current.id,
        answer: String.fromCharCode(65 + index)
      })
    })
      .then((response) => response.json().catch(() => null))
      .then((raw) => {
        const payload = raw?.data || raw;
        setAnswerMessages((previous) => ({
          ...previous,
          [currentIndex]: payload?.message || (index === current.answerIndex ? "回答正确，本题不生成解析。" : "已记录，完成全部题目后可查看错题解析。")
        }));
      })
      .catch(() => {
        setAnswerMessages((previous) => ({
          ...previous,
          [currentIndex]: "答案已保存在本地，稍后会再次同步。"
        }));
      })
      .finally(() => setAnsweringIndex(null));
  }

  function buildCompletionPayload(isCompleted: boolean): StudyRecordPayload {
    return {
      sessionId,
      analysisRecordId,
      mode,
      quizTitle: quiz.title,
      questions: quiz.questions,
      answers,
      currentIndex,
      isCompleted,
      questionCount: quiz.questions.length,
      correctCount,
      knowledgePoints: Array.from(new Set(quiz.questions.map((question) => question.knowledgePoint).filter(Boolean))),
      wrongQuestions
    };
  }

  async function loadWrongExplanations() {
    if (!jobId) {
      return;
    }

    setExplanationStatus("正在生成错题解析");

    try {
      const response = await fetch(`/api/quiz/explanations?jobId=${encodeURIComponent(jobId)}`);
      const raw = await response.json().catch(() => null);
      const payload = raw?.data || raw;

      if (!response.ok) {
        setExplanationStatus(raw?.error || "错题解析暂时不可用");
        return;
      }

      setWrongExplanationMap(payload?.wrongExplanations || {});
      setExplanationStatus(payload?.message || "");
    } catch {
      setExplanationStatus("错题解析暂时不可用，请稍后重试。");
    }
  }

  function goNext() {
    if (currentIndex < quiz.questions.length - 1) {
      setCurrentIndex((previous) => previous + 1);
      return;
    }

    const payload = buildCompletionPayload(true);
    setFinished(true);
    onComplete?.(payload);

    if (wrongQuestions.length > 0) {
      onRequestReview?.(wrongQuestions);
    }

    void loadWrongExplanations();
  }

  function restartQuiz() {
    setAnswers({});
    setCurrentIndex(0);
    setFinished(false);
    window.localStorage.removeItem(persistenceKey);
  }

  return (
    <section className="overflow-hidden rounded-[32px] border border-blue-100/80 bg-white/75 shadow-glass backdrop-blur-xl">
      <div className="border-b border-blue-100/70 bg-blue-50/60 px-5 py-5 sm:px-7">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="mb-2 inline-flex rounded-full bg-white px-3 py-1 text-xs font-semibold text-blue-700 shadow-sm ring-1 ring-blue-100">
              {quiz.subject || "AI Quiz"} · {quiz.questionType || "同类型练习"}
            </div>
            <h2 className="text-xl font-semibold text-slate-950 sm:text-2xl">{quiz.title}</h2>
            <QuizMathText as="div" text={quiz.summary} className="mt-2 text-sm leading-6 text-slate-600" />
          </div>

          <div className="rounded-2xl border border-blue-100 bg-white/85 px-4 py-3 text-sm text-slate-600 shadow-sm">
            <div>进度：{Math.min(currentIndex + 1, quiz.questions.length)} / {quiz.questions.length}</div>
            <div className="mt-1">正确：{correctCount} / {answeredCount}</div>
          </div>
        </div>

        <div className="mt-5 h-2 overflow-hidden rounded-full bg-white shadow-inner">
          <div
            className="h-full rounded-full bg-blue-600 transition-all duration-500"
            style={{ width: `${((currentIndex + 1) / quiz.questions.length) * 100}%` }}
          />
        </div>
      </div>

      {!finished ? (
        <div className="space-y-4 p-5 sm:p-7">
          <div className="rounded-[28px] border border-blue-100 bg-blue-50/70 p-4 sm:p-5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="text-sm font-semibold text-slate-500">题目 {currentIndex + 1}</div>
              <div className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600 shadow-sm">
                {current.knowledgePoint || "核心知识点"}
              </div>
            </div>

            <QuizMathText as="div" text={current.question} className="text-lg font-semibold leading-8 text-slate-950" />
          </div>

          <div className="rounded-[28px] border border-blue-100 bg-white/85 p-4">
            <div className="mb-3 text-sm font-semibold text-slate-500">选项</div>
            <div className="grid gap-3">
              {current.options.map((option, index) => {
                const isSelected = selected === index;
                const isAnswer = current.answerIndex === index;

                return (
                  <button
                    key={`${option}-${index}`}
                    type="button"
                    onClick={() => selectAnswer(index)}
                    disabled={hasAnswered}
                    className={clsx(
                      "flex min-h-14 w-full items-start gap-3 rounded-2xl border bg-white px-4 py-3 text-left text-sm font-medium shadow-sm transition-all duration-200",
                      !hasAnswered && "border-slate-200 hover:-translate-y-0.5 hover:border-blue-300 hover:bg-blue-50 hover:shadow-md",
                      hasAnswered && isAnswer && "border-emerald-300 bg-emerald-50 text-emerald-800",
                      hasAnswered && isSelected && !isAnswer && "border-rose-300 bg-rose-50 text-rose-800",
                      hasAnswered && !isSelected && !isAnswer && "border-slate-200 text-slate-500"
                    )}
                  >
                    <span
                      className={clsx(
                        "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
                        !hasAnswered && "border-slate-300 text-slate-500",
                        hasAnswered && isAnswer && "border-emerald-500 bg-emerald-500 text-white",
                        hasAnswered && isSelected && !isAnswer && "border-rose-500 bg-rose-500 text-white"
                      )}
                    >
                      {String.fromCharCode(65 + index)}
                    </span>

                    <InlineQuizMathText text={option} className="leading-6" />

                    <span className="ml-auto shrink-0">
                      {hasAnswered && isAnswer ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : null}
                      {hasAnswered && isSelected && !isAnswer ? <XCircle className="h-5 w-5 text-rose-600" /> : null}
                      {!hasAnswered ? <Circle className="h-5 w-5 text-slate-300" /> : null}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1fr_0.72fr]">
            {hasAnswered ? (
              <div
                className={clsx(
                  "rounded-3xl border px-4 py-4 text-sm leading-7 transition-all duration-300",
                  isCorrect ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-800"
                )}
              >
                <div className="mb-1 font-semibold">{isCorrect ? "回答正确" : "回答错误"}</div>
                <QuizMathText
                  as="div"
                  text={
                    answerMessages[currentIndex] ||
                    current.explanation ||
                    (isCorrect ? "答对了，本题不生成解析。" : "错题解析将在完成全部题目后展示。")
                  }
                />
                {answeringIndex === currentIndex ? (
                  <div className="mt-2 text-xs opacity-75">正在同步答案...</div>
                ) : null}
              </div>
            ) : (
              <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 px-4 py-4 text-sm leading-6 text-slate-500">
                选择一个答案后先记录结果；错题解析会在完成全部题目后展示。
              </div>
            )}

            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
                <Tags className="h-4 w-4 text-blue-600" />
                标签
              </div>
              <div className="flex flex-wrap gap-2">
                {currentTags.map((tag) => (
                  <span key={tag} className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600 shadow-sm">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={goNext}
            disabled={!hasAnswered}
            className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 py-3 font-semibold text-white shadow-lg shadow-blue-600/20 transition hover:-translate-y-0.5 hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300 disabled:shadow-none"
          >
            {currentIndex < quiz.questions.length - 1 ? "下一题" : "完成并保存记录"}
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      ) : (
        <div className="p-5 sm:p-7">
          <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-5">
            <div className="mb-2 flex items-center gap-2 text-lg font-semibold text-emerald-800">
              <CheckCircle2 className="h-6 w-6" />
              本轮练习已完成
            </div>
            <p className="text-sm leading-6 text-emerald-800">
              共 {quiz.questions.length} 题，答对 {correctCount} 题，正确率 {accuracy}%。
            </p>
            {wrongQuestions.length > 0 ? (
              <p className="mt-2 text-sm leading-6 text-emerald-800">错题已自动进入错题本，并会补充 AI 错因分析。</p>
            ) : (
              <p className="mt-2 text-sm leading-6 text-emerald-800">本轮没有错题，继续保持。</p>
            )}
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={restartQuiz}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:-translate-y-0.5 hover:bg-slate-50 hover:shadow-sm"
            >
              <RotateCcw className="h-4 w-4" />
              重练本组
            </button>
            <div className="flex items-center justify-center gap-2 rounded-2xl bg-blue-50 px-5 py-3 text-sm font-semibold text-blue-700">
              <BookOpenCheck className="h-4 w-4" />
              {wrongQuestions.length > 0 ? `${wrongQuestions.length} 道错题已记录` : "无需加入错题本"}
            </div>
          </div>

          {explanationStatus ? (
            <div className="mt-4 rounded-3xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm leading-6 text-blue-800">
              {explanationStatus}
            </div>
          ) : null}

          {Object.keys(wrongExplanationMap).length > 0 ? (
            <div className="mt-5 space-y-3">
              {quiz.questions
                .filter((question) => question.id && wrongExplanationMap[question.id])
                .map((question, index) => {
                  const explanation = wrongExplanationMap[question.id as string];

                  return (
                    <article key={question.id || index} className="rounded-3xl border border-rose-100 bg-rose-50 p-4 text-sm leading-6 text-rose-950">
                      <div className="mb-2 font-semibold">错题解析 · {question.knowledgePoint || `题目 ${index + 1}`}</div>
                      <QuizMathText as="div" text={question.question} className="mb-3 font-semibold" />
                      {explanation.whyWrong ? (
                        <div>
                          <span className="font-semibold">为什么错：</span>
                          <InlineQuizMathText text={explanation.whyWrong} className="ml-1" />
                        </div>
                      ) : null}
                      {explanation.correctMethod ? (
                        <div className="mt-2">
                          <span className="font-semibold">正确思路：</span>
                          <InlineQuizMathText text={explanation.correctMethod} className="ml-1" />
                        </div>
                      ) : null}
                      {explanation.explanation ? <QuizMathText as="div" text={explanation.explanation} className="mt-2" /> : null}
                      {explanation.similarTip ? (
                        <div className="mt-2">
                          <span className="font-semibold">迁移提醒：</span>
                          <InlineQuizMathText text={explanation.similarTip} className="ml-1" />
                        </div>
                      ) : null}
                    </article>
                  );
                })}
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
