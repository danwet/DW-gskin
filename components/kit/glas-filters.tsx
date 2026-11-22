import { GLAS_FILTER_PNG } from "@/lib/glas-boot";

/**
 * De bumpmap-filters voor het vloeibare glas. Staat één keer in de root layout,
 * zodat elke selectorpil `url(#glas-morfing)` kan gebruiken.
 */
export function GlasFilters() {
  return (
    <svg aria-hidden className="absolute size-0 overflow-hidden" focusable="false">
      {/* Morfing voor het glas: vervormt de inhoud achter de rand als een lens. */}
      <filter
        id="glas-morfing"
        x="0%"
        y="0%"
        width="100%"
        height="100%"
        filterUnits="objectBoundingBox"
        primitiveUnits="objectBoundingBox"
        colorInterpolationFilters="sRGB"
      >
        <feImage
          href={`data:image/png;base64,${GLAS_FILTER_PNG}`}
          xlinkHref={`data:image/png;base64,${GLAS_FILTER_PNG}`}
          x="0"
          y="0"
          width="1"
          height="1"
          preserveAspectRatio="none"
          result="bult"
        />
        <feDisplacementMap
          in="SourceGraphic"
          in2="bult"
          scale="0.20"
          xChannelSelector="R"
          yChannelSelector="G"
        />
      </filter>

      {/* Lens voor de opgetilde druppel: zelfde bumpmap, sterkere scale. */}
      <filter
        id="liquid-lens"
        x="-20%"
        y="-20%"
        width="140%"
        height="140%"
        filterUnits="objectBoundingBox"
        primitiveUnits="objectBoundingBox"
        colorInterpolationFilters="sRGB"
      >
        <feImage
          href={`data:image/png;base64,${GLAS_FILTER_PNG}`}
          xlinkHref={`data:image/png;base64,${GLAS_FILTER_PNG}`}
          x="0"
          y="0"
          width="1"
          height="1"
          preserveAspectRatio="none"
          result="bult"
        />
        <feDisplacementMap
          in="SourceGraphic"
          in2="bult"
          scale="0.45"
          xChannelSelector="R"
          yChannelSelector="G"
        />
      </filter>
    </svg>
  );
}
