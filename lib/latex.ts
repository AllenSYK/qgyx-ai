const LATEX_COMMANDS =
  "frac|sqrt|left|right|cdot|times|Rightarrow|Leftarrow|rightarrow|leftarrow|le|ge|neq|approx|sin|cos|tan|arcsin|arccos|arctan|ln|log|pi|theta|alpha|beta|gamma|Delta|delta|lambda|mu|rho|sigma|omega|vec|mathbf|overline|angle|triangle|int|sum|lim|text";

function repairBrokenSyntax(input: string) {
  return String(input || "")
    .replace(/\\\$/g, "$")
    .replace(/\\\(/g, "$")
    .replace(/\\\)/g, "$")
    .replace(/\\\[/g, "$$")
    .replace(/\\\]/g, "$$")
    .replace(/\r\n/g, "\n")
    .replace(/\${3,}/g, "$$")
    .replace(/\\frac\s*\$+\s*\{([^{}\n]+)\}\s*\{([^{}\n]+)\}/g, "\\frac{$1}{$2}")
    .replace(/\\frac\{([^{}\n]+)\}\s*\$+\s*\{([^{}\n]+)\}/g, "\\frac{$1}{$2}")
    .replace(/\\frac\s*\$+\s*([^{}\s$]+)\s*\$+\s*([^{}\s$]+)/g, "\\frac{$1}{$2}")
    .replace(/\\frac\s+([A-Za-z0-9])\s+([A-Za-z0-9])/g, "\\frac{$1}{$2}")
    .replace(/\\frac\{([^{}\n]+)\}\s+([A-Za-z0-9])/g, "\\frac{$1}{$2}")
    .replace(/\\frac\s*([A-Za-z0-9])\s*\{([^{}\n]+)\}/g, "\\frac{$1}{$2}")
    .replace(/\\sqrt\s*\$+\s*\{([^{}\n]+)\}/g, "\\sqrt{$1}")
    .replace(/\\sqrt\s*\(([^()\n]+)\)/g, "\\sqrt{$1}")
    .replace(/\\([a-zA-Z]+)\s*\$+(?=\{|\(|\[|\\|[A-Za-z0-9])/g, "\\$1")
    .replace(/\$+(\\(?:Rightarrow|Leftarrow|rightarrow|leftarrow|cdot|times|le|ge|neq|approx)\b)/g, "$1")
    .replace(/(\})\$+(\\(?:Rightarrow|Leftarrow|rightarrow|leftarrow|cdot|times|le|ge|neq|approx|frac|sqrt|left|right)\b)/g, "$1 $2")
    .replace(/\$+(?=\})/g, "")
    .replace(/\$+\s*([,，。；;:：)）])/g, "$1")
    .replace(/([（(])\s*\$+/g, "$1")
    .replace(/\$+\s*\$+/g, "$$")
    .trim();
}

function convertInlineDisplayDollars(line: string) {
  const trimmed = line.trim();

  if (trimmed.startsWith("$$") && trimmed.endsWith("$$") && trimmed.length > 4) {
    return line;
  }

  // AI 经常把 $$ 放进中文句子里，这里把它降级成普通待修复文本。
  return line.replace(/\$\$/g, "");
}

function hasChinese(value: string) {
  return /[\u4e00-\u9fff]/.test(value);
}

function protectExistingMath(input: string, transform: (value: string) => string) {
  const saved: string[] = [];

  let text = input.replace(/(```[\s\S]*?```|`[^`\n]*`|\$\$[\s\S]*?\$\$|\$[^$\n]*\$)/g, (match) => {
    const token = `@@QGYX_MATH_${saved.length}@@`;
    saved.push(match);
    return token;
  });

  text = transform(text);

  saved.forEach((value, index) => {
    text = text.split(`@@QGYX_MATH_${index}@@`).join(value);
  });

  return text;
}

function normalizePlainMath(value: string) {
  return value
    .replace(/\bsqrt\s*\(([^()\n]+)\)/gi, (_match, body: string) => `\\sqrt{${body.trim()}}`)
    .replace(
      /(^|[^\\A-Za-z0-9])([A-Za-z])\^(\{?[0-9A-Za-z+\-]+\}?)/g,
      (_match, prefix: string, base: string, exponent: string) => `${prefix}${base}^${exponent}`
    )
    .replace(
      /(^|[^\\0-9])(\d{1,4})\s*\/\s*(\d{1,4})(?![\\0-9])/g,
      (_match, prefix: string, numerator: string, denominator: string) => {
        if (denominator === "0") return `${prefix}${numerator}/${denominator}`;
        return `${prefix}\\frac{${numerator}}{${denominator}}`;
      }
    );
}

function stripBrokenLooseDollars(value: string) {
  const dollarCount = (value.match(/\$/g) || []).length;

  if (dollarCount % 2 === 1) {
    return value.replace(/\$/g, "");
  }

  return value;
}

function wrapMath(value: string) {
  const clean = repairBrokenSyntax(value).trim();

  if (!clean) return value;
  if (clean.startsWith("$") && clean.endsWith("$")) return clean;

  return `$${clean}$`;
}

function looksLikeStandaloneMath(line: string) {
  const clean = line
    .replace(/^[-*]\s*/, "")
    .replace(/^#+\s*/, "")
    .trim();

  if (!clean) return false;
  if (hasChinese(clean)) return false;

  return (
    new RegExp(`\\\\(?:${LATEX_COMMANDS})`).test(clean) ||
    /[A-Za-z0-9)}]\s*[=<>]\s*[A-Za-z0-9\\({]/.test(clean) ||
    /[A-Za-z0-9)}]\s*[+\-*/]\s*[A-Za-z0-9\\({]/.test(clean)
  );
}

function wrapChineseLineMath(line: string) {
  let next = line;

  // 整段坐标/区间/角度括号：\left( ... \right)
  next = next.replace(
    /(\\left\s*[\(\[\{.][^，。；;\n]*?\\right\s*[\)\]\}.])/g,
    (match) => wrapMath(match)
  );

  return protectExistingMath(next, (text) => {
    let wrapped = text;

    // 长公式：从 \frac/\sin/\cos/\angle 等开始，到中文标点前结束
    wrapped = wrapped.replace(
      new RegExp(`((?:\\\\(?:${LATEX_COMMANDS})|[A-Za-z0-9_.{}()[\\]\\\\+\\-*/=<>\\s])+\\\\(?:${LATEX_COMMANDS})(?:[A-Za-z0-9_.{}()[\\]\\\\+\\-*/=<>\\s])*)`, "g"),
      (match) => {
        const clean = match.trim();
        if (clean.length < 2) return match;
        if (!/[\\=+\-*/^_<>]/.test(clean)) return match;
        return wrapMath(clean);
      }
    );

    // 裸 \frac{a}{b}、\sqrt{x}、\text{cm}
    wrapped = wrapped.replace(
      /(\\frac\{[^{}\n]+\}\{[^{}\n]+\}|\\sqrt\{[^{}\n]+\}|\\text\{[^{}\n]+\}|\\vec\{[^{}\n]+\}|\\mathbf\{[^{}\n]+\}|\\overline\{[^{}\n]+\})/g,
      (match) => wrapMath(match)
    );

    // 裸 \angle OAB、\pi、\Rightarrow、\cdot
    wrapped = wrapped.replace(
      new RegExp(`(\\\\(?:angle\\s*[A-Za-z0-9]+|${LATEX_COMMANDS})\\b(?:\\s*[A-Za-z0-9]+)?)`, "g"),
      (match) => wrapMath(match)
    );

    // 中文中的等式：OB = 3.4、AB = 1.9、x = 0
    wrapped = wrapped.replace(
      /([A-Za-z][A-Za-z0-9_]*\s*=\s*[^，。；、\n\u4e00-\u9fff]+)/g,
      (match) => {
        if (!/[=^+\-*/\\]/.test(match)) return match;
        return wrapMath(match);
      }
    );

    // 单变量数学/物理符号：x 轴、y 轴、F、v、m、a、k
    wrapped = wrapped.replace(
      /(^|[\s（(，。；、])([A-Za-z])(?=\s*(?:轴|值|坐标|变量|参数|方向|取|为|=|交点|分量|速度|力|质量|加速度|常量|系数))/g,
      (_match, prefix: string, variable: string) => `${prefix}$${variable}$`
    );

    // 幂次：x^2
    wrapped = wrapped.replace(
      /(^|[\s（(，。；、])([A-Za-z]\^[{]?[0-9A-Za-z+\-]+[}]?)/g,
      (_match, prefix: string, formula: string) => `${prefix}${wrapMath(formula)}`
    );

    return wrapped.replace(/\$\s*\$/g, " ");
  });
}

function normalizeLine(line: string) {
  const noInlineDisplay = convertInlineDisplayDollars(line);
  const repaired = stripBrokenLooseDollars(normalizePlainMath(repairBrokenSyntax(noInlineDisplay)));

  if (looksLikeStandaloneMath(repaired)) {
    const clean = repaired.replace(/\$/g, "").trim();
    return clean ? `$$${clean}$$` : repaired;
  }

  return wrapChineseLineMath(repaired);
}

function normalizeMathBlocks(value: string) {
  return value
    .replace(/\$\$([\s\S]*?)\$\$/g, (_match, formula: string) => {
      const fixed = repairBrokenSyntax(formula).trim();
      return fixed ? `$$${fixed}$$` : "";
    })
    .replace(/\$([^$\n]+)\$/g, (_match, formula: string) => {
      const fixed = repairBrokenSyntax(formula).trim();
      return fixed ? `$${fixed}$` : "";
    })
    .replace(/\$\$\s*\$\$/g, "")
    .replace(/\$\s+\$/g, "");
}

export function normalizeLatexText(input: string) {
  const repaired = repairBrokenSyntax(input);

  const normalized = protectExistingMath(normalizeMathBlocks(repaired), (text) =>
    text
      .split("\n")
      .map(normalizeLine)
      .join("\n")
      .trim()
  );

  return normalizeMathBlocks(normalized);
}

export const fixLatex = normalizeLatexText;