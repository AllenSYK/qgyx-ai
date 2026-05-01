import "server-only";

import {
  WRONG_EXPLANATION_JSON_SHAPE,
  WrongExplanationSchema,
  type OriginalExplanation,
  type QuizQuestion,
  type WrongExplanation
} from "@/lib/ai/schema";
import { robustParseAiJson } from "@/lib/ai/jsonRepair";
import { cleanWrongExplanationMath } from "@/lib/ai/mathFormat";
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
  const fallback: WrongExplanation =
    outputLanguage === "en"
      ? {
          questionId: question.id,
          userAnswer,
          correctAnswer: question.correctAnswer,
          whyWrong: "The selected option does not match the key condition or calculation in this question.",
          explanation: "Re-read the given condition, write the matching formula, and compare each option with the computed result.",
          correctMethod: "Use the condition from the question, calculate step by step, and keep the final unit or sign consistent.",
          similarTip: "For similar questions, identify the target quantity first, then check signs, units, and option wording."
        }
      : {
          questionId: question.id,
          userAnswer,
          correctAnswer: question.correctAnswer,
          whyWrong: "所选选项与本题关键条件或计算结果不一致。",
          explanation: "先回到题干标出已知条件，再列出对应公式，并逐项对照选项。",
          correctMethod: "按题干条件列式，逐步计算或推理，最后检查符号、单位或范围。",
          similarTip: "遇到同类题时，先判断要求的量，再检查符号、单位和选项差异。"
        };
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
10. 不要输出 Thinking、Reasoning、Chain of Thought、内部分析、自我纠错、<think> 标签
11. ${languageInstruction(outputLanguage)}
12. ${mathOutputInstruction}
13. whyWrong、explanation、correctMethod、similarTip 中能写成公式或标准数学符号的内容必须写成数学形式。
14. 内容要短，每个字段 1-2 句

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

  let rawText = "";

  try {
    const data = await postQwenChatCompletion({
      model: QWEN_TEXT_MODEL,
      messages,
      temperature: 0.05,
      enable_thinking: false,
      max_tokens: 800,
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

  const parsed = await robustParseAiJson(
    rawText,
    WrongExplanationSchema,
    fallback
  );

  return cleanWrongExplanationMath(parsed);
}
