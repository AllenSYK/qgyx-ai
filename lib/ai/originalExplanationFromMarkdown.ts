import "server-only";

import type { OriginalExplanation } from "@/lib/ai/schema";
import { normalizeLanguage, type AppLanguage } from "@/lib/language";

const NOT_CLEAR_PATTERN = /题目不清晰|无法可靠识别|看不清题目|无法识别题目|未能识别出明确题目|IMAGE_NOT_CLEAR/i;

function normalizeLines(text: string) {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

function stripMarkdown(text: string) {
  return normalizeLines(text)
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+[.)、]\s*/gm, "")
    .trim();
}

function sectionAfter(markdown: string, labels: string[]) {
  const escapedLabels = labels.map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const labelPattern = escapedLabels.join("|");
  const regex = new RegExp(
    `(?:^|\\n)\\s*(?:#{1,6}\\s*)?(?:\\d+[.)、]\\s*)?(?:${labelPattern})\\s*[:：]?\\s*\\n?`,
    "i"
  );
  const match = regex.exec(markdown);

  if (!match) {
    return "";
  }

  const start = (match.index || 0) + match[0].length;
  const rest = markdown.slice(start);
  const next = rest.search(/\n\s*(?:#{1,6}\s*)?(?:\d+[.)、]\s*)?(?:识别到的题目|题目|最终答案|答案|分步骤解析|解析|涉及知识点|知识点|易错点|常见错误|Question|Final Answer|Answer|Solution|Steps|Knowledge|Common Mistakes)\s*[:：]?/i);
  return stripMarkdown(next >= 0 ? rest.slice(0, next) : rest);
}

function splitList(text: string, fallback: string[]) {
  const items = normalizeLines(text)
    .split(/\n+/)
    .map((line) => stripMarkdown(line).replace(/^[:：]/, "").trim())
    .filter(Boolean);

  return (items.length > 0 ? items : fallback).slice(0, 4);
}

function guessSubject(text: string, language: AppLanguage) {
  if (/函数|方程|几何|代数|概率|导数|积分|三角|向量|矩阵|坐标|Math|Equation|Geometry/i.test(text)) {
    return language === "en" ? "Mathematics" : "数学";
  }

  if (/电路|力学|速度|加速度|电压|电流|磁场|Physics/i.test(text)) {
    return language === "en" ? "Physics" : "物理";
  }

  if (/化学|反应|溶液|离子|方程式|元素|Chemistry/i.test(text)) {
    return language === "en" ? "Chemistry" : "化学";
  }

  return language === "en" ? "General" : "综合";
}

function guessTopic(text: string, subject: string, language: AppLanguage) {
  const knowledge = sectionAfter(text, ["涉及知识点", "知识点", "Knowledge Points", "Knowledge"]);

  if (knowledge) {
    return splitList(knowledge, [subject])[0] || subject;
  }

  return language === "en" ? "Question analysis" : "题目解析";
}

function compact(value: string, fallback: string, maxLength: number) {
  const text = stripMarkdown(value || "").trim();
  const next = text || fallback;
  return next.length > maxLength ? next.slice(0, maxLength) : next;
}

export function isImageNotClearMarkdown(markdown: string) {
  return NOT_CLEAR_PATTERN.test(markdown);
}

export function markdownFromOriginalExplanation(original: OriginalExplanation) {
  const knowledgePoints = Array.isArray(original.knowledgePoints) && original.knowledgePoints.length > 0
    ? original.knowledgePoints
    : [original.topic].filter(Boolean);

  return [
    "## Answer",
    original.finalAnswer,
    "",
    "## Explanation",
    original.explanation,
    "",
    "## Key Points",
    ...knowledgePoints.slice(0, 4).map((point) => `- ${point}`),
    "",
    "## Common Mistakes",
    original.commonMistake,
    "",
    "## Similar Ideas",
    ...original.similarIdeas.slice(0, 2).map((idea) => `- ${idea}`)
  ].join("\n").trim();
}

export function createOriginalExplanationFromMarkdown(markdown: string, language: AppLanguage = "zh"): OriginalExplanation {
  const outputLanguage = normalizeLanguage(language);
  const normalized = normalizeLines(markdown);
  const subject = guessSubject(normalized, outputLanguage);
  const topic = guessTopic(normalized, subject, outputLanguage);
  const detectedText = compact(
    sectionAfter(normalized, ["识别到的题目", "题目", "Question"]),
    normalized.slice(0, 1200),
    4000
  );
  const finalAnswer = compact(
    sectionAfter(normalized, ["最终答案", "答案", "Final Answer", "Answer"]),
    outputLanguage === "en" ? "See the solution above." : "见解析。",
    4000
  );
  const explanationSection = sectionAfter(normalized, ["分步骤解析", "解析", "Solution", "Steps"]);
  const explanation = explanationSection || normalized || finalAnswer;
  const knowledgeText = sectionAfter(normalized, ["涉及知识点", "知识点", "Knowledge Points", "Knowledge"]);
  const mistakeText = sectionAfter(normalized, ["易错点", "常见错误", "Common Mistakes"]);
  const keySteps = splitList(explanationSection, [
    outputLanguage === "en" ? "Read the question carefully." : "识别题干条件。",
    outputLanguage === "en" ? "Determine the relevant concept." : "确定考查知识点。",
    outputLanguage === "en" ? "Solve step by step." : "按步骤完成推导。",
    outputLanguage === "en" ? "Check the final answer." : "核对最终答案。"
  ]);
  const knowledgePoints = splitList(knowledgeText, [topic]);

  return {
    title: compact(detectedText.split("\n")[0] || topic, topic, 120),
    detectedText,
    subject,
    topic,
    difficulty: "medium",
    finalAnswer,
    explanation: compact(explanation, explanation, 12000),
    keySteps,
    knowledgePoints,
    commonMistake: compact(
      mistakeText,
      outputLanguage === "en" ? "Be careful with conditions and calculation details." : "注意审题条件和关键计算步骤。",
      1200
    ),
    similarIdeas: keySteps.slice(0, 3)
  };
}
