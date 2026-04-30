function stripTagsPreview(text: string, maxLen: number) {
  return text
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<\/?[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLen);
}

export function looksLikeHtmlErrorPayload(text: string) {
  const t = text.trim();
  if (!t) return false;
  if (/^<!doctype html/i.test(t)) return true;
  if (/^<html[\s>]/i.test(t)) return true;
  if (/<head[\s>]/i.test(t) && /<body[\s>]/i.test(t)) return true;
  // Common gateway / hosting error bodies that sometimes come back as HTML-ish text.
  if (/<(title|h1)[^>]*>\s*(4\d{2}|5\d{2})/i.test(t)) return true;
  return false;
}

export function coerceGeminiErrorMessage(rawText: string) {
  const preview = stripTagsPreview(rawText, 160);
  // Avoid leaking raw HTML; show a short hint if present.
  const hint = preview ? ` (${preview})` : "";
  return `AI service returned an unexpected response. Please try again.${hint}`;
}

/**
 * Guard against cases where the model endpoint returns an HTML error page (or similar),
 * which would otherwise get displayed in the UI as gibberish.
 */
export function assertGeminiTextOk(text: string) {
  if (looksLikeHtmlErrorPayload(text)) {
    throw new Error(coerceGeminiErrorMessage(text));
  }
}

