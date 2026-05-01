import "server-only";

import {
  ORIGINAL_EXPLANATION_JSON_SHAPE,
  OriginalExplanationSchema,
  type OriginalExplanation
} from "@/lib/ai/schema";
import { robustParseAiJson } from "@/lib/ai/jsonRepair";
import {
  assertUsableOriginalExplanation,
  UNRECOGNIZABLE_QUESTION_MARKER
} from "@/lib/ai/originalExplanationQuality";
import { postQwenChatCompletion, QWEN_TEXT_MODEL, readAssistantText, type ChatMessage } from "@/lib/ai/qwen";
import { languageInstruction, mathOutputInstruction, normalizeLanguage, type AppLanguage } from "@/lib/language";

export async function generateOriginalExplanation({
  detectedText,
  imageSummary,
  subject,
  userId,
  language = "zh"
}: {
  detectedText: string;
  imageSummary?: string;
  subject?: string;
  userId?: string;
  language?: AppLanguage;
}): Promise<OriginalExplanation> {
  const outputLanguage = normalizeLanguage(language);
  const hasIncompleteDetectedText = !detectedText.trim() || /题目识别.*(不完整|暂不完整)/.test(detectedText);

  if (hasIncompleteDetectedText) {
    throw new Error("无法识别题目内容，请提供更清晰、完整的题目图片或题目文字。");
  }

  const messages: ChatMessage[] = [
    {
      role: "system",
      content: `你是一个专业的 AI 学习解析助手。
请根据用户上传图片识别出的题目内容，生成“原题解析”。

要求：
1. 只输出 JSON
2. 不要 Markdown
3. 不要代码块
4. 不要输出 JSON 以外的解释文字
4.1 不要输出 \`\`\`json
4.2 字符串内双引号必须转义
4.3 LaTeX 反斜杠必须双写，例如 \\frac、\\sqrt
5. 不要生成 Quiz
6. 不要生成练习题
7. explanation 要完整清楚
8. keySteps 用数组列出解题步骤
9. similarIdeas 用数组列出同类题解法迁移思路
10. 必须围绕真实题干、公式、图形或选项解析，不要编造题目
11. 禁止在任何字段输出这些兜底废话：图片内容较复杂、根据图片中可见信息、系统已尝试、黑边、浏览器边框或手机截图边框不是题目内容、请重新上传、请裁剪
12. 如果无法从输入中确定具体题目，所有字段都输出 ${UNRECOGNIZABLE_QUESTION_MARKER}
13. ${languageInstruction(outputLanguage)}
14. ${mathOutputInstruction}

输出 JSON 格式必须为：
${ORIGINAL_EXPLANATION_JSON_SHAPE}`
    },
    {
      role: "user",
      content: `识别出的题目内容：
${detectedText}

图像摘要：
${imageSummary || "无"}

学科：
${subject || "请根据题目判断"}

输出语言：
${outputLanguage}

用户 ID（仅用于内部追踪，不要写入结果）：
${userId || "anonymous"}`
    }
  ];

  const fallback: OriginalExplanation = {
    title: UNRECOGNIZABLE_QUESTION_MARKER,
    detectedText: UNRECOGNIZABLE_QUESTION_MARKER,
    subject: subject || "综合",
    topic: UNRECOGNIZABLE_QUESTION_MARKER,
    difficulty: "medium",
    explanation: UNRECOGNIZABLE_QUESTION_MARKER,
    keySteps: [UNRECOGNIZABLE_QUESTION_MARKER],
    finalAnswer: UNRECOGNIZABLE_QUESTION_MARKER,
    commonMistake: UNRECOGNIZABLE_QUESTION_MARKER,
    similarIdeas: ["改变条件后沿用同一知识点和解题步骤"]
  };

  let rawText = "";

  try {
    const data = await postQwenChatCompletion({
      model: QWEN_TEXT_MODEL,
      messages,
      temperature: 0.18,
      enable_thinking: false,
      max_tokens: 3500,
      timeoutMs: 20000
    });
    rawText = readAssistantText(data);
  } catch (error) {
    console.error("generate_original_explanation_failed", {
      user_id: userId || null,
      error: error instanceof Error ? error.message : "unknown"
    });
    throw new Error("AI 解析失败，请稍后重试。");
  }

  const parsed = await robustParseAiJson(
    rawText,
    OriginalExplanationSchema,
    fallback
  );

  return assertUsableOriginalExplanation(parsed);
}
