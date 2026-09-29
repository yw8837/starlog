type RimProps = {
  /** Id of a clip path in defs.tsx that matches the lit shape. */
  clip: string;
  /** Edge to light, drawn along the shape's outline. */
  d: string;
  color?: string;
  width?: number;
  opacity?: number;
};

/**
 * Rim light from the violet sky: a soft stroke along an edge, clipped to the shape so only
 * the inside half shows. The edge stays crisp and nothing glows outside the silhouette.
 */
export function Rim({ clip, d, color = "#DCD2FF", width = 6, opacity = 0.75 }: RimProps) {
  return (
    <g clipPath={`url(#${clip})`}>
      <path d={d} stroke={color} strokeWidth={width} strokeLinecap="round" fill="none" opacity={opacity} filter="url(#sl-blur)" />
    </g>
  );
}
