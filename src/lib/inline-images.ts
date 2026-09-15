// Saving blog posts that contain inline (`data:`) images.
//
// The editor runs with `allowBase64: true` so pasting a screenshot drops its
// bytes straight into the document as a data URL. Those copies serialize into
// the JSON sent to the API, and a couple of screenshots are enough to push the
// request past the backend's body cap (HTTP 413) — the post then cannot be
// saved at all. Every other image path (toolbar upload, drop zone) already
// stores a URL from the image endpoint instead.
//
// Before saving, walk the document, upload each inline image through the same
// endpoint the toolbar uses, and swap the data URL for the returned file URL.
// The stored document stays small and each image is served from the image
// endpoint, so resize/format variants work and the bytes never ride along in
// every API response that returns the post.
//
// Kept free of `@/lib/config` (no `import.meta.env`) so it runs under
// `node --test`; the caller injects the actual uploader.

export type InlineImageUploader = (file: File) => Promise<string>;

type JsonRecord = Record<string, unknown>;

const DATA_URL_PATTERN = /^data:([^;,]+)([^,]*),(.*)$/s;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isInlineImageSource(value: unknown): value is string {
  return typeof value === "string" && /^data:image\//i.test(value);
}

// Decode a data URL the same way `fetch` would, without the network round trip
// (a `connect-src` CSP would also reject `fetch("data:…")`). Returns null when
// the payload is not decodable so the caller can report it instead of saving a
// document that still carries the oversized inline copy.
export function dataUrlToFile(
  dataUrl: string,
  name = "inline-image",
): File | null {
  const match = DATA_URL_PATTERN.exec(dataUrl);
  if (!match) return null;

  const mime = match[1] || "application/octet-stream";
  const parameters = match[2] || "";
  const payload = match[3] || "";

  let bytes: Uint8Array;
  try {
    if (parameters.includes(";base64")) {
      const binary = atob(payload);
      bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
      }
    } else {
      bytes = new TextEncoder().encode(decodeURIComponent(payload));
    }
  } catch {
    return null;
  }

  const extension = (mime.split("/")[1] || "bin").split("+")[0];
  return new File([bytes], `${name}.${extension}`, { type: mime });
}

// Every unique inline image in the document. Unique matters: the same image
// pasted twice uploads once, and both `src` attributes share the result.
export function collectInlineImageSources(content: unknown): string[] {
  const sources = new Set<string>();

  const visit = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!isRecord(value)) return;

    for (const [key, entry] of Object.entries(value)) {
      if (key === "src" && isInlineImageSource(entry)) {
        sources.add(entry);
        continue;
      }
      visit(entry);
    }
  };

  visit(content);
  return [...sources];
}

// Copy-on-write: returns a new document with mapped sources replaced and the
// input untouched, so React state and the editor's own document are never
// mutated behind ProseMirror's back.
export function replaceInlineImageSources(
  content: unknown,
  replacements: ReadonlyMap<string, string>,
): unknown {
  if (Array.isArray(content)) {
    return content.map((entry) =>
      replaceInlineImageSources(entry, replacements),
    );
  }
  if (!isRecord(content)) return content;

  const result: JsonRecord = {};
  for (const [key, entry] of Object.entries(content)) {
    const replacement =
      key === "src" && typeof entry === "string"
        ? replacements.get(entry)
        : undefined;
    result[key] =
      replacement === undefined
        ? replaceInlineImageSources(entry, replacements)
        : replacement;
  }
  return result;
}

export async function materializeInlineImages(
  content: unknown,
  upload: InlineImageUploader,
): Promise<{ content: unknown; uploadedCount: number }> {
  const sources = collectInlineImageSources(content);
  if (sources.length === 0) {
    return { content, uploadedCount: 0 };
  }

  const replacements = new Map<string, string>();
  await Promise.all(
    sources.map(async (source, index) => {
      const file = dataUrlToFile(source, `inline-image-${index + 1}`);
      if (!file) {
        throw new Error(
          `Image ${index + 1} could not be read. Remove it from the post and add it again.`,
        );
      }

      try {
        replacements.set(source, await upload(file));
      } catch (error) {
        const detail =
          error instanceof Error && error.message
            ? error.message
            : "upload failed";
        throw new Error(`Image ${index + 1} could not be uploaded: ${detail}`, {
          cause: error,
        });
      }
    }),
  );

  return {
    content: replaceInlineImageSources(content, replacements),
    uploadedCount: sources.length,
  };
}
