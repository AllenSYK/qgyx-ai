import "server-only";

import type { OriginalExplanation } from "@/lib/ai/schema";
import type { MembershipTier } from "@/lib/ai/qwen";

export type MathValidationResult = {
  valid: boolean;
  warnings: string[];
  needsRetry: boolean;
};

const ENABLE_VALIDATION = process.env.AI_ENABLE_MATH_VALIDATION !== "false";

const KNOWN_ISSUE_PATTERNS: Array<{
  pattern: RegExp;
  warning: string;
}> = [
  {
    pattern: /k\s*=\s*13\s*\/\s*4/,
    warning:
      "根据题目 y = 4x^3 + 2/x + 9 计算，k 应为 16；若标准答案为 13/4，请检查题目原式是否识别错误。"
  },
  {
    pattern: /12x\^?\{?4\}?\s*\+\s*5x\^?\{?2\}?\s*-\s*2\s*=\s*0(?!\s*[\n.]*(?:令|let|u\s*=))/i,
    warning: "解析停在中间式 12x^4 + 5x^2 - 2 = 0，应继续令 u = x^2 完成推导。"
  }
];

function checkKnownIssues(text: string): string[] {
  const warnings: string[] = [];
  for (const issue of KNOWN_ISSUE_PATTERNS) {
    if (issue.pattern.test(text)) {
      warnings.push(issue.warning);
    }
  }
  return warnings;
}

function checkStepsConsistency(explanation: OriginalExplanation): string[] {
  const warnings: string[] = [];
  const steps = explanation.keySteps || [];
  const answer = (explanation.finalAnswer || "").trim();
  const explText = (explanation.explanation || "").trim();

  if (steps.length < 2 && explText.length > 50) {
    warnings.push("解题步骤不足，推导过程可能不完整。");
  }

  if (answer && explText && !explText.includes(answer.replace(/[=$\s]/g, ""))) {
    const answerClean = answer.replace(/[^0-9a-zA-Z/.]/g, "");
    if (answerClean.length > 1 && !explText.replace(/[^0-9a-zA-Z/.]/g, "").includes(answerClean)) {
      warnings.push("最终答案与推导过程可能存在不一致。");
    }
  }

  if (/\\frac\{[^}]*\}(?!\{)/.test(JSON.stringify(explanation))) {
    warnings.push("存在未闭合的 LaTeX \\frac 公式。");
  }

  return warnings;
}

function checkIncompleteDerivation(explanation: OriginalExplanation): boolean {
  const fullText = [
    explanation.explanation,
    explanation.finalAnswer,
    ...(explanation.keySteps || [])
  ].join(" ");

  const incompletePatterns = [
    /\d+x\^?\{?\d*\}?\s*[+\-]\s*\d+x\^?\{?\d*\}?\s*=\s*0\s*$/m,
    /令\s*[uU]\s*=.*$/m,
    /解[得的]\s*$/,
    /so\s*$/i,
    /therefore\s*$/i
  ];

  for (const pattern of incompletePatterns) {
    if (pattern.test(fullText.trim())) {
      return true;
    }
  }

  if (/12x\^?\{?4\}?/.test(fullText) && !/u\s*=\s*1\s*\/\s*4|u\s*=\s*\\frac\{1\}\{4\}/.test(fullText)) {
    return true;
  }

  return false;
}

export function validateMathAnswer(
  questionText: string,
  aiExplanation: OriginalExplanation,
  tier: MembershipTier
): MathValidationResult {
  if (!ENABLE_VALIDATION) {
    return { valid: true, warnings: [], needsRetry: false };
  }

  const allText = JSON.stringify(aiExplanation);
  const warnings: string[] = [];

  warnings.push(...checkKnownIssues(allText));
  warnings.push(...checkStepsConsistency(aiExplanation));

  const isIncomplete = checkIncompleteDerivation(aiExplanation);
  if (isIncomplete) {
    warnings.push("推导过程可能未完成，缺少最终结论。");
  }

  const needsRetry = tier === "max" && (isIncomplete || warnings.length > 2);
  const hasSeriousWarning = warnings.some(
    (w) => w.includes("k 应为 16") || w.includes("停在中间式") || w.includes("未完成")
  );

  return {
    valid: !hasSeriousWarning,
    warnings,
    needsRetry: needsRetry || (tier !== "free" && hasSeriousWarning)
  };
}

export function shouldValidateForTier(tier: MembershipTier): boolean {
  if (tier === "max") return true;
  if (tier === "pro") return true;
  return false;
}
