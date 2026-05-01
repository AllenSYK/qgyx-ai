import "server-only";

import { readFile } from "fs/promises";
import fontkit from "@pdf-lib/fontkit";
import { degrees, PDFDocument, PDFFont, rgb, StandardFonts } from "pdf-lib";
import type { OriginalExplanation, QuizResult, WrongExplanation } from "@/lib/ai/schema";
import { mathTextToPdfText } from "@/lib/math-format";
import { normalizeLanguage, type AppLanguage } from "@/lib/language";

type PdfFontBundle = {
  font: PDFFont;
  boldFont: PDFFont;
  supportsUnicode: boolean;
};

type PdfJobPayload = {
  id: string;
  original_explanation: OriginalExplanation | null;
  quiz_result: QuizResult | null;
  quiz_answers?: Record<string, string> | null;
  wrong_explanations?: Record<string, WrongExplanation> | null;
  language?: string | null;
  created_at?: string | null;
};

const DEFAULT_FONT_URL =
  "https://cdn.jsdelivr.net/gh/notofonts/noto-cjk@Sans2.004/Sans/OTF/SimplifiedChinese/NotoSansCJKsc-Regular.otf";

async function loadFonts(pdfDoc: PDFDocument): Promise<PdfFontBundle> {
  const fontUrl = process.env.PDF_FONT_URL || DEFAULT_FONT_URL;
  const localCandidates = [
    process.env.PDF_FONT_PATH,
    "C:/Windows/Fonts/msyh.ttc",
    "C:/Windows/Fonts/simhei.ttf",
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
    "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc",
    "/usr/share/fonts/truetype/noto/NotoSansSC-Regular.otf"
  ].filter(Boolean) as string[];

  for (const localPath of localCandidates) {
    try {
      const bytes = await readFile(localPath);
      pdfDoc.registerFontkit(fontkit);
      const font = await pdfDoc.embedFont(bytes, { subset: true });

      return {
        font,
        boldFont: font,
        supportsUnicode: true
      };
    } catch {
      continue;
    }
  }

  try {
    const response = await fetch(fontUrl);

    if (!response.ok) {
      throw new Error(`Font fetch failed: ${response.status}`);
    }

    const bytes = await response.arrayBuffer();
    pdfDoc.registerFontkit(fontkit);
    const font = await pdfDoc.embedFont(bytes, { subset: true });

    return {
      font,
      boldFont: font,
      supportsUnicode: true
    };
  } catch (error) {
    console.warn("PDF CJK font unavailable, falling back to Helvetica:", error);
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    return {
      font,
      boldFont,
      supportsUnicode: false
    };
  }
}

function safeText(value: unknown, supportsUnicode: boolean) {
  const text = String(value ?? "");
  return supportsUnicode ? text : text.replace(/[^\x20-\x7E]/g, "?");
}

function wrapText(text: string, font: PDFFont, fontSize: number, maxWidth: number) {
  const normalized = text.replace(/\s+/g, " ").trim();
  const words = normalized.includes(" ") ? normalized.split(" ") : Array.from(normalized);
  const lines: string[] = [];
  let current = "";

  words.forEach((word) => {
    const next = current ? `${current}${normalized.includes(" ") ? " " : ""}${word}` : word;

    if (font.widthOfTextAtSize(next, fontSize) <= maxWidth) {
      current = next;
      return;
    }

    if (current) {
      lines.push(current);
    }

    current = word;
  });

  if (current) {
    lines.push(current);
  }

  return lines.length > 0 ? lines : [""];
}

