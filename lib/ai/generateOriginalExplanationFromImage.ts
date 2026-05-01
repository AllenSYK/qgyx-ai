import "server-only";

import {
  OriginalExplanationSchema,
  type OriginalExplanation
} from "@/lib/ai/schema";
import { robustParseAiJson } from "@/lib/ai/jsonRepair";
import {
  ImageNotClearError,
  assertUsableOriginalExplanation
} from "@/lib/ai/originalExplanationQuality";
import {
  AiTimeoutError,
  postQwenChatCompletion,
  readAssistantText,
  type ChatMessage
} from "@/lib/ai/qwen";
import { normalizeLanguage, type AppLanguage } from "@/lib/language";

const IMAGE_NOT_CLEAR = "IMAGE_NOT_CLEAR";

function buildMessages(base64: string, mimeType: string): ChatMessage[] {
  return [
    {
      role: "system",
      content: `
你是AI解题助手。

必须输出 JSON：
{
  "title": "",
  "detectedText": "",
  "subject": "",
  "topic": "",
  "difficulty": "easy|medium|hard",
  "finalAnswer": "",
  "explanation": "",
  "keySteps": [],
  "knowledgePoints": [],
  "commonMistake": "",
  "similarIdeas": []
}

禁止输出：
图片复杂
根据可见信息
系统已尝试
黑边
截图边框
请重新上传
请裁剪
无法识别
`
    },
    {
      role: "user",
      content: [
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

export async function generateOriginalExplanationFromImage({
  base64,
  mimeType,
  language = "zh",
  userId
}: {
  base64: string;
  mimeType: string;
  language?: AppLanguage;
  userId?: string;
}): Promise<OriginalExplanation> {
  const lang = normalizeLanguage(language);

  try {
    const raw = await postQwenChatCompletion({
      model: "qwen3-vl-flash",
      messages: buildMessages(base64, mimeType),
      temperature: 0.2,
      max_tokens: 800,
      timeoutMs: 45000 // 🔥 降低超时避免卡死
    });

    const text = readAssistantText(raw);

    const parsed = await robustParseAiJson(
      text,
      OriginalExplanationSchema,
      null
    );

    const json = assertUsableOriginalExplanation(parsed);

    // 🚫 防止AI胡说八道
    const bad = [
      "图片复杂",
      "根据可见信息",
      "系统已尝试",
      "黑边",
      "截图边框",
      "请重新上传",
      "无法识别"
    ];

    const fullText = JSON.stringify(json);

    if (bad.some((k) => fullText.includes(k))) {
      throw new ImageNotClearError();
    }

    return json;

  } catch (error) {
    console.error("VL失败", {
      user_id: userId,
      error: error instanceof Error ? error.message : "unknown"
    });

    // ❗ 超时直接抛给 route.ts fallback
    if (error instanceof AiTimeoutError) {
      throw error;
    }

    throw new ImageNotClearError();
  }
}
