import "server-only";

import { cleanAnalysisMarkdown, getAnalysisSectionKeyFromHeading } from "@/lib/analysisMarkdown";
import type { OriginalExplanation } from "@/lib/ai/schema";
import { normalizeLanguage, type AppLanguage } from "@/lib/language";

const NOT_CLEAR_PATTERN = /题目不清晰|无法可靠识别|看不清题目|无法识别题目|未能识别出明确题目|IMAGE_NOT_CLEAR/i;

type ParsedSections = {
  preamble: string[];
  answer: string[];
  explanation: string[];
  knowledge: string[];
  mistakes: string[];
  similar: string[];
};

function normalizeLines(text: string) {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function stripMarkdown(text: string) {
  return normalizeLines(text)
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+[.)、]\s*/gm, "")
    .trim();
}

function compact(value: string, fallback: string, maxLength: number) {
  const text = normalizeLines(value || "").trim();
  const next = text || fallback;
  return next.length > maxLength ? next.slice(0, maxLength) : next;
}

function splitSections(markdown: string): ParsedSections {
  const sections: ParsedSections = {
    preamble: [],
    answer: [],
    explanation: [],
    knowledge: [],
    mistakes: [],
    similar: []
  };
  let current: keyof ParsedSections = "preamble";

  for (const line of normalizeLines(markdown).split("\n")) {
    const key = getAnalysisSectionKeyFromHeading(line);

    if (key === "question") {
      current = "preamble";
      continue;
    }

    if (key) {
      current = key;
      continue;
    }

    sections[current].push(line);
  }

  return sections;
}

function joinSection(lines: string[]) {
  return normalizeLines(lines.join("\n"));
}

function splitList(lines: string[], maxItems: number) {
  return lines
    .flatMap((line) => line.split(/\n+/))
    .map((line) => stripMarkdown(line).replace(/^[:：]/, "").trim())
    .filter(Boolean)
    .slice(0, maxItems);
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

function inferTopic(knowledgePoints: string[], subject: string, language: AppLanguage) {
  const firstPoint = knowledgePoints[0]?.trim();
  if (firstPoint) return compact(stripMarkdown(firstPoint), subject, 80);
  if (subject !== (language === "en" ? "General" : "综合")) return subject;
  return language === "en" ? "Core method" : "核心方法";
}

function deriveKeySteps(explanation: string, language: AppLanguage) {
  const steps = normalizeLines(explanation)
    .split("\n")
    .map((line) => stripMarkdown(line))
    .filter((line) => line && !/^\([a-z]\)$/i.test(line))
    .slice(0, 4);

  if (steps.length > 0) return steps;

  return [
    language === "en" ? "Use the conditions in the problem." : "代入题目中的关键条件。",
    language === "en" ? "Apply the matching formula or theorem." : "使用对应公式或定理。",
    language === "en" ? "Write the final result clearly." : "整理得到最终结果。"
  ];
}

function languageLabels(language: AppLanguage) {
  if (language === "en") {
    return {
      answer: "Answer",
      explanation: "Explanation",
      knowledge: "Key Points",
      mistakes: "Common Mistakes",
      similar: "Similar Ideas"
    };
  }

  return {
    answer: "答案",
    explanation: "解析",
    knowledge: "知识点",
    mistakes: "易错点",
    similar: "类似题思路"
  };
}

export function isImageNotClearMarkdown(markdown: string) {
  return NOT_CLEAR_PATTERN.test(markdown);
}

export function markdownFromOriginalExplanation(original: OriginalExplanation, language: AppLanguage = "zh") {
  const outputLanguage = normalizeLanguage(language);
  const labels = languageLabels(outputLanguage);
  const knowledgePoints = Array.isArray(original.knowledgePoints) ? original.knowledgePoints.filter(Boolean) : [];
  const similarIdeas = Array.isArray(original.similarIdeas) ? original.similarIdeas.filter(Boolean) : [];
  const commonMistake = String(original.commonMistake || "").trim();

  return cleanAnalysisMarkdown(
    [
      `## ${labels.answer}`,
      original.finalAnswer,
      "",
      `## ${labels.explanation}`,
      original.explanation,
      "",
      knowledgePoints.length ? `## ${labels.knowledge}` : "",
      ...knowledgePoints.slice(0, 4).map((point) => `- ${point}`),
      "",
      commonMistake ? `## ${labels.mistakes}` : "",
      commonMistake ? `- ${commonMistake}` : "",
      "",
      similarIdeas.length ? `## ${labels.similar}` : "",
      ...similarIdeas.slice(0, 2).map((idea) => `- ${idea}`)
    ]
      .filter((line, index, items) => line || (items[index - 1] && items[index + 1]))
      .join("\n"),
    outputLanguage
  );
}

export function createOriginalExplanationFromMarkdown(markdown: string, language: AppLanguage = "zh"): OriginalExplanation {
  const outputLanguage = normalizeLanguage(language);
  const normalized = cleanAnalysisMarkdown(markdown, outputLanguage);
  const sections = splitSections(normalized);
  const answerSection = joinSection(sections.answer);
  const explanationSection = joinSection(sections.explanation);
  const knowledgePoints = splitList(sections.knowledge, 4);
  const similarIdeas = splitList(sections.similar, 2);
  const mistakeItems = splitList(sections.mistakes, 2);
  const subject = guessSubject(normalized, outputLanguage);
  const topic = inferTopic(knowledgePoints, subject, outputLanguage);
  const explanationFallback =
    outputLanguage === "en"
      ? "The model did not return a separate explanation section."
      : "模型未返回单独解析段，已保留答案段中的结论。";
  const answerFallback =
    outputLanguage === "en"
      ? "The answer is included in the explanation conclusion."
      : "答案已包含在解析结论中。";
  const explanation = compact(explanationSection, explanationFallback, 6000);
  const finalAnswer = compact(answerSection, answerFallback, 2000);
  const detectedText = compact([finalAnswer, explanation].filter(Boolean).join("\n\n"), topic, 2500);
  const keySteps = deriveKeySteps(explanationSection || answerSection, outputLanguage);

  return {
    title: compact(stripMarkdown(topic), subject, 120),
    detectedText,
    subject,
    topic,
    difficulty: "medium",
    finalAnswer,
    explanation,
    keySteps,
    knowledgePoints,
    commonMistake: mistakeItems.join("\n"),
    similarIdeas
  };
}
