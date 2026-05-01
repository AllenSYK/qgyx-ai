import "server-only";

import {
  WRONG_EXPLANATION_JSON_SHAPE,
  WrongExplanationSchema,
  type OriginalExplanation,
  type QuizQuestion,
  type WrongExplanation
} from "@/lib/ai/schema";
import { robustParseAiJson } from "@/lib/ai/jsonRepair";
import { postQwenChatCompletion, QWEN_TEXT_MODEL, readAssistantText, type ChatMessage } from "@/lib/ai/qwen";
import { languageInstruction, mathOutputInstruction, normalizeLanguage, type AppLanguage } from "@/lib/language";

export async function generateWrongExplanation({
  question,
  userAnswer,
  originalExplanation,
  language = "zh"
}: {
  question: QuizQuestion;
  userAnswer: "A" | "B" | "C" | "D";
  originalExplanation: OriginalExplanation;
  language?: AppLanguage;
}): Promise<WrongExplanation> {
  const outputLanguage = normalizeLanguage(language);
  const messages: ChatMessage[] = [
    {
      role: "system",
      content: `你是一个专业的错题解析助手。
用户做错了一道 Quiz，请根据题目、正确答案和用户选择，生成针对性错题解析。

要求：
1. 只输出 JSON
2. 不要 Markdown
3. 不要代码块
4. 不要输出 JSON 以外内容
4.1 不要输出 \`\`\`json
4.2 字符串内双引号必须转义
4.3 LaTeX 反斜杠必须双写，例如 \\frac、\\sqrt
5. 只解释这一道错题
6. 必须说明用户为什么错
7. 必须给正确思路
8. 不要生成新题目
9. 不要解释答对的题目
10. ${languageInstruction(outputLanguage)}
11. ${mathOutputInstruction}

输出 JSON 格式必须为：
${WRONG_EXPLANATION_JSON_SHAPE}`
    },
    {
      role: "user",
      content: `Quiz 题目：
${JSON.stringify(question, null, 2)}

用户选择：${userAnswer}
正确答案：${question.correctAnswer}

原题解析：
${JSON.stringify(originalExplanation, null, 2)}

输出语言：${outputLanguage}`
    }
  ];

  const fallback: WrongExplanation = {
    questionId: question.id,
    userAnswer,
    correctAnswer: question.correctAnswer,
    whyWrong: "已生成基础解析，请核对题干条件后继续：本题可能是关键条件、公式或选项判断出现偏差。",
    explanation: "请先回到题干，标出已知条件，再对照正确答案使用对应方法重新推导。",
    correctMethod: "按题干条件列式，逐步计算或推理，并用正确答案反查每一步。",
    similarTip: "遇到同类题时，先判断知识点，再检查单位、符号和选项差异。"
  };

  let rawText = "";

  try {
    const data = await postQwenChatCompletion({
      model: QWEN_TEXT_MODEL,
      messages,
      temperature: 0.2,
      enable_thinking: false,
      max_tokens: 1200,
      timeoutMs: 20000
    });
    rawText = readAssistantText(data);
  } catch (error) {
    console.error("generate_wrong_explanation_failed", {
      question_id: question.id,
      error: error instanceof Error ? error.message : "unknown"
    });
    return fallback;
  }

  return robustParseAiJson(
    rawText,
    WrongExplanationSchema,
    fallback
  );
}
