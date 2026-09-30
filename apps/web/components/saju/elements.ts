import type { SajuElement } from "@starlog/core";

/** 목화토금수, the order the element bar lists them in. */
export const ELEMENT_ORDER: readonly SajuElement[] = ["목", "화", "토", "금", "수"];

export const ELEMENT_HANJA: Record<SajuElement, string> = { 목: "木", 화: "火", 토: "土", 금: "金", 수: "水" };

/** CSS hook: `data-el="wood"` picks up `--el-wood` from globals.css. */
export const ELEMENT_KEY: Record<SajuElement, "wood" | "fire" | "earth" | "metal" | "water"> = {
  목: "wood",
  화: "fire",
  토: "earth",
  금: "metal",
  수: "water",
};
