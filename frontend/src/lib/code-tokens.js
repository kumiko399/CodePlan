const words = {
  java: "abstract assert boolean break byte case catch char class const continue default do double else enum extends final finally float for if implements import instanceof int interface long native new null package private protected public return short static strictfp super switch synchronized this throw throws transient try void volatile while true false var record",
  javascript:
    "async await break case catch class const continue debugger default delete do else export extends false finally for from function if import in instanceof let new null of return static super switch this throw true try typeof var void while yield",
  python:
    "and as assert async await break class continue def del elif else except False finally for from global if import in is lambda None nonlocal not or pass raise return True try while with yield",
  cpp: "auto bool break case catch char class const constexpr continue default delete do double else enum explicit extern false float for friend if inline int long namespace new nullptr operator private protected public return short signed sizeof static struct switch template this throw true try typedef typename union unsigned using virtual void volatile while",
};
// Text tokens are rendered through Vue interpolation; no HTML is ever generated.
export function codeTokens(code, language) {
  if (!words[language]) return [{ text: code, type: "plain" }];
  const keywords = new Set(words[language].split(" "));
  const pattern =
    language === "python"
      ? /#[^\n]*|"""[\s\S]*?(?:"""|$)|'''[\s\S]*?(?:'''|$)|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\b\d+(?:\.\d+)?\b|\b[A-Za-z_]\w*\b/g
      : /\/\/[^\n]*|\/\*[\s\S]*?(?:\*\/|$)|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\b\d+(?:\.\d+)?\b|\b[A-Za-z_]\w*\b/g;
  const result = [];
  let cursor = 0;
  for (const match of code.matchAll(pattern)) {
    if (match.index > cursor)
      result.push({ text: code.slice(cursor, match.index), type: "plain" });
    const text = match[0],
      type = /^(\/\/|\/\*|#)/.test(text)
        ? "comment"
        : /^["'`]/.test(text)
          ? "string"
          : /^\d/.test(text)
            ? "number"
            : keywords.has(text)
              ? "keyword"
              : "plain";
    result.push({ text, type });
    cursor = match.index + text.length;
  }
  if (cursor < code.length)
    result.push({ text: code.slice(cursor), type: "plain" });
  return result;
}
