import "server-only";

import {
  ORIGINAL_EXPLANATION_JSON_SHAPE,
  OriginalExplanationSchema,
  type OriginalExplanation
} from "@/lib/ai/schema";
import { extractJsonFromText } from "@/lib/ai/extractJson";
import { robustParseAiJson } from "@/lib/ai/jsonRepair";
import {
  ImageNotClearError,
  assertUsableOriginalExplanation
} from "@/lib/ai/originalExplanationQuality";
import {
  AiConfigurationError,
  AiTimeoutError,
  QWEN_VL_MODEL,
  postQwenChatCompletion,
  readAssistantText,
  type ChatMessage
} from "@/lib/ai/qwen";
import { normalizeLanguage, type AppLanguage } from "@/lib/language";

const IMAGE_NOT_CLEAR = "IMAGE_NOT_CLEAR";

function outputLanguageText(language: AppLanguage) {
  return language === "en" ? "English" : "中文";
}

function trimText(value: string, maxLength: number) {
  const text = String(value || "").trim();
  return text.length > maxLength ? text.slice(0, maxLength) : text;
}

function normalizeVisionExplanation(value: OriginalExplanation): OriginalExplanation {
  const knowledgePoints =
    Array.isArray(value.knowledgePoints) && value.knowledgePoints.length > 0
      ? value.knowledgePoints
      : [value.topic].filter(Boolean);

  return {
    ...value,
    title: trimText(value.title, 80),
    detectedText: trimText(value.detectedText, 1200),
    subject: trimText(value.subject, 40),
    topic: trimText(value.topic, 60),
    finalAnswer: trimText(value.finalAnswer, 300),
    explanation: trimText(value.explanation, 600),
    keySteps: value.keySteps.map((item) => trimText(item, 120)).filter(Boolean).slice(0, 4),
    knowledgePoints: knowledgePoints.map((item) => trimText(item, 80)).filter(Boolean).slice(0, 4),
    commonMistake: trimText(value.commonMistake, 160),
    similarIdeas: value.similarIdeas.map((item) => trimText(item, 120)).filter(Boolean).slice(0, 3)
  };
}

function isImageNotClearResponse(rawText: string) {
  try {
    const parsed = JSON.parse(extractJsonFromText(rawText)) as { error?: unknown };
    return parsed?.error === IMAGE_NOT_CLEAR;
  } catch {
    return rawText.includes(IMAGE_NOT_CLEAR);
  }
}

function createFallback(language: AppLanguage): OriginalExplanation {
  const marker = language === "en" ? "Unrecognizable question" : "无法识别题目";

  return {
    title: marker,
    detectedText: marker,
    subject: language === "en" ? "General" : "综合",
    topic: marker,
    difficulty: "medium",
    finalAnswer: marker,
    explanation: marker,
    keySteps: [marker],
    knowledgePoints: [marker],
    commonMistake: marker,
    similarIdeas: [marker]
  };
}

function buildMessages({
  base64,
  mimeType,
  imageSummary,
  language,
  retry
}: {
  base64: string;
  mimeType: string;
  imageSummary?: string;
  language: AppLanguage;
  retry: boolean;
}): ChatMessage[] {
  const outputLanguage = outputLanguageText(language);
  const system = retry
    ? `你是拍题解析助手。只看图片里的真实题目，只输出 JSON。看不清具体题目时只输出 {"error":"${IMAGE_NOT_CLEAR}"}。禁止输出 Markdown、兜底话术、上传/裁剪建议。解释不超过 600 中文字，keySteps<=4，knowledgePoints<=4，similarIdeas<=3，公式用 LaTeX。输出语言：${outputLanguage}。`
    : `你是拍题解析助手。任务：根据图片生成原题解析。只输出 JSON；看不清具体题目时只输出 {"error":"${IMAGE_NOT_CLEAR}"}。禁止输出“图片复杂、根据可见信息、系统已尝试、黑边、请重新上传、请裁剪、无法识别”等兜底话术。解释不超过 600 中文字，keySteps<=4，knowledgePoints<=4，similarIdeas<=3，公式用 $...$ LaTeX。输出语言：${outputLanguage}。`;

  return [
    {
      role: "system",
      content: `${system}\nJSON 字段：\n${ORIGINAL_EXPLANATION_JSON_SHAPE}`
    },
    {
      role: "user",
      content: [
        {
          type: "text",
          text: `请识别并解析图片中的题目。只保留题干、公式、图形标注、表格和选项。图像摘要：${imageSummary || "无"}`
        },
        {
          type: "image_url",
          image_url: {
            url: `data:${mimeType};base64,${base64}`
          }
        }
      ]
    }
  ];
}

async function requestVisionExplanation(messages: ChatMessage[]) {
  const data = await postQwenChatCompletion({
    model: QWEN_VL_MODEL,
    messages,
    temperature: 0.06,
    enable_thinking: false,
    max_tokens: 1800,
    timeoutMs: 45000
  });

  return readAssistantText(data);
}

async function parseVisionExplanation(rawText: string, fallback: OriginalExplanation) {
  if (isImageNotClearResponse(rawText)) {
    throw new ImageNotClearError();
  }

  const parsed = await robustParseAiJson(rawText, OriginalExplanationSchema, fallback);
  return assertUsableOriginalExplanation(normalizeVisionExplanation(parsed));
}

export async function generateOriginalExplanationFromImage({
  base64,
  mimeType,
  imageSummary,
  language = "zh",
  userId
}: {
  base64: string;
  mimeType: string;
  imageSummary?: string;
  language?: AppLanguage;
  userId?: string;
}): Promise<OriginalExplanation> {
  const outputLanguage = normalizeLanguage(language);
  const fallback = createFallback(outputLanguage);
  let lastError: unknown = null;

  for (const retry of [false, true]) {
    try {
      const rawText = await requestVisionExplanation(
        buildMessages({
          base64,
          mimeType,
          imageSummary,
          language: outputLanguage,
          retry
        })
      );

      return await parseVisionExplanation(rawText, fallback);
    } catch (error) {
      lastError = error;

      if (error instanceof AiTimeoutError || error instanceof AiConfigurationError) {
        throw error;
      }

      if (error instanceof ImageNotClearError && retry) {
        throw error;
      }

      if (!retry) {
        continue;
      }
    }
  }

  console.error("generate_original_explanation_from_image_failed", {
    user_id: userId || null,
    error: lastError instanceof Error ? lastError.message : "unknown"
  });

  throw new ImageNotClearError();
}
