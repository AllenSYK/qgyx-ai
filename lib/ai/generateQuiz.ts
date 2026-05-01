import "server-only";

import {
  QUIZ_JSON_SHAPE,
  QuizResultSchema,
  type OriginalExplanation,
  type QuizResult
} from "@/lib/ai/schema";
import { robustParseAiJson } from "@/lib/ai/jsonRepair";
import { isUsableOriginalExplanation } from "@/lib/ai/originalExplanationQuality";
import { postQwenChatCompletion, QWEN_QUIZ_MODEL, readAssistantText, type ChatMessage } from "@/lib/ai/qwen";
import { languageInstruction, mathOutputInstruction, normalizeLanguage, type AppLanguage } from "@/lib/language";

export async function generateQuiz({
  detectedText,
  originalExplanation,
  subject,
  topic,
  difficulty,
  questionCount = 4,
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

  const safeQuestionCount = Math.min(5, Math.max(3, questionCount));
  const outputLanguage = normalizeLanguage(language);
  const messages: ChatMessage[] = [
    {
      role: "system",
      content: `你是一个专业的 AI 学习出题助手。
请根据原题内容和原题解析，生成用于练习的 Quiz。

要求：
1. 只输出 JSON
2. 不要 Markdown
3. 不要代码块
4. 不要输出 JSON 以外内容
4.1 不要输出 \`\`\`json
4.2 字符串内双引号必须转义
4.3 LaTeX 反斜杠必须双写，例如 \\frac、\\sqrt
5. 生成 3-5 道题
6. 每道题必须有 4 个选项
7. correctAnswer 只能是 A/B/C/D
8. 只生成题目，不生成解析
9. 不要包含 explanation
10. 不要包含 detailedExplanation
11. 题目必须围绕原题知识点进行变式训练
12. 适合学生练习
13. 禁止基于“图片内容较复杂”“根据图片中可见信息”“系统已尝试”等兜底内容出题
14. 如果原题解析不是具体题目，停止并不要编造题目
15. ${languageInstruction(outputLanguage)}
16. ${mathOutputInstruction}

输出 JSON 格式必须为：
${QUIZ_JSON_SHAPE}`
    },
    {
      role: "user",
      content: `请生成 ${safeQuestionCount} 道 Quiz。

原题内容：
${detectedText}

原题解析：
${JSON.stringify(originalExplanation, null, 2)}

学科：${subject || originalExplanation.subject}
知识点：${topic || originalExplanation.topic}
难度：${difficulty || originalExplanation.difficulty}
输出语言：${outputLanguage}`
    }
  ];

  const fallbackQuestions = Array.from({ length: 3 }, (_, index) => ({
    id: `fallback-${index + 1}`,
    question: `围绕“${topic || originalExplanation.topic || "核心知识点"}”的基础练习题 ${index + 1}。`,
    options: ["A", "B", "C", "D"],
    correctAnswer: "A" as const,
    topic: topic || originalExplanation.topic || "核心知识点",
    difficulty: difficulty || originalExplanation.difficulty || "medium"
  }));
  const fallback: QuizResult = {
    questions: fallbackQuestions
  };

  let rawText = "";

  try {
    const data = await postQwenChatCompletion({
      model: QWEN_QUIZ_MODEL,
      messages,
      temperature: 0.25,
      enable_thinking: false,
      max_tokens: 4500,
      timeoutMs: 25000
    });
    rawText = readAssistantText(data);
  } catch (error) {
    console.error("generate_quiz_failed", {
      topic: topic || originalExplanation.topic,
      error: error instanceof Error ? error.message : "unknown"
    });
    return fallback;
  }

  return robustParseAiJson(rawText, QuizResultSchema, fallback);
}
