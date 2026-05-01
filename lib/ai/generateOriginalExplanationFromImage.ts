import "server-only";

import {
  ORIGINAL_EXPLANATION_JSON_SHAPE,
  OriginalExplanationSchema,
  type OriginalExplanation
} from "@/lib/ai/schema";
import { extractJsonFromText } from "@/lib/ai/extractJson";
import { robustParseAiJson } from "@/lib/ai/jsonRepair";
import { cleanOriginalExplanationMath } from "@/lib/ai/mathFormat";
import {
  ImageNotClearError,
  assertUsableOriginalExplanation
} from "@/lib/ai/originalExplanationQuality";
import {
  AiConfigurationError,
  AiTimeoutError,
  getVisionModelForTier,
  shouldEnableThinking,
  collectQwenStreamText,
  type ChatMessage,
  type MembershipTier
} from "@/lib/ai/qwen";
import { detectComplexMathQuestion } from "@/lib/ai/complexMathDetection";
import { validateMathAnswer, shouldValidateForTier } from "@/lib/ai/mathValidation";
import { mathOutputInstruction, normalizeLanguage, type AppLanguage } from "@/lib/language";

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

  const steps = Array.isArray(value.steps)
    ? value.steps
        .filter((s) => s && s.title && s.content)
        .map((s) => ({
          title: trimText(s.title, 100),
          content: trimText(s.content, 500),
          formula: trimText(s.formula || "", 200)
        }))
        .slice(0, 6)
    : [];

  const formulas = Array.isArray(value.formulas)
    ? value.formulas.map((f) => trimText(f, 200)).filter(Boolean).slice(0, 8)
    : [];

  const warnings = Array.isArray(value.warnings)
    ? value.warnings.map((w) => trimText(w, 300)).filter(Boolean).slice(0, 4)
    : [];

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
    similarIdeas: value.similarIdeas.map((item) => trimText(item, 500)).filter(Boolean).slice(0, 3),
    steps,
    formulas,
    warnings
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
    similarIdeas: [marker],
    steps: [],
    formulas: [],
    warnings: []
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
  retry,
  tier,
  isComplex
}: {
  base64: string;
  mimeType: string;
  imageSummary?: string;
  language: AppLanguage;
  retry: boolean;
  tier: MembershipTier;
  isComplex: boolean;
}): ChatMessage[] {
  const outputLanguage = outputLanguageText(language);
  const mathRule =
    “所有输出要像考试试卷：detectedText、finalAnswer、explanation、keySteps、commonMistake、knowledgePoints、similarIdeas、steps、formulas 中凡是可以用数学形式表达的内容，都必须写成标准数学形式。\n” +
    mathOutputInstruction + “\n”;

  const completenessRule = isComplex
    ? “数学推导必须完整，不能停在中间式。例如得到 12x^4 + 5x^2 - 2 = 0 后必须继续解出 x 和 y 值。steps 中每个步骤必须包含 title、content 和 formula。formulas 数组必须包含推导中用到的所有关键公式。”
    : “”;

  const retryPrefix =
    “你是拍题解析助手。只看图片里的真实题目，只输出 JSON。看不清具体题目时只输出 {\”error\”:\”” + IMAGE_NOT_CLEAR + “\”}。不要输出 Markdown、思考过程、自我纠错或兜底废话。”;

  const normalPrefix =
    “你是拍题解析助手。请直接识别并解析图片中的真实题目，只输出 JSON。看不清具体题目时只输出 {\”error\”:\”” + IMAGE_NOT_CLEAR + “\”}。禁止输出 Thinking、Reasoning、Chain of Thought、思考过程、推理草稿、自我检查、自我纠错、<think> 标签。禁止输出“图片复杂、根据可见信息、系统已尝试、黑边、浏览器边框、手机截图边框、请重新上传、请裁剪、无法识别”等兜底话术。解析要短，只保留关键步骤；”;

  const system = retry
    ? retryPrefix + mathRule + completenessRule + “keySteps<=4，knowledgePoints<=4，similarIdeas<=2，steps 最多 6 步。输出语言：” + outputLanguage + “。”
    : normalPrefix + mathRule + completenessRule + “keySteps<=4，knowledgePoints<=4，similarIdeas<=2，steps 最多 6 步。输出语言：” + outputLanguage + “。”;

  if (tier === “max” && isComplex) {
    const systemContent =
      system +
      “\n你是专业数学解析助手，需要进行严格的逐步推导验证。每一步推导必须逻辑严密，最终答案必须与推导过程一致。\nJSON 字段：\n” +
      ORIGINAL_EXPLANATION_JSON_SHAPE;

    const userText =
      “请识别并解析图片中的数学题目。要求：1) 完整推导不能省略中间步骤 2) 每步写出所用公式 3) 最终答案必须与推导一致 4) 如果发现常见易错点务必标注。图像摘要：” + (imageSummary || “无”);

    return [
      {
        role: “system” as const,
        content: systemContent
      },
      {
        role: “user” as const,
        content: [
          {
            type: “text” as const,
            text: userText
          },
          {
            type: “image_url” as const,
            image_url: {
              url: “data:” + mimeType + “;base64,” + base64
            }
          }
        ]
      }
    ];
  }

  const systemContent =
    system + “\nJSON 字段：\n” + ORIGINAL_EXPLANATION_JSON_SHAPE;

  const userText =
    “请识别并解析图片里的题目。只关注题干、公式、图形、表格、选项和答案推导；不要描述截图界面或 OCR 过程。图像摘要：” + (imageSummary || “无”);

  return [
    {
      role: “system” as const,
      content: systemContent
    },
    {
      role: “user” as const,
      content: [
        {
          type: “text” as const,
          text: userText
        },
        {
          type: “image_url” as const,
          image_url: {
            url: “data:” + mimeType + “;base64,” + base64
          }
        }
      ]
    }
  ];
}

