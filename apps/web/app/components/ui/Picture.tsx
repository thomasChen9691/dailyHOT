import type { ImgHTMLAttributes, SyntheticEvent } from "react";
import { avifCandidates } from "@aihot/contracts/site";

/**
 * A proxied image whose responsive set is offered as AVIF first; browsers without AVIF load the img's own
 * candidates. The picture lays out as if the img stood alone.
 *
 * An image the proxy could not fetch (an unreachable or slow origin) would otherwise leave the
 * browser's broken-image glyph on the page. Hiding it leaves the surface underneath, which reads as
 * "no picture here" rather than as a fault.
 */
export function Picture({ srcSet, sizes, onError, ...img }: ImgHTMLAttributes<HTMLImageElement>) {
  const hideBroken = (e: SyntheticEvent<HTMLImageElement>) => {
    e.currentTarget.style.visibility = "hidden";
    onError?.(e);
  };
  if (!srcSet) return <img sizes={sizes} {...img} onError={hideBroken} />;
  return (
    <picture className="contents">
      <source type="image/avif" srcSet={avifCandidates(srcSet)} sizes={sizes} />
      <img srcSet={srcSet} sizes={sizes} {...img} onError={hideBroken} />
    </picture>
  );
}
