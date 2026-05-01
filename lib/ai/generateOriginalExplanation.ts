import "server-only";

import {
  ORIGINAL_EXPLANATION_JSON_SHAPE,
  OriginalExplanationSchema,
  type OriginalExplanation
} from "@/lib/ai/schema";
import { robustParseAiJson } from "@/lib/ai/jsonRepair";
import { cleanOriginalExplanationMath } from "@/lib/ai/mathFormat";
import {
  assertUsableOriginalExplanation,
  UNRECOGNIZABLE_QUESTION_MARKER
} from "@/lib/ai/originalExplanationQuality";
import {
  AiConfigurationError,
  AiTimeoutError,
  QWEN_TEXT_MODEL,
  postQwenChatCompletion,
  readAssistantText,
  type ChatMessage
} from "@/lib/ai/qwen";
import { mathOutputInstruction, normalizeLanguage, type AppLanguage } from "@/lib/language";

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
      content: `你是题目解析助手。只根据输入的真实题干生成原题解析，只输出 JSON。
要求：不输出 Markdown；不生成 Quiz；不编造题目；不要长篇推导；explanation 只保留关键步骤；keySteps<=4；knowledgePoints 2-4 条；similarIdeas 1-2 条。
禁止输出 Thinking、Reasoning、Chain of Thought、思考过程、推理草稿、内部分析、自我检查、自我纠错、<think> 标签。
禁止输出兜底话术：图片内容较复杂、根据图片中可见信息、系统已尝试、黑边、浏览器边框、手机截图边框、请重新上传、请裁剪、无法识别。
不要把知识点写成“题目解析”，不要把易错点写成泛泛的“注意审题条件和关键计算步骤”。
所有输出要像考试试卷：detectedText、finalAnswer、explanation、keySteps、commonMistake、knowledgePoints、similarIdeas 中凡是可以用数学形式表达的内容，都必须写成标准数学形式。
${mathOutputInstruction}
如果输入不足以确定具体题目，所有字段输出 ${UNRECOGNIZABLE_QUESTION_MARKER}。
输出语言：${outputLanguage === "en" ? "English" : "中文"}。
JSON 格式：
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
    knowledgePoints: [UNRECOGNIZABLE_QUESTION_MARKER],
    similarIdeas: ["改变条件后沿用同一知识点和解题步骤"]
  };

  let rawText = "";

  try {
    const data = await postQwenChatCompletion({
      model: QWEN_TEXT_MODEL,
      messages,
      temperature: 0.05,
      enable_thinking: false,
      max_tokens: 1600,
      timeoutMs: 90000
    });
    rawText = readAssistantText(data);
  } catch (error) {
    console.error("generate_original_explanation_failed", {
      user_id: userId || null,
      error: error instanceof Error ? error.message : "unknown"
    });

    if (error instanceof AiTimeoutError || error instanceof AiConfigurationError) {
      throw error;
    }

    throw new Error("DeepSeek 文本解析失败，请稍后重试。");
  }

  const parsed = await robustParseAiJson(
    rawText,
    OriginalExplanationSchema,
    fallback
  );

  return assertUsableOriginalExplanation(cleanOriginalExplanationMath(parsed));
}
