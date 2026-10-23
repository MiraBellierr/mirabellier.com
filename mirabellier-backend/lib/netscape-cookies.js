const fs = require("fs");

function parseCookiesFile(filePath) {
  let content;
  try {
    content = fs.readFileSync(filePath, "utf8");
  } catch {
    return [];
  }

  const cookies = [];
  for (const line of String(content).split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith("#HttpOnly_")) {
      // fall through — this prefix marks an httpOnly cookie line
    } else if (trimmed.startsWith("#")) {
      continue;
    }
    const columns = trimmed.replace(/^#HttpOnly_/, "").split("\t");
    if (columns.length < 7) continue;

    const domain = columns[0].toLowerCase();
    const expiry = Number.parseFloat(columns[4]);
    if (Number.isFinite(expiry) && expiry > 0 && expiry < Date.now() / 1000) {
      continue;
    }

    const name = columns[5].trim();
    const value = columns[6].trim();
    if (!name) continue;
    cookies.push({ domain, name, value });
  }
  return cookies;
}

function cookieHeaderForHost(filePath, hostname) {
  const host = String(hostname || "").toLowerCase().replace(/^www\./, "");
  const parts = [];
  for (const cookie of parseCookiesFile(filePath)) {
    const domainCore = cookie.domain.replace(/^\./, "");
    const matches = host === domainCore || host.endsWith(`.${domainCore}`);
    if (matches) {
      parts.push(`${cookie.name}=${cookie.value}`);
    }
  }
  return parts.join("; ");
}

function cookieFilePathIfExists(filePath) {
  try {
    fs.accessSync(filePath);
    return filePath;
  } catch {
    return null;
  }
}

module.exports = {
  parseCookiesFile,
  cookieHeaderForHost,
  cookieFilePathIfExists,
};
