/* Display-only token colors. All source stays text; no source HTML is interpreted. */
window.SourceCodeView = {
  paint(text, kind = "text") {
    const out = document.createDocumentFragment();
    if (text.length > 20000) {
      out.append(document.createTextNode(text));
      return out;
    }
    const pattern =
      kind === "html"
        ? /(<!--[\s\S]*?-->|<\/?[A-Za-z][\w:-]*|\/?>|[\w:-]+(?=\s*=)|"[^"\n]*"|'[^'\n]*'|&(?:#\w+|\w+);)/g
        : /(\/\/[^\n]*|\/\*.*?\*\/|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`[^`]*`|#[\da-fA-F]{3,8}\b|\b(?:const|let|var|function|return|if|else|async|await|import|export|from|class|new|throw|try|catch|true|false|null|undefined)\b|\b\d+(?:\.\d+)?(?:px|rem|em|vh|vw|ms|s)?\b|[A-Za-z_$][\w$-]*(?=\s*\())/g;
    let last = 0;
    for (const match of text.matchAll(pattern)) {
      if (match.index > last)
        out.append(document.createTextNode(text.slice(last, match.index)));
      const token = match[0],
        span = document.createElement("span");
      span.textContent = token;
      span.className =
        "source-token " +
        (/^\/\/|^\/\*|^<!--/.test(token)
          ? "token-comment"
          : /^['"`]/.test(token)
            ? "token-string"
            : /^<|^\/?>(?:$)/.test(token)
              ? "token-tag"
              : /^\d|^#[\da-f]/.test(token)
                ? "token-number"
                : kind === "html"
                  ? "token-attribute"
                  : "token-keyword");
      out.append(span);
      last = match.index + token.length;
    }
    if (last < text.length) out.append(document.createTextNode(text.slice(last)));
    return out;
  },
};
