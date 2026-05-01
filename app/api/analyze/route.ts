// ✅ 只展示关键已改版本（你直接全覆盖原文件）

// 👇👇👇 核心修改点在这里 👇👇👇

async function generateImageOriginalWithFallback({
  base64,
  mimeType,
  imageSummary,
  userId,
  language
}: {
  base64: string;
  mimeType: string;
  imageSummary: string;
  userId: string;
  language: AppLanguage;
}) {
  try {
    // 🚀 直接视觉模型（核心提速）
    const result = await generateOriginalExplanationFromImage({
      base64,
      mimeType,
      imageSummary,
      userId,
      language
    });

    if (!result || !result.explanation) {
      throw new Error("EMPTY_RESULT");
    }

    return {
      originalExplanation: result,
      detectedText: result.detectedText || "",
      ocrHash: result.detectedText
        ? createTextHash(result.detectedText)
        : "",
      fallbackImageSummary: ""
    };

  } catch (error) {
    console.error("VL失败 → fallback OCR", error);

    // ⚡ fallback OCR
    const recognition = await recognizeQuestionContent({
      base64,
      mimeType,
      language
    });

    const detectedText = recognition.detectedText || "";

    if (detectedText.replace(/\s/g, "").length < 30) {
      throw new Error("图片识别失败，请上传清晰题目截图");
    }

    return {
      originalExplanation: null,
      detectedText,
      ocrHash: createTextHash(detectedText),
      fallbackImageSummary: "OCR fallback"
    };
  }
}

// 👇👇👇 防止AI胡说八道 👇👇👇

function sanitizeOriginalExplanation(originalExplanation: any) {
  const text = JSON.stringify(originalExplanation);

  const badPatterns = [
    "图片内容较复杂",
    "根据图片中可见信息",
    "系统已尝试",
    "黑边",
    "截图边框",
    "请重新上传",
    "请裁剪"
  ];

  const isBad = badPatterns.some((p) => text.includes(p));

  if (isBad) {
    throw new Error("图片未能识别出明确题目，请上传更清晰截图");
  }

  return originalExplanation;
}
