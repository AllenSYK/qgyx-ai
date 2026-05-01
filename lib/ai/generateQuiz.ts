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
  const messages: ChatMessage[] = [
    {
      role: "system",
      content: `你是 Quiz 出题助手。只输出 JSON，不要 Markdown，不要解析，不要输出思考过程、推理草稿、Thinking、Reasoning、<think>...</think>。
生成 ${safeQuestionCount} 道围绕原题知识点的变式选择题，每题 4 个选项，correctAnswer 只能是 A/B/C/D。
不要包含 explanation 或 detailedExplanation。禁止基于兜底话术出题，不编造不存在的原题。
所有数学公式必须使用 KaTeX 可渲染的标准 LaTeX：行内公式写成 $...$，独立公式写成 $$...$$，分式写成 $\\frac{a}{b}$，根号写成 $\\sqrt{x}$，幂次写成 $x^2$。禁止在 \frac 后插入多余的美元符号，禁止多余的 $，禁止代码块包公式。禁止把 $$ 写在中文句子中间；长公式必须单独成行写成 $$...$$，短公式只能写成 $...$。坐标、交点、区间必须写成 $\\left( ... \\right)$，变量和物理符号也要写成数学形式，例如 $x$、$y$、$v$、$F$、$m$、$a$、$k$。坐标、交点、区间必须写成 $\\left( ... \\right)$，变量和物理符号也要写成数学形式，例如 $x$、$y$、$v$、$F$、$m$、$a$、$k$。输出语言：${outputLanguage === "en" ? "English" : "中文"}。
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
      temperature: 0.25,
      enable_thinking: false,
      max_tokens: 2200,
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
