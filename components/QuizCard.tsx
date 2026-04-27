"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, ChevronRight, Circle, XCircle } from "lucide-react";
import clsx from "clsx";
import MathText from "@/components/MathText";
import type { Quiz, StudyRecordPayload, WrongQuestion } from "@/types/quiz";

type QuizCardProps = {
  quiz: Quiz;
  sessionId?: string;
  onComplete?: (payload: StudyRecordPayload) => void;
  onRequestReview?: (wrongQuestions: WrongQuestion[]) => void;
};

export default function QuizCard({ quiz, sessionId, onComplete, onRequestReview }: QuizCardProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [finished, setFinished] = useState(false);

  const current = quiz.questions[currentIndex];
  const selected = answers[currentIndex];
  const hasAnswered = typeof selected === "number";
  const isCorrect = hasAnswered && selected === current.answerIndex;

  const wrongQuestions = useMemo(() => {
    return quiz.questions
      .map((question, index) => {
        const userAnswerIndex = answers[index];

        if (typeof userAnswerIndex !== "number" || userAnswerIndex === question.answerIndex) {
          return null;
        }

        return {
          ...question,
          userAnswerIndex,
          correctAnswerIndex: question.answerIndex,
          sessionId
        };
      })
      .filter(Boolean) as WrongQuestion[];
  }, [answers, quiz.questions, sessionId]);

  const answeredCount = Object.keys(answers).length;
  const correctCount = quiz.questions.filter((question, index) => answers[index] === question.answerIndex).length;
  const accuracy = answeredCount > 0 ? Math.round((correctCount / answeredCount) * 100) : 0;

  function selectAnswer(index: number) {
    if (hasAnswered || finished) return;

    setAnswers((previous) => ({
      ...previous,
      [currentIndex]: index
    }));
  }

  function goNext() {
    if (currentIndex < quiz.questions.length - 1) {
      setCurrentIndex((previous) => previous + 1);
      return;
    }

    const payload: StudyRecordPayload = {
      sessionId,
      quizTitle: quiz.title,
      questionCount: quiz.questions.length,
      correctCount,
      knowledgePoints: Array.from(new Set(quiz.questions.map((question) => question.knowledgePoint).filter(Boolean))),
      wrongQuestions
    };

    setFinished(true);
    onComplete?.(payload);

    if (wrongQuestions.length > 0) {
      onRequestReview?.(wrongQuestions);
    }
  }

  return (
    <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-card sm:p-7">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="mb-2 inline-flex rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
            {quiz.subject || "AI Quiz"} · {quiz.questionType || "同类型练习"}
          </div>
          <h2 className="text-xl font-semibold text-slate-950 sm:text-2xl">{quiz.title}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">{quiz.summary}</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          <div>
            进度：{Math.min(currentIndex + 1, quiz.questions.length)} / {quiz.questions.length}
          </div>
          <div className="mt-1">
            正确：{correctCount} / {answeredCount}
          </div>
        </div>
      </div>

      <div className="mb-4 h-2 overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full bg-blue-600 transition-all duration-300"
          style={{ width: `${((currentIndex + 1) / quiz.questions.length) * 100}%` }}
        />
      </div>

      {!finished ? (
        <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 sm:p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="text-sm font-semibold text-slate-500">第 {currentIndex + 1} 题</div>
            <div className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600">
              {current.knowledgePoint || "核心知识点"} · {current.difficulty || "medium"}
            </div>
          </div>

          <MathText as="div" text={current.question} className="mb-5 text-lg font-semibold leading-8 text-slate-950" />

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
                    "flex w-full items-start gap-3 rounded-2xl border bg-white px-4 py-3 text-left text-sm font-medium transition",
                    !hasAnswered && "border-slate-200 hover:border-blue-300 hover:bg-blue-50",
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

                  <MathText as="span" text={option} className="leading-6" />

                  <span className="ml-auto shrink-0">
                    {hasAnswered && isAnswer ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : null}
                    {hasAnswered && isSelected && !isAnswer ? <XCircle className="h-5 w-5 text-rose-600" /> : null}
                    {!hasAnswered ? <Circle className="h-5 w-5 text-slate-300" /> : null}
                  </span>
                </button>
              );
            })}
          </div>

          {hasAnswered ? (
            <div
              className={clsx(
                "mt-5 rounded-2xl border px-4 py-3 text-sm leading-7",
                isCorrect ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-800"
              )}
            >
              <div className="mb-1 font-semibold">{isCorrect ? "回答正确" : "回答错误"}</div>
              <MathText as="div" text={current.explanation} />
            </div>
          ) : null}

          <button
            type="button"
            onClick={goNext}
            disabled={!hasAnswered}
            className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 py-3 font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
          >
            {currentIndex < quiz.questions.length - 1 ? "下一题" : "完成并保存记录"}
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      ) : (
        <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-5">
          <div className="mb-2 flex items-center gap-2 text-lg font-semibold text-emerald-800">
            <CheckCircle2 className="h-6 w-6" />
            本轮练习已完成
          </div>
          <p className="text-sm leading-6 text-emerald-800">
            共 {quiz.questions.length} 题，答对 {correctCount} 题，正确率 {accuracy}%。
          </p>
          {wrongQuestions.length > 0 ? (
            <p className="mt-2 text-sm leading-6 text-emerald-800">下方已为你生成错题巩固区域。</p>
          ) : (
            <p className="mt-2 text-sm leading-6 text-emerald-800">本轮没有错题，继续保持。</p>
          )}
        </div>
      )}
    </section>
  );
}
