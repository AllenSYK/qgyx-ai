import "server-only";

import type { OriginalExplanation } from "@/lib/ai/schema";

export const UNRECOGNIZABLE_QUESTION_MARKER = "UNRECOGNIZABLE_QUESTION";

const BAD_FINAL_RESPONSE_PATTERN =
  /图片内容较复杂|根据图片中可见信息|根据可见信息|系统已尝试|黑边|浏览器边框|手机截图边框|请重新上传|请裁剪|裁剪黑边|题目区域识别失败|识别失败|更聚焦的题目图片/;

const UNRECOGNIZED_PATTERN = /无法识别|未能识别|未识别到题目|题目识别不完整|UNRECOGNIZABLE_QUESTION/;

export class ImageNotClearError extends Error {
  constructor(message = "图片未能识别出明确题目，请上传更清晰的题目截图。") {
    super(message);
    this.name = "ImageNotClearError";
  }
}

export function containsBadFinalResponseText(...values: unknown[]) {
  return BAD_FINAL_RESPONSE_PATTERN.test(
    values
      .flatMap((value) => (Array.isArray(value) ? value : [value]))
      .filter(Boolean)
      .join(" ")
  );
}

export function normalizeOriginalExplanationShape(explanation: OriginalExplanation): OriginalExplanation {
  const keySteps = Array.isArray(explanation.keySteps) && explanation.keySteps.length > 0
    ? explanation.keySteps
    : ["提取题干条件", "确定考查知识点", "按步骤完成推导", "核对最终答案"];
  const similarIdeas =
    Array.isArray(explanation.similarIdeas) && explanation.similarIdeas.length > 0
      ? explanation.similarIdeas
      : [];
  const knowledgePoints =
    Array.isArray(explanation.knowledgePoints) && explanation.knowledgePoints.length > 0
      ? explanation.knowledgePoints
      : [explanation.topic].filter(Boolean);

  return {
    ...explanation,
    keySteps: keySteps.slice(0, 4),
    knowledgePoints: knowledgePoints.slice(0, 4),
    similarIdeas: similarIdeas.slice(0, 3)
  };
}

export function isUsableOriginalExplanation(explanation: OriginalExplanation | null | undefined) {
  if (!explanation) {
    return false;
  }

  const normalized = normalizeOriginalExplanationShape(explanation);
  const joined = [
    normalized.title,
    normalized.detectedText,
    normalized.subject,
    normalized.topic,
    normalized.knowledgePoints,
    normalized.explanation,
    normalized.finalAnswer,
    normalized.commonMistake,
    normalized.keySteps,
    normalized.similarIdeas
  ].join(" ");

  if (containsBadFinalResponseText(joined) || UNRECOGNIZED_PATTERN.test(joined)) {
    return false;
  }

  const detectedText = normalized.detectedText.replace(/\s+/g, "");
  const explanationText = normalized.explanation.replace(/\s+/g, "");
  const answerText = normalized.finalAnswer.replace(/\s+/g, "");

  return detectedText.length >= 4 && explanationText.length >= 12 && answerText.length >= 1;
}

export function assertUsableOriginalExplanation(explanation: OriginalExplanation) {
  const normalized = normalizeOriginalExplanationShape(explanation);

  if (!isUsableOriginalExplanation(normalized)) {
    throw new Error("无法识别图片中的具体题目，请提供更清晰、完整的题目图片。");
  }

  return normalized;
}
