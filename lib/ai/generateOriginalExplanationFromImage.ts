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
  collectQwenStreamText,
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
    title: trimText(value.title, 120),
    detectedText: trimText(value.detectedText, 2500),
    subject: trimText(value.subject, 40),
    topic: trimText(value.topic, 60),
    finalAnswer: trimText(value.finalAnswer, 1200),
    explanation: trimText(value.explanation, 2200),
    keySteps: value.keySteps.map((item) => trimText(item, 500)).filter(Boolean).slice(0, 4),
    knowledgePoints: knowledgePoints.map((item) => trimText(item, 120)).filter(Boolean).slice(0, 4),
    commonMistake: trimText(value.commonMistake, 600),
    similarIdeas: value.similarIdeas.map((item) => trimText(item, 500)).filter(Boolean).slice(0, 3)
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
  const marker = IMAGE_NOT_CLEAR;

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

function containsBadFallbackText(value: OriginalExplanation) {
  const fullText = JSON.stringify(value);

  const badPatterns = [
    "图片内容较复杂",
    "根据图片中可见信息",
    "系统已尝试",
    "黑边",
    "浏览器边框",
    "手机截图边框",
    "截图边框",
    "请重新上传",
    "请裁剪",
    "无法识别题目",
    "无法识别"
  ];

  return badPatterns.some((pattern) => fullText.includes(pattern));
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
    ? `你是拍题解析助手。只看图片里的真实题目，只输出 JSON。看不清具体题目时只输出 {"error":"${IMAGE_NOT_CLEAR}"}。不要输出 Markdown。不要输出任何兜底废话。公式用 LaTeX。keySteps<=4，knowledgePoints<=4，similarIdeas<=3。输出语言：${outputLanguage}。`
    : `你是拍题解析助手。请直接识别并解析图片中的真实题目，只输出 JSON。看不清具体题目时只输出 {"error":"${IMAGE_NOT_CLEAR}"}。禁止输出“图片复杂、根据可见信息、系统已尝试、黑边、浏览器边框、手机截图边框、请重新上传、请裁剪、无法识别”等兜底话术。公式用 LaTeX。keySteps<=4，knowledgePoints<=4，similarIdeas<=3。输出语言：${outputLanguage}。`;

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
          text: `请识别并解析图片里的题目。只关注题干、公式、图形、表格、选项和答案推导。图像摘要：${imageSummary || "无"}`
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
  return collectQwenStreamText(
    {
      model: QWEN_VL_MODEL || "qwen3-vl-flash",
      messages,
      temperature: 0.05,
      enable_thinking: false,
      max_tokens: 1800
    },
    {
      // 关键：不要像之前一样 15 秒首 token 超时就杀掉。
      // Chatbox 类似逻辑：建立流式连接后等待模型输出。
      firstTokenTimeoutMs: 0,
      totalTimeoutMs: 180000
    }
  );
}

async function parseVisionExplanation(rawText: string, fallback: OriginalExplanation) {
  if (isImageNotClearResponse(rawText)) {
    throw new ImageNotClearError();
  }

  const parsed = await robustParseAiJson(rawText, OriginalExplanationSchema, fallback);
  const normalized = normalizeVisionExplanation(parsed);

  if (containsBadFallbackText(normalized)) {
    throw new ImageNotClearError();
  }

  if (normalized.detectedText === IMAGE_NOT_CLEAR || normalized.explanation === IMAGE_NOT_CLEAR) {
    throw new ImageNotClearError();
  }

  return assertUsableOriginalExplanation(normalized);
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
