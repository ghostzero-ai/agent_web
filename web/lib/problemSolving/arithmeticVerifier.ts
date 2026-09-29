import type { ToolVerification } from "@/lib/problemSolving/domain";

type Token = { type: "number"; value: number } | { type: "operator"; value: string };

function tokenize(expression: string): Token[] | null {
  const normalized = expression.replaceAll("×", "*").replaceAll("÷", "/").replace(/\s+/gu, "");
  if (!normalized || normalized.length > 200 || /[^0-9.+\-*/()]/u.test(normalized)) return null;
  const tokens: Token[] = [];
  let index = 0;
  while (index < normalized.length) {
    const character = normalized[index];
    if (/[0-9.]/u.test(character)) {
      const match = /^(?:\d+(?:\.\d*)?|\.\d+)/u.exec(normalized.slice(index));
      if (!match) return null;
      const value = Number(match[0]);
      if (!Number.isFinite(value)) return null;
      tokens.push({ type: "number", value });
      index += match[0].length;
    } else {
      tokens.push({ type: "operator", value: character });
      index += 1;
    }
  }
  return tokens;
}

function calculate(tokens: Token[]): number | null {
  let position = 0;
  const parsePrimary = (): number | null => {
    const token = tokens[position];
    if (!token) return null;
    if (token.type === "operator" && (token.value === "+" || token.value === "-")) {
      position += 1;
      const value = parsePrimary();
      return value === null ? null : token.value === "-" ? -value : value;
    }
    if (token.type === "operator" && token.value === "(") {
      position += 1;
      const value = parseExpression();
      if (tokens[position]?.type !== "operator" || tokens[position]?.value !== ")") return null;
      position += 1;
      return value;
    }
    if (token.type !== "number") return null;
    position += 1;
    return token.value;
  };
  const parseTerm = (): number | null => {
    let value = parsePrimary();
    if (value === null) return null;
    while (true) {
      const token = tokens[position];
      if (token?.type !== "operator" || !["*", "/"].includes(token.value)) break;
      const operator = token.value;
      position += 1;
      const right = parsePrimary();
      if (right === null || (operator === "/" && right === 0)) return null;
      value = operator === "*" ? value * right : value / right;
    }
    return value;
  };
  const parseExpression = (): number | null => {
    let value = parseTerm();
    if (value === null) return null;
    while (true) {
      const token = tokens[position];
      if (token?.type !== "operator" || !["+", "-"].includes(token.value)) break;
      const operator = token.value;
      position += 1;
      const right = parseTerm();
      if (right === null) return null;
      value = operator === "+" ? value + right : value - right;
    }
    return value;
  };
  const result = parseExpression();
  return result !== null && position === tokens.length && Number.isFinite(result) ? result : null;
}

function expressionCandidate(problemText: string): string | null {
  const matches = problemText.match(/[\d.()\s+\-*/×÷]{3,}/gu) ?? [];
  return matches
    .map((value) => value.trim())
    .filter((value) => /\d/u.test(value) && /[+\-*/×÷]/u.test(value))
    .sort((left, right) => right.length - left.length)[0] ?? null;
}

function numericAnswer(answer: string | null): number | null {
  if (!answer) return null;
  const trimmed = answer.trim().replace(/[,，]/gu, "");
  const exact = /^[-+]?\d+(?:\.\d+)?$/u.exec(trimmed);
  if (exact) return Number(exact[0]);
  const ending = /(?:(?:答案|结果)(?:是|为)?|等于|=)\s*([-+]?\d+(?:\.\d+)?)\s*$/u.exec(trimmed);
  return ending ? Number(ending[1]) : null;
}

export function verifyBasicArithmetic(
  problemText: string,
  userAnswer: string | null,
): ToolVerification {
  const expression = expressionCandidate(problemText);
  if (!expression) {
    return {
      status: "not_applicable",
      expression: null,
      expected: null,
      submitted: numericAnswer(userAnswer),
      note: "该题未识别为可由基础算术解析器独立核验的表达式。",
    };
  }
  const tokens = tokenize(expression);
  const expected = tokens ? calculate(tokens) : null;
  if (expected === null) {
    return {
      status: "invalid",
      expression,
      expected: null,
      submitted: numericAnswer(userAnswer),
      note: "识别到算术表达式，但解析器无法安全计算。",
    };
  }
  const submitted = numericAnswer(userAnswer);
  if (submitted === null) {
    return {
      status: "verified",
      expression,
      expected,
      submitted: null,
      note: `基础算术解析器独立计算结果为 ${expected}。`,
    };
  }
  const matches = Math.abs(expected - submitted) <= Math.max(1e-9, Math.abs(expected) * 1e-9);
  return {
    status: matches ? "verified" : "mismatch",
    expression,
    expected,
    submitted,
    note: matches
      ? "用户数值答案与基础算术解析器结果一致。"
      : "用户数值答案与基础算术解析器结果不一致。",
  };
}
