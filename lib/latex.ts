const COMMANDS =
  "frac|sqrt|left|right|cdot|times|Rightarrow|Leftarrow|rightarrow|leftarrow|le|ge|neq|approx|sin|cos|tan|ln|log|pi|theta|alpha|beta|gamma|Delta|delta|lambda|mu|rho|sigma|omega|vec|mathbf|overline|angle|triangle|int|sum|lim";

function repairBrokenLatex(input: string) {
  return String(input || "")
    .replace(/\\\$/g, "$")
    .replace(/\\\(/g, "$")
    .replace(/\\\)/g, "$")
    .replace(/\\\[/g, "$$")
    .replace(/\\\]/g, "$$")
    .replace(/\r\n/g, "\n")
    .replace(/\${3,}/g, "$$")
    .replace(/\\frac\$+\{([^{}\n]+)\}\{([^{}\n]+)\}/g, "\\frac{$1}{$2}")
    .replace(/\\frac\{([^{}\n]+)\}\$+\{([^{}\n]+)\}/g, "\\frac{$1}{$2}")
    .replace(/\\frac\s*\$+\s*([^{}\s$]+)\s*\$+\s*([^{}\s$]+)/g, "\\frac{$1}{$2}")
    .replace(/\\frac\s+([A-Za-z0-9])\s+([A-Za-z0-9])/g, "\\frac{$1}{$2}")
    .replace(/\\frac\{([^{}\n]+)\}\s+([A-Za-z0-9])/g, "\\frac{$1}{$2}")
    .replace(/\\frac\s*([A-Za-z0-9])\s*\{([^{}\n]+)\}/g, "\\frac{$1}{$2}")
    .replace(/\\sqrt\s*\$+\s*\{([^{}\n]+)\}/g, "\\sqrt{$1}")
    .replace(/\\sqrt\s*\(([^()\n]+)\)/g, "\\sqrt{$1}")
    .replace(/\\([a-zA-Z]+)\s*\$+(?=\{|\(|\[|\\|[A-Za-z0-9])/g, "\\$1")
    .replace(/(\})\$+(\\(?:Rightarrow|Leftarrow|rightarrow|leftarrow|cdot|times|le|ge|neq|approx|frac|sqrt|left|right)\b)/g, "$1 $2")
    .replace(/\$+(\\(?:Rightarrow|Leftarrow|rightarrow|leftarrow|cdot|times|le|ge|neq|approx)\b)/g, "$1")
    .replace(/\$+(?=\})/g, "")
    .replace(/\$+\s*([,，。；;:：)）])/g, "$1")
    .replace(/([（(])\s*\$+/g, "$1")
    .replace(/\$+\s*\$+/g, "$$")
    .trim();
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
  const count = (value.match(/\$/g) || []).length;
  return count % 2 === 1 ? value.replace(/\$/g, "") : value;
}

function hasChinese(value: string) {
  return /[\u4e00-\u9fff]/.test(value);
}

function isAlreadyMath(value: string) {
  const trimmed = value.trim();
  return trimmed.startsWith("$") && trimmed.endsWith("$");
}

function wrapMath(value: string) {
  const clean = repairBrokenLatex(value).trim();

  if (!clean) return value;
  if (isAlreadyMath(clean)) return clean;

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
    new RegExp(`\\\\(?:${COMMANDS})`).test(clean) ||
    /[A-Za-z0-9)}]\s*[=<>]\s*[A-Za-z0-9\\({]/.test(clean) ||
    /[A-Za-z0-9)}]\s*[+\-*/]\s*[A-Za-z0-9\\({]/.test(clean)
  );
}

function wrapLatexGroupsInChineseLine(line: string) {
  let next = line;

  // \left( ... \right) 这种坐标、区间、括号表达式必须整段包起来
  next = next.replace(
    /(\\left\s*[\(\[\{.][^，。；;\n]*?\\right\s*[\)\]\}.])/g,
    (match) => wrapMath(match)
  );

  return protectExistingMath(next, (text) => {
    // 裸 \frac{a}{b}、\sqrt{x}、\vec{a} 等
    let wrapped = text.replace(
      /(\\frac\{[^{}\n]+\}\{[^{}\n]+\}|\\sqrt\{[^{}\n]+\}|\\vec\{[^{}\n]+\}|\\mathbf\{[^{}\n]+\}|\\overline\{[^{}\n]+\})/g,
      (match) => wrapMath(match)
    );

    // 裸命令：\Rightarrow、\cdot、\times 等
    wrapped = wrapped.replace(
      new RegExp(`(\\\\(?:${COMMANDS})\\b)`, "g"),
      (match) => wrapMath(match)
    );

    // 中文句子里的等式，例如 x = 0、y = k - 5x
    wrapped = wrapped.replace(
      /([A-Za-z][A-Za-z0-9_]*\s*=\s*[^，。；、\n\u4e00-\u9fff]+)/g,
      (match) => {
        if (!/[=^+\-*/\\]/.test(match)) return match;
        return wrapMath(match);
      }
    );

    // 坐标轴、变量、参数等单字符数学符号：x 轴、y 轴、k 值
    wrapped = wrapped.replace(
      /(^|[\s（(，。；、])([A-Za-z])(?=\s*(?:轴|值|坐标|变量|参数|方向|取|为|=|轴交点))/g,
      (_match, prefix: string, variable: string) => `${prefix}$${variable}$`
    );

    // 单独的幂次：x^2
    wrapped = wrapped.replace(
      /(^|[\s（(，。；、])([A-Za-z]\^[{]?[0-9A-Za-z+\-]+[}]?)/g,
      (_match, prefix: string, formula: string) => `${prefix}${wrapMath(formula)}`
    );

    return wrapped.replace(/\$\s*\$/g, " ");
  });
}

function normalizeLine(line: string) {
  const repaired = stripBrokenLooseDollars(normalizePlainMath(repairBrokenLatex(line)));

  if (looksLikeStandaloneMath(repaired)) {
    const clean = repaired.replace(/\$/g, "").trim();
    return clean ? `$$${clean}$$` : repaired;
  }

  return wrapLatexGroupsInChineseLine(repaired);
}

function normalizeMathBlocks(value: string) {
  return value
    .replace(/\$\$([\s\S]*?)\$\$/g, (_match, formula: string) => {
      const fixed = repairBrokenLatex(formula).trim();
      return fixed ? `$$${fixed}$$` : "";
    })
    .replace(/\$([^$\n]+)\$/g, (_match, formula: string) => {
      const fixed = repairBrokenLatex(formula).trim();
      return fixed ? `$${fixed}$` : "";
    });
}

export function normalizeLatexText(input: string) {
  const repaired = repairBrokenLatex(input);

  const normalized = protectExistingMath(normalizeMathBlocks(repaired), (text) =>
    text
      .split("\n")
      .map(normalizeLine)
      .join("\n")
      .replace(/\$\$\s*\$\$/g, "")
      .replace(/\$\s+\$/g, "")
      .trim()
  );

  return normalizeMathBlocks(repaired.includes("\\left") || repaired.includes("\\right") ? normalized : normalized);
}

export const fixLatex = normalizeLatexText;