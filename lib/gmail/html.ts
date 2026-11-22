/**
 * Email HTML is untrusted input: strip anything that can execute or track
 * before it is rendered in the popup.
 */
export function sanitizeEmailHtml(html: string): string {
  let out = html;

  // Whole blocks that can execute or load arbitrary content.
  out = out.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
  out = out.replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, "");
  out = out.replace(/<(object|embed|form|input|button)\b[^>]*>/gi, "");
  out = out.replace(/<\/?(object|embed|form)\b[^>]*>/gi, "");

  // Inline event handlers and javascript: URLs.
  out = out.replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, "");
  out = out.replace(/\son[a-z]+\s*=\s*'[^']*'/gi, "");
  out = out.replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, "");
  out = out.replace(/javascript:/gi, "");

  // Tracking pixels: 1x1 images and the usual open-tracking paths.
  out = out.replace(/<img\b[^>]*>/gi, (tag) => {
    const onePixel = /(width\s*=\s*["']?1["']?[\s\S]*height\s*=\s*["']?1["']?)|(height\s*=\s*["']?1["']?[\s\S]*width\s*=\s*["']?1["']?)/i.test(tag);
    const tracker = /\/(wf\/open|o\/|open\?|track|pixel)\b/i.test(tag);
    return onePixel || tracker ? "" : tag;
  });

  // Links in a mail must not navigate the frame away from the preview.
  out = out.replace(/<base\b[^>]*>/gi, "");

  return out;
}
