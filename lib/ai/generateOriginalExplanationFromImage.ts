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
import { postQwenChatCompletion, QWEN_VL_MODEL, readAssistantText, type ChatMessage } from "@/lib/ai/qwen";
import { languageInstruction, mathOutputInstruction, normalizeLanguage, type AppLanguage } from "@/lib/language";

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

  const messages: ChatMessage[] = [
    {
      role: "system",
      content: `你是一个专业的 AI 视觉学习解析助手。
你必须直接观察用户上传的整张图片，并完成题目解析。

最高优先级规则：
1. 只分析图片里的真实题干、公式、图形、坐标轴、表格、选项和文字。
2. 静默忽略与题目无关的截图界面元素，不要在答案里提到它们。
3. 禁止要求用户裁剪或换图。
4. 禁止在任何字段输出这些兜底废话：图片内容较复杂、根据图片中可见信息、系统已尝试、黑边、浏览器边框或手机截图边框不是题目内容、请重新上传、请裁剪。
5. 如果无法确定具体题目，所有字段都输出 ${UNRECOGNIZABLE_QUESTION_MARKER}。
6. 不要把操作建议当成答案。

输出要求：
1. 只输出 JSON。
2. 不要 Markdown。
3. 不要代码块。
4. 不要输出 JSON 以外的解释文字。
5. 不要输出 \`\`\`json。
6. 字符串内双引号必须转义。
7. LaTeX 反斜杠必须双写，例如 \\\\frac、\\\\sqrt、\\\\pi。
8. 必须识别题干、公式、选项、图像信息、坐标轴、几何图形或表格文字。
9. 如果是数学题，必须给出完整解法。
10. keySteps 最多 8 条。
11. similarIdeas 最多 6 条，写同类题迁移思路。
12. 不要生成 Quiz。
13. 不要生成练习题。
14. ${languageInstruction(outputLanguage)}
15. ${mathOutputInstruction}

输出 JSON 格式必须为：
${ORIGINAL_EXPLANATION_JSON_SHAPE}`
    },
    {
      role: "user",
      content: [
        {
          type: "text",
          text: `请直接根据图片生成原题解析。

你必须分析：
- 题干
- 公式
- 图形
- 选项
- 坐标轴
- 表格文字

图像摘要：
${imageSummary || "请从图片中识别题目本身并完成解析。"}

输出语言：
${outputLanguage}

用户 ID（仅用于内部追踪，不要写入结果）：
${userId || "anonymous"}`
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

  const fallback: OriginalExplanation = {
    title: UNRECOGNIZABLE_QUESTION_MARKER,
    detectedText: UNRECOGNIZABLE_QUESTION_MARKER,
    subject: "综合",
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
      model: QWEN_VL_MODEL,
      messages,
      temperature: 0.08,
      enable_thinking: false,
      max_tokens: 3800,
      timeoutMs: 30000
    });

    rawText = readAssistantText(data);
  } catch (error) {
    console.error("generate_original_explanation_from_image_failed", {
      user_id: userId || null,
      error: error instanceof Error ? error.message : "unknown"
    });

    throw new Error("AI 视觉解析失败，请稍后重试。");
  }

  const parsed = await robustParseAiJson(rawText, OriginalExplanationSchema, fallback);
  return assertUsableOriginalExplanation(parsed);
}
