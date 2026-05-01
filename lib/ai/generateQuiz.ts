import "server-only";

import {
  QUIZ_JSON_SHAPE,
  QuizResultSchema,
  type OriginalExplanation,
  type QuizResult
} from "@/lib/ai/schema";
import { assertParsed, parseAndValidateJson } from "@/lib/ai/jsonRepair";
import { isUsableOriginalExplanation } from "@/lib/ai/originalExplanationQuality";
import { postQwenChatCompletion, QWEN_QUIZ_MODEL, readAssistantText, type ChatMessage } from "@/lib/ai/qwen";
import { mathOutputInstruction, normalizeLanguage, type AppLanguage } from "@/lib/language";

export async function generateQuiz({
  detectedText,
  originalExplanation,
  subject,
  topic,
  difficulty,
  questionCount = 3,
  language = "zh"
}: {
  detectedText: string;
  originalExplanation: OriginalExplanation;
  subject?: string;
  topic?: string;
  difficulty?: "easy" | "medium" | "hard";
  questionCount?: number;
  language?: AppLanguage;
}): Promise<QuizResult> {
  if (!isUsableOriginalExplanation(originalExplanation)) {
    throw new Error("缺少真实解析结果，无法生成 Quiz。");
  }

  const safeQuestionCount = Math.min(4, Math.max(3, questionCount));
  const outputLanguage = normalizeLanguage(language);
  const languageRule =
    outputLanguage === "en"
      ? "Write every user-facing JSON value in English only."
      : "所有题目、选项、topic 等面向用户的 JSON 字段值必须只用中文，不要出现英文叙述。";
  const messages: ChatMessage[] = [
    {
      role: "system",
      content: `You are a concise Quiz generator. Output JSON only.
${languageRule}
Do not output Thinking, Reasoning, Chain of Thought, internal analysis, self-checking, corrections, or <think> tags.
生成 ${safeQuestionCount} 道围绕原题知识点的简洁变式选择题，每题 4 个选项，correctAnswer 只能是 A/B/C/D。
题目和选项必须短，不要长背景；不要包含 explanation、detailedExplanation 或长解析；不要基于兜底话术出题。
题干和选项要像考试试卷：凡是可以用数学形式表达的内容，都必须写成标准数学形式；不要写“x平方”“根号x”“π除以3”这类口语化数学。
question 与 options 中的公式必须使用 KaTeX 可渲染 LaTeX；数学型选项尽量只写数学式，不要把 A/B/C/D 或解释拼进选项。
${mathOutputInstruction}
JSON 格式：
${QUIZ_JSON_SHAPE}`
    },
    {
      role: "user",
      content: `请生成 ${safeQuestionCount} 道 Quiz。

原题内容：
${detectedText.slice(0, 1200)}

原题解析：
${JSON.stringify({
  title: originalExplanation.title,
  subject: originalExplanation.subject,
  topic: originalExplanation.topic,
  difficulty: originalExplanation.difficulty,
  finalAnswer: originalExplanation.finalAnswer,
  keySteps: originalExplanation.keySteps,
  knowledgePoints: originalExplanation.knowledgePoints
}, null, 2)}

学科：${subject || originalExplanation.subject}
知识点：${topic || originalExplanation.topic}
难度：${difficulty || originalExplanation.difficulty}
输出语言：${outputLanguage}`
    }
  ];

  let rawText = "";

  try {
    const data = await postQwenChatCompletion({
      model: QWEN_QUIZ_MODEL,
      messages,
      temperature: 0.05,
      enable_thinking: false,
      max_tokens: 1000,
      timeoutMs: 30000
    });
    rawText = readAssistantText(data);
  } catch (error) {
    console.error("generate_quiz_failed", {
      topic: topic || originalExplanation.topic,
      error: error instanceof Error ? error.message : "unknown"
    });
    throw new Error(error instanceof Error ? error.message : "Quiz 生成失败。");
  }

  const parsed = await parseAndValidateJson(rawText, QuizResultSchema, QUIZ_JSON_SHAPE);
  return assertParsed(parsed);
}
