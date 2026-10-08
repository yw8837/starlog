/** A reading's length as shown before it is opened (SITE.reading.approxChars): "2,000", or a range, "2,500~3,000". */
export function approxCharsText({ min, max }: { min: number; max: number }): string {
  const num = (n: number) => new Intl.NumberFormat("ko-KR").format(n);
  return min === max ? num(min) : `${num(min)}~${num(max)}`;
}