async function requestVisionExplanation(
  messages: ChatMessage[],
  model: string,
  enableThinking: boolean
) {
  const maxTokens = enableThinking ? 2400 : 1200;
  return collectQwenStreamText(
    {
      model,
      messages,
      temperature: 0.05,
      enable_thinking: enableThinking,
      max_tokens: maxTokens
    },
    {
      firstTokenTimeoutMs: 0,
      totalTimeoutMs: enableThinking ? 240000 : 180000
    }
  );
}

async function parseVisionExplanation(rawText: string, fallback: OriginalExplanation) {
  if (isImageNotClearResponse(rawText)) {
    throw new ImageNotClearError();
  }

  const parsed = await robustParseAiJson(rawText, OriginalExplanationSchema, fallback);
  const normalized = cleanOriginalExplanationMath(normalizeVisionExplanation(parsed));

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
  userId,
  tier = "free"
}: {
  base64: string;
  mimeType: string;
  imageSummary?: string;
  language?: AppLanguage;
  userId?: string;
  tier?: MembershipTier;
}): Promise<OriginalExplanation> {
  const outputLanguage = normalizeLanguage(language);
  const fallback = createFallback(outputLanguage);
  let lastError: unknown = null;

  const model = getVisionModelForTier(tier);
  const isComplex = false;
  const enableThinking = shouldEnableThinking(tier, isComplex);

  for (const retry of [false, true]) {
    try {
      const rawText = await requestVisionExplanation(
        buildMessages({
          base64,
          mimeType,
          imageSummary,
          language: outputLanguage,
          retry,
          tier,
          isComplex
        }),
        model,
        enableThinking
      );

      const parsed = await parseVisionExplanation(rawText, fallback);

      if (shouldValidateForTier(tier)) {
        const questionText = parsed.detectedText || "";
        const isActuallyComplex = detectComplexMathQuestion(questionText);

        if (isActuallyComplex) {
          const validation = validateMathAnswer(questionText, parsed, tier);
          if (validation.needsRetry && !retry) {
            console.warn("Math validation flagged issues, retrying with stricter prompt", {
              warnings: validation.warnings
            });
            continue;
          }
          if (validation.warnings.length > 0) {
            return {
              ...parsed,
              warnings: [...(parsed.warnings || []), ...validation.warnings]
            };
          }
        }
      }

      return parsed;
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
    tier,
    error: lastError instanceof Error ? lastError.message : "unknown"
  });

  throw new ImageNotClearError();
}
