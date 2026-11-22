/**
 * WebKit (ook Chrome en Firefox op iOS) kan geen `url(#…)` in backdrop-filter
 * aan; dan vervalt de hele filterlijst, inclusief de blur. Daarom zetten we
 * vóór de eerste paint een klasse op <html> en gebruiken we daar een blur-only
 * fallback.
 */
export const GLAS_BOOT = `(function(){
  var ua = navigator.userAgent;
  var ios = /iPhone|iPad|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var safariBureau = /AppleWebKit/.test(ua) && /Safari\\//.test(ua) &&
    !/Chrom(e|ium)|Edg\\/|Firefox/.test(ua);
  if (ios || safariBureau) document.documentElement.classList.add('glas-safari');
})();`;

/** De bumpmap voor de lens-filters: R = horizontale trek, G = verticale trek. */
export const GLAS_FILTER_PNG = "iVBORw0KGgoAAAANSUhEUgAAAGAAAABgCAYAAADimHc4AAAA+klEQVR42u3dOw6CQBSG0Yth4S7BvcpDFBgrEwoD5S3u+RIyieV/YjvTPZZ72yOiRcTvvPriz1mhdvLb8bz6jnv3MYUS62M0Qi7AbAQAAJQH8DICgNIAixEAlAZ4GwFAaYCPEQCUBliNAKA0wGYEAACUB7AbIRegGQFA4W4mAABAAAAIAAABACAAAAQAgAAAEAAAAgBAAAAIAAABACAAAAQAgAAAEAAAAgBAAAAIAAABACAAAAQAgAAAEAAAAgBAAAAIAACFe0P9A+TuaAByfb0nTATAM1bykh4Ar6kawYPOAJQHMBshF2AyAoDSAIMRcgFGI+QCPI2Q2ReJV0cDVn6G1wAAAABJRU5ErkJggg==";
