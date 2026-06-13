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

function isPlaceholderText(value: string) {
  return /模型未返回|答案已包含|Core method|核心方法|The model did not return|answer is included/i.test(value);
}

function compactRealText(value: string, fallback: string, maxLength: number) {
  const text = normalizeLines(value || "").trim();
  const next = text && !isPlaceholderText(text) ? text : fallback;
  return next.length > maxLength ? next.slice(0, maxLength) : next;
}

function getInlineSection(line: string): { key: NonNullable<ReturnType<typeof getAnalysisSectionKeyFromHeading>>; content: string } | null {
  const match = line.match(/^\s*(?:#{1,6}\s*)?(?:\d+[.)、]\s*)?(.{1,32}?)\s*[:：]\s*(.+?)\s*$/);
  if (!match) return null;

  const key = getAnalysisSectionKeyFromHeading(match[1]);
  if (!key) return null;

  return {
    key,
    content: match[2].trim()
  };
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
    const inlineSection = getInlineSection(line);

    if (inlineSection) {
      if (inlineSection.key === "question") {
        current = "preamble";
        continue;
      }

      current = inlineSection.key;
      sections[current].push(inlineSection.content);
      continue;
    }

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

function extractLikelyAnswer(text: string, language: AppLanguage) {
  const lines = normalizeLines(text)
    .split("\n")
    .map((line) => stripMarkdown(line).trim())
    .filter((line) => line && !isPlaceholderText(line))
    .reverse();

  for (const line of lines) {
    const match = line.match(/(?:最终答案|正确答案|答案|所以|因此|故|可得|得到|Answer|Therefore|Thus)\s*[:：，,]?\s*(.+)$/i);
    const answer = match?.[1]?.trim();

    if (answer && answer.length <= 240) {
      return answer;
    }
  }

  const mathLine = lines.find((line) => /[=<>]|\\frac|\\sqrt|\\pi|\$/.test(line) && line.length <= 240);
  if (mathLine) return mathLine;

  return language === "en" ? "See the conclusion in the explanation." : "见解析结论。";
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
  return language === "en" ? "Original problem method" : "原题方法";
}

function inferTopicFromText(text: string, subject: string, language: AppLanguage) {
  if (language === "en") {
    if (/integral|volume|solid of revolution|\\int/i.test(text)) return "Integral application";
    if (/derivative|differentiate|dy\/dx/i.test(text)) return "Derivatives";
    if (/trigonometric|sin|cos|tan/i.test(text)) return "Trigonometry";
    if (/equation|solve/i.test(text)) return "Equation solving";
    return inferTopic([], subject, language);
  }

  if (/旋转体|体积|积分|\\int|∫/.test(text)) return "旋转体体积与积分";
  if (/导数|微分|求导|dy\/dx|\\frac\{dy\}\{dx\}/.test(text)) return "导数与微分";
  if (/三角|正弦|余弦|sin|cos|tan|\\sin|\\cos|\\tan/.test(text)) return "三角函数";
  if (/方程|解方程|根/.test(text)) return "方程求解";
  if (/函数|图像|坐标/.test(text)) return "函数与图像";

  return inferTopic([], subject, language);
}

function deriveKeySteps(explanation: string, language: AppLanguage) {
  const steps = normalizeLines(explanation)
    .split("\n")
    .map((line) => stripMarkdown(line))
    .filter((line) => line && !isPlaceholderText(line) && !/^\([a-z]\)$/i.test(line))
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
  const steps = Array.isArray(original.steps) ? original.steps : [];
  const formulas = Array.isArray(original.formulas) ? original.formulas : [];
  const warnings = Array.isArray(original.warnings) ? original.warnings : [];

  return cleanAnalysisMarkdown(
    [
      `## ${labels.answer}`,
      original.finalAnswer,
      "",
      `## ${labels.explanation}`,
      original.explanation,
      "",
      steps.length ? `## ${outputLanguage === "en" ? "Detailed Steps" : "详细步骤"}` : "",
      ...steps.map((step, i) => {
        const lines = [`${i + 1}. **${step.title}**: ${step.content}`];
        if (step.formula) lines.push(`   ${outputLanguage === "en" ? "Formula" : "公式"}: ${step.formula}`);
        return lines.join("\n");
      }),
      "",
      formulas.length ? `## ${outputLanguage === "en" ? "Key Formulas" : "关键公式"}` : "",
      ...formulas.map((f) => `- ${f}`),
      "",
      knowledgePoints.length ? `## ${labels.knowledge}` : "",
      ...knowledgePoints.slice(0, 4).map((point) => `- ${point}`),
      "",
      commonMistake ? `## ${labels.mistakes}` : "",
      commonMistake ? `- ${commonMistake}` : "",
      "",
      similarIdeas.length ? `## ${labels.similar}` : "",
      ...similarIdeas.slice(0, 2).map((idea) => `- ${idea}`),
      "",
      warnings.length ? `## ${outputLanguage === "en" ? "Note" : "温馨提示"}` : "",
      ...warnings.map((w) => `- ${w}`)
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
  const preambleSection = joinSection(sections.preamble);
  const fallbackSource = compactRealText(
    [explanationSection, preambleSection, answerSection, normalized].filter(Boolean).join("\n\n"),
    normalized,
    6000
  );
  const knowledgePoints = splitList(sections.knowledge, 4);
  const similarIdeas = splitList(sections.similar, 2);
  const mistakeItems = splitList(sections.mistakes, 2);
  const subject = guessSubject([normalized, markdown].join("\n"), outputLanguage);
  const topic = knowledgePoints.length
    ? inferTopic(knowledgePoints, subject, outputLanguage)
    : inferTopicFromText([normalized, markdown].join("\n"), subject, outputLanguage);
  const explanationFallback = fallbackSource || (
    outputLanguage === "en"
      ? "Use the given conditions and formula to compute the result."
      : "根据题干条件列式计算，整理得到最终答案。"
  );
  const answerFallback = answerSection && !isPlaceholderText(answerSection)
    ? answerSection
    : extractLikelyAnswer(fallbackSource || normalized || markdown, outputLanguage);
  const explanation = compactRealText(explanationSection, explanationFallback, 6000);
  const finalAnswer = compactRealText(answerSection, answerFallback, 2000);
  const detectedText = compactRealText([finalAnswer, explanation].filter(Boolean).join("\n\n"), topic, 2500);
  const keySteps = deriveKeySteps(explanationSection || fallbackSource || answerSection, outputLanguage);

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
    similarIdeas,
    steps: [],
    formulas: [],
    warnings: []
  };
}
