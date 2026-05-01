const LATEX_COMMANDS =
  "frac|sqrt|left|right|cdot|times|Rightarrow|Leftarrow|rightarrow|leftarrow|le|ge|neq|approx|sin|cos|tan|arcsin|arccos|arctan|ln|log|pi|theta|alpha|beta|gamma|Delta|delta|lambda|mu|rho|sigma|omega|vec|mathbf|overline|boxed|angle|triangle|int|sum|lim|text";

function repairBrokenSyntax(input: string) {
  return String(input || "")
    .replace(/\r\n/g, "\n")
    .replace(/\\\(/g, "$")
    .replace(/\\\)/g, "$")
    .replace(/\\\[/g, "$$")
    .replace(/\\\]/g, "$$")
    .replace(/\\\$/g, "$")
    .replace(/\${3,}/g, "$$")
    .replace(/\\frac\s*\$+\s*\{([^{}\n]+)\}\s*\{([^{}\n]+)\}/g, "\\frac{$1}{$2}")
    .replace(/\\frac\{([^{}\n]+)\}\s*\$+\s*\{([^{}\n]+)\}/g, "\\frac{$1}{$2}")
    .replace(/\\frac\s*\$+\s*([^{}\s$]+)\s*\$+\s*([^{}\s$]+)/g, "\\frac{$1}{$2}")
    .replace(/\\frac\s+([A-Za-z0-9])\s+([A-Za-z0-9])/g, "\\frac{$1}{$2}")
    .replace(/\\frac\{([^{}\n]+)\}\s+([A-Za-z0-9])/g, "\\frac{$1}{$2}")
    .replace(/\\frac\s*([A-Za-z0-9])\s*\{([^{}\n]+)\}/g, "\\frac{$1}{$2}")
    .replace(/\\sqrt\s*\$+\s*\{([^{}\n]+)\}/g, "\\sqrt{$1}")
    .replace(/\\sqrt\s*\(([^()\n]+)\)/g, "\\sqrt{$1}")
    .replace(/\\boxed\s*\$+\s*\{([^{}\n]+)\}/g, "\\boxed{$1}")
    .replace(/\\text\s*\$+\s*\{([^{}\n]+)\}/g, "\\text{$1}")
    .replace(/(\})\$+(\\(?:Rightarrow|Leftarrow|rightarrow|leftarrow|cdot|times|le|ge|neq|approx|frac|sqrt|left|right)\b)/g, "$1 $2")
    .replace(/\$+(?=\})/g, "")
    .replace(/\$+\s*([,，。；;:：)）])/g, "$1")
    .replace(/([（(])\s*\$+/g, "$1")
    .replace(/\$+\s*\$+/g, "$$")
    .trim();
}

function hasCjk(value: string) {
  return /[\u4e00-\u9fff]/.test(value);
}

