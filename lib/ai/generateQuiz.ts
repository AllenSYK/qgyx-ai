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
import { normalizeLanguage, type AppLanguage } from "@/lib/language";

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
公式必须使用 KaTeX 可渲染的 LaTeX：行内公式 $...$，必要时块级公式 $$...$$。分式写 $\\frac{a}{b}$，根号写 $\\sqrt{x}$，幂次写 $x^2$，坐标写 $\\left( ... \\right)$。不要把普通文字放进 $...$，不要输出孤立 $$ 或 \\frac$。
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