export async function createAnalysisPdf({
  job,
  watermark
}: {
  job: PdfJobPayload;
  watermark: boolean;
}) {
  const pdfDoc = await PDFDocument.create();
  const fonts = await loadFonts(pdfDoc);
  const margin = 48;
  const pageWidth = 595.28;
  const pageHeight = 841.89;
  let page = pdfDoc.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;

  function addPageIfNeeded(required = 60) {
    if (y - required > margin) {
      return;
    }

    page = pdfDoc.addPage([pageWidth, pageHeight]);
    y = pageHeight - margin;
  }

  function drawWatermark() {
    if (!watermark) {
      return;
    }

    page.drawText(safeText("空与梦 AI生成", fonts.supportsUnicode), {
      x: 150,
      y: 380,
      size: 38,
      font: fonts.boldFont,
      color: rgb(0.78, 0.82, 0.88),
      opacity: 0.32,
      rotate: degrees(32)
    });
  }

  function text(value: unknown) {
    return safeText(value, fonts.supportsUnicode);
  }

  function drawHeading(value: string, size = 20) {
    addPageIfNeeded(48);
    drawWatermark();
    page.drawText(text(value), {
      x: margin,
      y,
      size,
      font: fonts.boldFont,
      color: rgb(0.06, 0.09, 0.16)
    });
    y -= size + 16;
  }

  function drawParagraph(value: unknown, size = 10.5, color = rgb(0.22, 0.27, 0.36)) {
    const content = text(mathTextToPdfText(String(value || "-")));
    const lines = wrapText(content, fonts.font, size, pageWidth - margin * 2);

    lines.forEach((line) => {
      addPageIfNeeded(20);
      drawWatermark();
      page.drawText(line, {
        x: margin,
        y,
        size,
        font: fonts.font,
        color
      });
      y -= size + 6;
    });

    y -= 6;
  }

  function drawSection(title: string, body?: unknown) {
    addPageIfNeeded(72);
    page.drawRectangle({
      x: margin - 6,
      y: y - 6,
      width: pageWidth - margin * 2 + 12,
      height: 26,
      color: rgb(0.96, 0.98, 1),
      borderColor: rgb(0.86, 0.9, 0.96),
      borderWidth: 0.5
    });
    page.drawText(text(title), {
      x: margin,
      y,
      size: 12,
      font: fonts.boldFont,
      color: rgb(0.1, 0.25, 0.55)
    });
    y -= 28;

    if (body !== undefined) {
      drawParagraph(body);
    }
  }

  const original = job.original_explanation;
  const quiz = job.quiz_result;
  const answers = job.quiz_answers || {};
  const wrongExplanations = job.wrong_explanations || {};
  const language = normalizeLanguage(job.language);
  const labels = getPdfLabels(language);

  drawWatermark();
  drawHeading(original?.title || labels.title, 22);
  drawParagraph(`Job ID: ${job.id}`);
  drawParagraph(`${labels.generatedAt}: ${new Intl.DateTimeFormat(language === "en" ? "en-US" : "zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(new Date())}`);

  drawSection(labels.detectedText, original?.detectedText);
  drawSection(labels.originalExplanation, original?.explanation);
  drawSection(labels.keySteps, (original?.keySteps || []).map((step, index) => `${index + 1}. ${step}`).join("\n"));
  drawSection(labels.finalAnswer, original?.finalAnswer);
  drawSection(labels.topic, `${original?.subject || "-"} / ${original?.topic || "-"}`);
  drawSection(labels.commonMistake, original?.commonMistake);

  if (quiz?.questions?.length) {
    drawHeading(labels.quiz, 18);
    quiz.questions.forEach((question, index) => {
      drawSection(`${labels.question} ${index + 1}`, question.question);
      drawParagraph(question.options.map((option, optionIndex) => `${String.fromCharCode(65 + optionIndex)}. ${option}`).join("  "));
      drawParagraph(`${labels.userAnswer}: ${answers[question.id] || labels.notAnswered}    ${labels.correctAnswer}: ${question.correctAnswer}`);

      const wrong = wrongExplanations[question.id];
      if (wrong) {
        drawParagraph(`${labels.whyWrong}: ${wrong.whyWrong}`);
        drawParagraph(`${labels.correctMethod}: ${wrong.correctMethod}`);
        drawParagraph(`${labels.explanation}: ${wrong.explanation}`);
        drawParagraph(`${labels.similarTip}: ${wrong.similarTip}`);
      }
    });
  }

  return pdfDoc.save();
}

function getPdfLabels(language: AppLanguage) {
  if (language === "en") {
    return {
      title: "AI Study Report",
      generatedAt: "Generated at",
      detectedText: "Detected Text",
      originalExplanation: "Original Explanation",
      keySteps: "Key Steps",
      finalAnswer: "Final Answer",
      topic: "Topic",
      commonMistake: "Common Mistake",
      quiz: "Quiz Practice",
      question: "Question",
      userAnswer: "Your answer",
      correctAnswer: "Correct answer",
      notAnswered: "Not answered",
      whyWrong: "Why it was wrong",
      correctMethod: "Correct method",
      explanation: "Explanation",
      similarTip: "Transfer tip"
    };
  }

  return {
    title: "AI 学习解析报告",
    generatedAt: "生成时间",
    detectedText: "原题识别内容",
    originalExplanation: "原题解析",
    keySteps: "解题步骤",
    finalAnswer: "最终答案",
    topic: "知识点",
    commonMistake: "易错提醒",
    quiz: "Quiz 练习",
    question: "题目",
    userAnswer: "你的答案",
    correctAnswer: "正确答案",
    notAnswered: "未作答",
    whyWrong: "错因",
    correctMethod: "正确思路",
    explanation: "解析",
    similarTip: "相似题提醒"
  };
}
