"use client";

import { useEffect, useMemo, useState } from "react";
import { BookOpenCheck, CheckCircle2, Circle, Target, Trophy, XCircle } from "lucide-react";
import clsx from "clsx";
import MathText from "@/components/MathText";
import type { Quiz, StudyRecordPayload, WrongQuestion } from "@/types/quiz";

type QuizCardProps = {
  quiz: Quiz;
  sessionId?: string;
  onRequestReview?: (wrongQuestions: WrongQuestion[]) => void;
  onComplete?: (payload: StudyRecordPayload) => void;
  reviewButtonLabel?: string;
};

const optionLabels = ["A", "B", "C", "D"];
const difficultyText = {
  easy: "基础",
  medium: "中等",
  hard: "提高"
};

export default function QuizCard({
  quiz,
  sessionId,
  onRequestReview,
  onComplete,
  reviewButtonLabel = "根据错题帮我巩固提升"
}: QuizCardProps) {
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [completedKey, setCompletedKey] = useState("");

  useEffect(() => {
    setAnswers({});
    setCompletedKey("");
  }, [quiz]);

  const answeredCount = Object.keys(answers).length;
  const score = useMemo(
    () =>
      quiz.questions.reduce((total, question, index) => {
        return answers[index] === question.answerIndex ? total + 1 : total;
      }, 0),
    [answers, quiz.questions]
  );
  const accuracy = quiz.questions.length > 0 ? Math.round((score / quiz.questions.length) * 100) : 0;

  const wrongQuestions = useMemo<WrongQuestion[]>(
    () =>
      quiz.questions
        .map((question, index) => ({
          ...question,
          sessionId,
          userAnswerIndex: answers[index]
        }))
        .filter((question) => question.userAnswerIndex !== undefined && question.userAnswerIndex !== question.answerIndex),
    [answers, quiz.questions, sessionId]
  );

  useEffect(() => {
    if (!onComplete || answeredCount !== quiz.questions.length || quiz.questions.length === 0) {
      return;
    }

    const key = JSON.stringify(answers);

    if (key === completedKey) {
      return;
    }

    setCompletedKey(key);
    onComplete({
      sessionId,
      quizTitle: quiz.title,
      questionCount: quiz.questions.length,
      correctCount: score,
      knowledgePoints: Array.from(new Set(quiz.questions.map((question) => question.knowledgePoint).filter(Boolean))),
      wrongQuestions
    });
  }, [answeredCount, answers, completedKey, onComplete, quiz.questions, quiz.title, score, sessionId, wrongQuestions]);

  const isComplete = answeredCount === quiz.questions.length && quiz.questions.length > 0;

  return (
    <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-card sm:p-7">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-sm font-medium text-blue-700">
            <BookOpenCheck className="h-4 w-4" />
            同类型练习
          </div>
          <h2 className="text-2xl font-semibold text-slate-950">{quiz.title}</h2>
          <MathText as="p" text={quiz.summary} className="mt-2 text-sm leading-6 text-slate-600" />
          <div className="mt-3 flex flex-wrap gap-2 text-xs font-medium text-slate-600">
            {quiz.subject ? <span className="rounded-full bg-slate-100 px-3 py-1">{quiz.subject}</span> : null}
            {quiz.questionType ? <span className="rounded-full bg-slate-100 px-3 py-1">{quiz.questionType}</span> : null}
            <span className="rounded-full bg-slate-100 px-3 py-1">{quiz.questions.length} 道新题</span>
          </div>
        </div>
        <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-blue-800">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Target className="h-4 w-4" />
            当前得分
          </div>
          <div className="mt-1 text-2xl font-semibold">
            {score}/{quiz.questions.length}
          </div>
        </div>
      </div>

      <div className="space-y-5">
        {quiz.questions.map((question, questionIndex) => {
          const selectedAnswer = answers[questionIndex];
          const hasAnswered = selectedAnswer !== undefined;
          const isWrong = hasAnswered && selectedAnswer !== question.answerIndex;

          return (
            <article
              key={`${question.question}-${questionIndex}`}
              className="rounded-3xl border border-slate-200 bg-slate-50 p-4 transition duration-200 sm:p-5"
            >
              <div className="mb-4 flex items-start gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-sm font-semibold text-blue-700 ring-1 ring-slate-200">
                  {questionIndex + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <MathText as="div" text={question.question} className="pt-1 text-base font-semibold leading-7 text-slate-950" />
                  <div className="mt-2 flex flex-wrap gap-2 text-xs font-medium">
                    <span className="rounded-full bg-white px-3 py-1 text-blue-700 ring-1 ring-blue-100">
                      {question.knowledgePoint}
                    </span>
                    <span className="rounded-full bg-white px-3 py-1 text-slate-600 ring-1 ring-slate-200">
                      {difficultyText[question.difficulty]}
                    </span>
                  </div>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {question.options.map((option, optionIndex) => {
                  const isCorrect = optionIndex === question.answerIndex;
                  const isSelected = optionIndex === selectedAnswer;

                  return (
                    <button
                      key={`${option}-${optionIndex}`}
                      type="button"
                      onClick={() => setAnswers((current) => ({ ...current, [questionIndex]: optionIndex }))}
                      className={clsx(
                        "flex min-h-14 items-start gap-3 rounded-2xl border px-4 py-3 text-left text-sm leading-6 transition duration-200 active:scale-[0.99]",
                        hasAnswered && isCorrect && "border-emerald-300 bg-emerald-50 text-emerald-800",
                        hasAnswered && isSelected && !isCorrect && "border-rose-300 bg-rose-50 text-rose-800",
                        !hasAnswered && "border-slate-200 bg-white text-slate-700 hover:border-blue-300 hover:bg-blue-50",
                        hasAnswered && !isCorrect && !isSelected && "border-slate-200 bg-white text-slate-500"
                      )}
                    >
                      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white text-xs font-semibold ring-1 ring-current/15">
                        {optionLabels[optionIndex]}
                      </span>
                      <MathText text={option} className="flex-1" />
                      {hasAnswered && isCorrect ? <CheckCircle2 className="h-5 w-5 shrink-0" /> : null}
                      {hasAnswered && isSelected && !isCorrect ? <XCircle className="h-5 w-5 shrink-0" /> : null}
                      {!hasAnswered ? <Circle className="h-5 w-5 shrink-0 text-slate-300" /> : null}
                    </button>
                  );
                })}
              </div>

              {hasAnswered ? (
                <div className="mt-4 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-700">
                  {isWrong ? (
                    <div className="mb-2 font-semibold text-emerald-700">
                      正确答案：{optionLabels[question.answerIndex]}
                    </div>
                  ) : null}
                  <span className="font-semibold text-slate-950">解析：</span>
                  <MathText text={question.explanation} className="ml-1" />
                </div>
              ) : null}
            </article>
          );
        })}
      </div>

      {isComplete ? (
        <div className="mt-6 rounded-3xl border border-blue-100 bg-blue-50 p-4 sm:p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-blue-700">
                <Trophy className="h-6 w-6" />
              </span>
              <div>
                <div className="text-lg font-semibold text-slate-950">本组练习完成</div>
                <div className="mt-1 text-sm text-slate-600">
                  正确率 {accuracy}% · 错题 {wrongQuestions.length} 道
                </div>
              </div>
            </div>
            {onRequestReview && wrongQuestions.length > 0 ? (
              <button
                type="button"
                onClick={() => onRequestReview(wrongQuestions)}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                <BookOpenCheck className="h-5 w-5" />
                {reviewButtonLabel}
              </button>
            ) : (
              <span className="rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-emerald-700">
                本次没有错题
              </span>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}