function normalizeInlineDoubleDollar(line: string) {
  const t = line.trim();

  if (t.startsWith("$$") && t.endsWith("$$") && t.length > 4) {
    const inner = t.slice(2, -2).trim();
    if (inner && !hasCjk(inner)) {
      return line;
    }
  }

  return line.replace(/\$\$([\s\S]*?)\$\$/g, (_match, formula: string) => {
    const clean = repairBrokenSyntax(formula).trim();
    return clean ? `$${clean}$` : "";
  });
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

function stripLooseDollars(value: string) {
  const count = (value.match(/\$/g) || []).length;
  return count % 2 === 1 ? value.replace(/\$/g, "") : value;
}

function wrapMath(value: string) {
  const clean = repairBrokenSyntax(value).trim();
  if (!clean) return value;
  if (clean.startsWith("$") && clean.endsWith("$")) return clean;
  return `$${clean}$`;
}

function looksLikeStandaloneMath(line: string) {
  const clean = line.replace(/^[-*]\s*/, "").replace(/^#+\s*/, "").trim();

  if (!clean) return false;
  if (hasCjk(clean)) return false;

  return (
    new RegExp(`\\\\(?:${LATEX_COMMANDS})`).test(clean) ||
    /[A-Za-z0-9)}]\s*[=<>]\s*[A-Za-z0-9\\({]/.test(clean) ||
    /[A-Za-z0-9)}]\s*[+\-*/]\s*[A-Za-z0-9\\({]/.test(clean)
  );
}

function wrapLineMath(line: string) {
  let next = line;

  next = next.replace(
    /(\\left\s*[\(\[\{.][^，。；;\n]*?\\right\s*[\)\]\}.])/g,
    (match) => wrapMath(match)
  );

  return protectExistingMath(next, (text) => {
    let wrapped = text;

    wrapped = wrapped.replace(
      /(\\frac\{[^{}\n]+\}\{[^{}\n]+\}|\\sqrt\{[^{}\n]+\}|\\boxed\{[^{}\n]+\}|\\text\{[^{}\n]+\}|\\vec\{[^{}\n]+\}|\\mathbf\{[^{}\n]+\}|\\overline\{[^{}\n]+\})/g,
      (match) => wrapMath(match)
    );

    wrapped = wrapped.replace(
      new RegExp(`(\\\\(?:angle\\s*[A-Za-z0-9]+|${LATEX_COMMANDS})\\b(?:\\s*[A-Za-z0-9]+)?)`, "g"),
      (match) => wrapMath(match)
    );

    wrapped = wrapped.replace(
      /([A-Za-z][A-Za-z0-9_()]*\s*=\s*[^，。；、\n\u4e00-\u9fff]+)/g,
      (match) => {
        const clean = match.trim();
        if (!/[=^+\-*/\\]/.test(clean)) return match;
        return wrapMath(clean);
      }
    );

    wrapped = wrapped.replace(
      /((?:\\[A-Za-z]+|[A-Za-z0-9_{}()[\]\\^+\-*/=.])+?(?:\\frac|\\sqrt|\\boxed|\\angle|\\pi|\\sin|\\cos|\\tan|\\Rightarrow|=)[A-Za-z0-9_{}()[\]\\^+\-*/=., ]*)/g,
      (match) => {
        const clean = match.trim();
        if (!clean) return match;
        if (hasCjk(clean)) return match;
        return wrapMath(clean);
      }
    );

    wrapped = wrapped.replace(
      /(^|[\s（(，。；、])([A-Za-z])(?=\s*(?:轴|值|坐标|变量|参数|方向|取|为|=|交点|分量|速度|力|质量|加速度|常量|系数))/g,
      (_match, prefix: string, variable: string) => `${prefix}$${variable}$`
    );

    wrapped = wrapped.replace(
      /(^|[\s（(，。；、])([A-Za-z]\^[{]?[0-9A-Za-z+\-]+[}]?)/g,
      (_match, prefix: string, formula: string) => `${prefix}${wrapMath(formula)}`
    );

    return wrapped.replace(/\$\s*\$/g, " ");
  });
}

function cleanupBrokenClosers(text: string) {
  return text
    .replace(/\$\$([,，。；;:：])/g, "$1")
    .replace(/([A-Za-z0-9}\)])\$\$(?=[,，。；;:：])/g, "$1")
    .replace(/([A-Za-z0-9}\)])\$\$(?=\s*$)/gm, "$1")
    .replace(/\$\$---/g, "---")
    .replace(/\$\$\s*$/gm, "");
}

function normalizeLine(line: string) {
  const stage1 = normalizeInlineDoubleDollar(line);
  const repaired = stripLooseDollars(normalizePlainMath(repairBrokenSyntax(stage1)));

  if (looksLikeStandaloneMath(repaired)) {
    const clean = repaired.replace(/\$/g, "").trim();
    return clean ? `$$${clean}$$` : repaired;
  }

  return wrapLineMath(repaired);
}

function normalizeMathBlocks(value: string) {
  return cleanupBrokenClosers(
    value
      .replace(/\$\$([\s\S]*?)\$\$/g, (_match, formula: string) => {
        const fixed = repairBrokenSyntax(formula).trim();
        if (!fixed) return "";
        if (hasCjk(fixed)) return `$${fixed}$`;
        return `$$${fixed}$$`;
      })
      .replace(/\$([^$\n]+)\$/g, (_match, formula: string) => {
        const fixed = repairBrokenSyntax(formula).trim();
        return fixed ? `$${fixed}$` : "";
      })
      .replace(/\$\$\s*\$\$/g, "")
      .replace(/\$\s+\$/g, "")
  );
}

export function normalizeLatexText(input: string) {
  const repaired = repairBrokenSyntax(input);

  const normalized = protectExistingMath(normalizeMathBlocks(repaired), (text) =>
    cleanupBrokenClosers(
      text
        .split("\n")
        .map(normalizeLine)
        .join("\n")
        .trim()
    )
  );

  return normalizeMathBlocks(normalized);
}

export const fixLatex = normalizeLatexText;