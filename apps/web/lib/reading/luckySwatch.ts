/** A swatch for the lucky colour's name (free text from the reading); gold when it is not one of these. */
const SWATCHES: ReadonlyArray<[RegExp, string]> = [
  [/빨|레드|붉/, "#e5484d"],
  [/주황|오렌지|살구/, "#f5a524"],
  [/노랑|노란|레몬|개나리/, "#f7d354"],
  [/연두|라임/, "#a8d672"],
  [/초록|녹색|올리브|숲|민트|그린/, "#5fbf8f"],
  [/하늘|스카이/, "#8cc8f0"],
  [/파랑|파란|블루|청색|바다/, "#4a7fe0"],
  [/남색|네이비|군청/, "#2e3a8c"],
  [/보라|라벤더|퍼플|자주/, "#a07ae0"],
  [/분홍|핑크|장미/, "#f29bc0"],
  [/흰|하양|화이트|아이보리|크림/, "#f7f3ea"],
  [/검정|검은|블랙|먹/, "#26222f"],
  [/회색|그레이|은색|실버/, "#b7b4c2"],
  [/갈색|브라운|베이지|카키|모래/, "#b08457"],
  [/금색|골드|황금/, "#f3dca1"],
];

export function luckySwatch(color: string): string {
  return SWATCHES.find(([pattern]) => pattern.test(color))?.[1] ?? "#f3dca1";
}
