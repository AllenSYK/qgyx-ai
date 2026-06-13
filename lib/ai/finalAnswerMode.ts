import "server-only";

import type { ChatMessage } from "@/lib/ai/qwen";

export const FINAL_ANSWER_OUTPUT_RULES = `【最终答案输出规则】
你是一个严谨的学习解析助手。你必须先在内部完成理解、计算、检查和修正，然后只输出最终整理后的答案。
禁止输出任何草稿、犹豫、自我反驳、自我纠错、重新思考过程。
不要出现“等等”“不对”“我重新看”“刚才错了”“应该不是”“先试一下”等表达。
同时禁止输出“刚才算错了”“算错了”“换一种思路”“可能是”“让我检查一下”“抱歉，前面有误”等表达。
如果发现自己内部推理有问题，请直接修正后输出最终版本，不要告诉用户你修正过。
答案必须像老师写好的正式解析一样自然、稳定、一次成型，简洁清楚。
数学表达必须使用规范 LaTeX，公式必须包裹在 $...$ 或 $$...$$ 中，禁止裸公式。
如果是题目解析，结构固定为：
1. 题目
2. 过程
3. 答案

如果是错题讲解，结构固定为：
1. 错误原因
2. 正确做法
3. 正确答案
4. 下次避免方法`;

const DRAFT_OUTPUT_PATTERNS = [
  /<think>[\s\S]*?<\/think>/gi,
  /<\/?think[^>]*>/gi,
  /<thinking>[\s\S]*?<\/thinking>/gi,
  /<\/?thinking[^>]*>/gi,
  /不对[，,。！？!\s]*/g,
  /等等[，,。！？!\s]*/g,
  /我重新看(?:一下)?[，,。！？!\s]*/g,
  /我再看(?:一下)?[，,。！？!\s]*/g,
  /重新(?:思考|检查|计算)(?:一下)?[，,。！？!\s]*/g,
  /再(?:思考|检查|计算)(?:一下)?[，,。！？!\s]*/g,
  /刚才(?:算错了|错了|有误)?[，,。！？!\s]*/g,
  /前面(?:的)?(?:推导|计算|答案)?(?:有误|不对|错了)[，,。！？!\s]*/g,
  /算错了[，,。！？!\s]*/g,
  /应该不是[，,。！？!\s]*/g,
  /这里(?:有误|不对|错了)[，,。！？!\s]*/g,
  /换一种思路[，,。！？!\s]*/g,
  /先试一下[，,。！？!\s]*/g,
  /可能是[，,。！？!\s]*/g,
  /让我检查(?:一下)?[，,。！？!\s]*/g,
  /我(?:来)?(?:检查|验证)(?:一下)?[，,。！？!\s]*/g,
  /(?:更正|修正)(?:一下)?[：:，,。！？!\s]*/g,
  /抱歉，?前面有误[，,。！？!\s]*/g,
  /(?:思考过程|推理过程|内部分析|草稿|自我检查|自我纠错)[：:][^\n]*(?:\n|$)/gi,
  /let me (?:think|check|recheck|recalculate)[^.!?\n]*(?:[.!?]\s*)?/gi,
  /I (?:need to|will) (?:think|check|recheck|recalculate)[^.!?\n]*(?:[.!?]\s*)?/gi,
  /(?:thinking process|reasoning process|internal analysis|chain of thought)[^.!?\n]*(?:[.!?]\s*)?/gi,
  /(?:wait|actually),?\s+(?:that'?s|this is|I was)[^.!?\n]*(?:[.!?]\s*)?/gi
];

export function appendFinalAnswerRules(systemPrompt: string) {
  const prompt = String(systemPrompt || "").trim();

  if (prompt.includes("【最终答案输出规则】")) {
    return prompt;
  }

  return `${prompt}\n\n${FINAL_ANSWER_OUTPUT_RULES}`.trim();
}

function isChatMessage(value: unknown): value is ChatMessage {
  if (!value || typeof value !== "object") {
    return false;
  }

  const message = value as Partial<ChatMessage>;
  return message.role === "system" || message.role === "user" || message.role === "assistant";
}

export function applyFinalAnswerRulesToMessages(messages: unknown) {
  if (!Array.isArray(messages)) {
    return messages;
  }

  let hasSystemMessage = false;
  const nextMessages = messages.map((message) => {
    if (!isChatMessage(message) || message.role !== "system") {
      return message;
    }

    hasSystemMessage = true;

    if (typeof message.content !== "string") {
      return message;
    }

    return {
      ...message,
      content: appendFinalAnswerRules(message.content)
    };
  });

  if (hasSystemMessage) {
    return nextMessages;
  }

  return [
    {
      role: "system",
      content: FINAL_ANSWER_OUTPUT_RULES
    },
    ...nextMessages
  ];
}

export function applyFinalAnswerRulesToPayload<T extends Record<string, unknown>>(payload: T): T {
  if (!Array.isArray(payload.messages)) {
    return payload;
  }

  return {
    ...payload,
    messages: applyFinalAnswerRulesToMessages(payload.messages)
  };
}

export function cleanFinalAnswerChunk(input: string) {
  let output = String(input || "");

  for (const pattern of DRAFT_OUTPUT_PATTERNS) {
    output = output.replace(pattern, "");
  }

  return output.replace(/[ \t]{2,}/g, " ");
}
