import "server-only";

import {
  RecognitionSchema,
  RECOGNITION_JSON_SHAPE,
  type RecognitionResult
} from "@/lib/ai/schema";
import { robustParseAiJson } from "@/lib/ai/jsonRepair";
import { postQwenChatCompletion, QWEN_VL_MODEL, readAssistantText, type ChatMessage } from "@/lib/ai/qwen";
import { languageInstruction, mathOutputInstruction, normalizeLanguage, type AppLanguage } from "@/lib/language";

function extractReadableTextFromRaw(rawText: string) {
  const text = rawText
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .replace(/["{}[\],]/g, " ")
    .replace(/\b(detectedText|imageSummary)\b\s*:/gi, " ")
    .replace(/图片内容较复杂|根据图片中可见信息|系统已尝试|请重新上传|请裁剪|裁剪黑边|题目区域识别失败|识别失败/g, "")
    .replace(/\s+/g, " ")
    .trim();

  return text.slice(0, 2000);
}

function sanitizeRecognitionResult(result: RecognitionResult): RecognitionResult {
  const detectedText = String(result.detectedText || "")
    .replace(/图片内容较复杂|根据图片中可见信息|系统已尝试|请重新上传|请裁剪|裁剪黑边|题目区域识别失败|识别失败|更聚焦的题目图片/g, "")
    .trim();

  const imageSummary = String(result.imageSummary || "")
    .replace(/图片内容较复杂|根据图片中可见信息|系统已尝试|请重新上传|请裁剪|裁剪黑边|题目区域识别失败|识别失败|更聚焦的题目图片/g, "")
    .trim();

  return {
    detectedText,
    imageSummary: imageSummary || "OCR 未稳定读取到完整题干，将交由视觉解析模型直接识别题目。"
  };
}

export async function recognizeQuestionContent({
  base64,
  mimeType,
  language = "zh"
}: {
  base64: string;
  mimeType: string;
  language?: AppLanguage;
}): Promise<RecognitionResult> {
  const outputLanguage = normalizeLanguage(language);

  const messages: ChatMessage[] = [
    {
      role: "system",
      content: `你是 OCR 和题目识别助手。只输出 JSON，不要 Markdown，不要代码块。
${languageInstruction(outputLanguage)}
${mathOutputInstruction}`
    },
    {
      role: "user",
      content: [
        {
          type: "text",
          text: `请识别图片中的题目内容，并给出一句图像摘要。

最高优先级规则：
1. 只提取题目本身的文字、公式、图形标注、坐标轴、表格和选项。
2. 静默忽略与题目无关的截图界面元素，不要在结果里描述这些元素。
3. 禁止输出这些兜底废话：图片内容较复杂、根据图片中可见信息、系统已尝试、黑边、浏览器边框或手机截图边框不是题目内容、请重新上传、请裁剪。
4. 如果只能识别部分题目，也只输出实际读到的原始题目内容，不要输出操作建议。

普通要求：
1. 只输出 JSON。
1.1 不要输出 Markdown、代码块或 \`\`\`json。
1.2 字符串内双引号必须转义，LaTeX 反斜杠必须双写。
2. detectedText 尽量保留题干、条件、选项、图表文字和关键公式。
3. imageSummary 只描述与解题有关的图像信息。
4. ${languageInstruction(outputLanguage)}
5. ${mathOutputInstruction}

输出 JSON 格式：
${RECOGNITION_JSON_SHAPE}`
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

  const fallback: RecognitionResult = {
    detectedText: "",
    imageSummary: "OCR 未稳定读取到题目文字。"
  };

  let rawText = "";

  try {
    const data = await postQwenChatCompletion({
      model: QWEN_VL_MODEL,
      messages,
      temperature: 0.05,
      enable_thinking: false,
      max_tokens: 2200,
      timeoutMs: 90000
    });

    rawText = readAssistantText(data);
  } catch (error) {
    console.error("recognize_question_content_failed", {
      error: error instanceof Error ? error.message : "unknown"
    });

    return fallback;
  }

  const parsed = await robustParseAiJson(rawText, RecognitionSchema, fallback);

  if (parsed === fallback && rawText.trim()) {
    return sanitizeRecognitionResult({
      detectedText: extractReadableTextFromRaw(rawText),
      imageSummary: "已从图片中提取到部分题目内容，后续将继续使用视觉解析。"
    });
  }

  return sanitizeRecognitionResult(parsed);
}
