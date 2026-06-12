import type { Quiz, QuizQuestion, WrongQuestion } from "@/types/quiz";

type QuizTagQuestion = Pick<
  QuizQuestion | WrongQuestion,
  "knowledgePoint" | "difficulty" | "subject" | "questionType" | "tags"
>;

export function compactTagList(candidates: Array<string | null | undefined>, limit = 2) {
  const tags = candidates
    .map((tag) => String(tag || "").trim())
    .filter(Boolean);

  return Array.from(new Set(tags)).slice(0, limit);
}

export function compactQuizQuestionTags(question: QuizTagQuestion, quiz?: Pick<Quiz, "subject" | "questionType">, limit = 2) {
  return compactTagList(
    [
      question.knowledgePoint,
      question.difficulty,
      question.subject || quiz?.subject,
      question.questionType || quiz?.questionType,
      ...(question.tags || [])
    ],
    limit
  );
}
