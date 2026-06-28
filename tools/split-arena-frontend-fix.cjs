/**
 * Fixed extraction: finds function body by locating the opening brace AFTER
 * the parameter list and return type annotation.
 */
function extractFnBlockFixed(source, startIdx) {
  let i = startIdx;
  
  // Find the opening parenthesis of the parameter list
  while (i < source.length && source[i] !== "(") i++;
  if (i >= source.length) return "";
  
  // Skip the parameter list (balanced parentheses)
  let parenDepth = 1;
  i++;
  while (i < source.length && parenDepth > 0) {
    if (source[i] === "(") parenDepth++;
    else if (source[i] === ")") parenDepth--;
    else if (source[i] === "\"" || source[i] === "'" || source[i] === "\`") {
      const quote = source[i];
      i++;
      while (i < source.length && source[i] !== quote) {
        if (source[i] === "\\") i++;
        i++;
      }
    }
    i++;
  }
  if (i >= source.length) return "";
  
  // Now skip the return type annotation until we find the opening brace
  // of the function body
  let foundBodyBrace = false;
  while (i < source.length && !foundBodyBrace) {
    const ch = source[i];
    if (ch === "{") {
      foundBodyBrace = true;
    } else if (ch === "<" || ch === "(") {
      // Skip generic type parameters or nested parens
      const open = ch;
      const close = open === "<" ? ">" : ")";
      let typeDepth = 1;
      i++;
      while (i < source.length && typeDepth > 0) {
        if (source[i] === open) typeDepth++;
        else if (source[i] === close) typeDepth--;
        else if (source[i] === "\"" || source[i] === "'" || source[i] === "\`") {
          const quote = source[i];
          i++;
          while (i < source.length && source[i] !== quote) {
            if (source[i] === "\\") i++;
            i++;
          }
        }
        i++;
      }
    } else if (ch === "\"" || ch === "'" || ch === "\`") {
      const quote = ch;
      i++;
      while (i < source.length && source[i] !== quote) {
        if (source[i] === "\\") i++;
        i++;
      }
      i++;
    } else {
      i++;
    }
  }
  
  if (i >= source.length || !foundBodyBrace) return "";
  
  // Now match the function body braces
  let depth = 1;
  i++;
  while (i < source.length && depth > 0) {
    const ch = source[i];
    if (ch === "\"" || ch === "'") {
      i++;
      while (i < source.length && source[i] !== ch) {
        if (source[i] === "\\") i++;
        i++;
      }
      if (i >= source.length) return "";
    } else if (ch === "\`") {
      i++;
      while (i < source.length && source[i] !== "\`") {
        if (source[i] === "\\") i++;
        i++;
      }
      if (i >= source.length) return "";
    } else if (ch === "/") {
      // Skip comments and regex
      if (source[i + 1] === "/") {
        while (i < source.length && source[i] !== "\n") i++;
      } else if (source[i + 1] === "*") {
        i += 2;
        while (i < source.length && !(source[i] === "*" && source[i + 1] === "/")) i++;
        i++;
      }
    } else if (ch === "{") {
      depth++;
    } else if (ch === "}") {
      depth--;
    }
    i++;
  }
  
  return source.slice(startIdx, i);
}
