/**
 * De gedeelde glazen balk/pil: witgrijs verloop, haarlijnrand en bovenrand-glans.
 * Combineer met `MORFING_BLUR`.
 */
export const GLAS_BALK = "glas-balk";

/**
 * De lens-morfing + lichte blur als Tailwind-utility. Bewust NIET als
 * handgeschreven `backdrop-filter`: Lightning CSS vouwt zo'n paar met de
 * `-webkit-`-variant samen tot alleen de geprefixeerde versie, die modern Chrome
 * negeert. Tailwind schrijft beide varianten wél correct uit.
 */
export const MORFING_BLUR =
  "backdrop-filter-[url(#glas-morfing)_blur(1.5px)_saturate(1.25)]";
