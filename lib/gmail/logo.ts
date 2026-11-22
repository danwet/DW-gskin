type Candidate = { src: string; score: number };

/**
 * Picks the brand mark out of a newsletter. Mail builders are predictable: the
 * logo is an <img> near the top whose alt, class or file name says "logo", and
 * tracking pixels are the one thing we must never pick.
 */
export function extractLogoUrl(
  html: string,
  options?: { requireHint?: boolean },
): string | undefined {
  if (!html) return undefined;
  const requireHint = options?.requireHint ?? false;

  const images = [...html.matchAll(/<img\b[^>]*>/gi)].map((match) => match[0]);
  const candidates: Candidate[] = [];

  images.forEach((tag, index) => {
    const src = /src\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1]?.trim();
    if (!src || !/^https?:\/\//i.test(src)) return;

    const alt = /alt\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1] ?? "";
    const className = /class\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1] ?? "";
    const width = Number(/width\s*=\s*["']?(\d+)/i.exec(tag)?.[1] ?? 0);
    const height = Number(/height\s*=\s*["']?(\d+)/i.exec(tag)?.[1] ?? 0);

    // Never a tracking pixel.
    if ((width === 1 && height === 1) || /\/(wf\/open|o\/|open\?|track|pixel)/i.test(src)) return;

    let hinted = 0;
    if (/logo/i.test(alt)) hinted += 40;
    if (/logo/i.test(className)) hinted += 35;
    if (/logo/i.test(src)) hinted += 30;
    if (index < 3) hinted += 12;
    if (width >= 40 && width <= 480) hinted += 8;
    if (height > 0 && height <= 160) hinted += 6;
    if (/banner|hero|header/i.test(className) || /banner|hero/i.test(src)) hinted -= 12;
    if (width >= 560) hinted -= 10;

    // Newsletters without any hint still lead with their brand mark: use the
    // first real image above the text rather than nothing.
    const score = hinted >= 15 ? hinted : requireHint || index >= 6 ? 0 : 18;
    if (score > 0) candidates.push({ src, score });
  });

  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];
  // A hinted logo (>= 30) always wins; otherwise the leading image is used.
  return best && best.score >= 18 ? best.src : undefined;
}
