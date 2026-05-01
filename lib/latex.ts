function repairBrokenLatex(input: string) {
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
    .replace(/(\})\$+(\\(?:Rightarrow|Leftarrow|rightarrow|leftarrow|cdot|times|le|ge|neq|approx|frac|sqrt)\b)/g, "$1 $2")
    .replace(/\$+(\\(?:Rightarrow|Leftarrow|rightarrow|leftarrow|cdot|times|le|ge|neq|approx)\b)/g, "$1")
    .replace(/\$+(?=\})/g, "")
    .replace(/\$+\s*,/g, ",")
    .replace(/\$+\s*，/g, "，")
    .replace(/\$+\s*。/g, "。")
    .replace(/\$+\s*；/g, "；")
    .replace(/\$+\s*:/g, ":")
    .replace(/\$+\s*：/g, "：")
    .replace(/\$+\s*\)/g, ")")
    .replace(/\(\s*\$+/g, "(")
    .replace(/\$+\s*\$+/g, "$$")
    .trim();
}

function protectBlocks(input: string, transform: (value: string) => string) {
  const saved: string[] = [];

  let text = input.replace(/(```[\s\S]*?```|`[^`\n]*`|\$\$[\s\S]*?\$\$|\$[^$\n]*\$)/g, (match) => {
    const token = `@@QGYX_LATEX_${saved.length}@@`;
    saved.push(match);
    return token;
  });

  text = transform(text);

  saved.forEach((value, index) => {
    text = text.split(`@@QGYX_LATEX_${index}@@`).join(value);
  });

  return text;
}

function normalizePlainMath(value: string) {
  return value
    .replace(/\bsqrt\s*\(([^()\n]+)\)/gi, (_match, body: string) => `\\sqrt{${body.trim()}}`)
    .replace(
      /(?<![\\\w])([A-Za-z])\^(\{?[0-9A-Za-z+\-]+\}?)/g,
      (_match, base: string, exponent: string) => `${base}^${exponent}`
    )
    .replace(
      /(?<![\\\d])(\d{1,4})\s*\/\s*(\d{1,4})(?![\\\d])/g,
      (_match, numerator: string, denominator: string) => {
        if (denominator === "0") return `${numerator}/${denominator}`;
        return `\\frac{${numerator}}{${denominator}}`;
      }
    );
}

function stripLooseDollars(value: string) {
  const count = (value.match(/\$/g) || []).length;

  if (count % 2 === 1) {
    return value.replace(/\$/g, "");
  }

  return value;
}

function hasChinese(value: string) {
  return /[\u4e00-\u9fff]/.test(value);
}

function looksLikeStandaloneMath(line: string) {
  const clean = line
    .replace(/^[-*]\s*/, "")
    .replace(/^#+\s*/, "")
    .trim();

  if (!clean) return false;
  if (hasChinese(clean)) return false;

  return (
    /\\(?:frac|sqrt|cdot|times|Rightarrow|rightarrow|leftarrow|sin|cos|tan|ln|log|int|sum|lim|vec|mathbf)/.test(clean) ||
    /[A-Za-z0-9)]\s*[=<>]\s*[A-Za-z0-9\\(]/.test(clean) ||
    /[A-Za-z0-9)]\s*[+\-*/]\s*[A-Za-z0-9\\(]/.test(clean)
  );
}

function wrapMathToken(token: string) {
  const clean = token.trim();

  if (!clean) return token;
  if (clean.startsWith("$") && clean.endsWith("$")) return clean;

  return `$${clean}$`;
}

function wrapInlineMath(line: string) {
  let next = line;

  next = next.replace(
    /(\\frac\{[^{}\n]+\}\{[^{}\n]+\}|\\sqrt\{[^{}\n]+\}|\\(?:Rightarrow|Leftarrow|rightarrow|leftarrow|cdot|times|le|ge|neq|approx|sin|cos|tan|ln|log|pi|theta|alpha|beta|gamma|Delta)\b)/g,
    (match) => wrapMathToken(match)
  );

  next = next.replace(
    /(?<![$\\])\b([A-Za-z]\s*=\s*[^，。；、\n]+)/g,
    (match) => {
      if (match.includes("$")) return match;
      if (!/[=^+\-*/\\]/.test(match)) return match;
      return wrapMathToken(match);
    }
  );

  next = next.replace(
    /(?<![$\\])\b([A-Za-z]\^[{]?[0-9A-Za-z+\-]+[}]?)/g,
    (_match, formula: string) => wrapMathToken(formula)
  );

  next = next.replace(/\$\s*\$/g, " ");

  return next;
}

function normalizeLine(line: string) {
  const repaired = stripLooseDollars(normalizePlainMath(repairBrokenLatex(line)));

  if (looksLikeStandaloneMath(repaired)) {
    const clean = repaired.replace(/\$/g, "").trim();
    return clean ? `$$${clean}$$` : repaired;
  }

  return wrapInlineMath(repaired);
}

export function normalizeLatexText(input: string) {
  const repaired = repairBrokenLatex(input);

  return protectBlocks(repaired, (text) =>
    text
      .split("\n")
      .map(normalizeLine)
      .join("\n")
      .replace(/\$\$\s*\$\$/g, "")
      .replace(/\$\s+\$/g, "")
      .replace(/\$([^$\n]+)\$/g, (_match, formula: string) => `$${repairBrokenLatex(formula).trim()}$`)
      .replace(/\$\$([\s\S]*?)\$\$/g, (_match, formula: string) => `$$${repairBrokenLatex(formula).trim()}$$`)
      .trim()
  );
}

export const fixLatex = normalizeLatexText;