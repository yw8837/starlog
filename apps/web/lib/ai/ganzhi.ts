/**
 * 간지 readings that spell a banned word. Of the sixty Korean readings only 임신 (壬申) collides with
 * a blocklist (임신·출산, pregnancy); the facts give every pillar, 대운 and 세운 its reading
 * ("임신(壬申) 대운"), and the engine's notes write "壬申(임신)". Read as a pillar (next to its hanja,
 * or followed by 대운·세운·일주·년·월·일 …) it becomes "壬申" before the blocklists run, so the
 * allow-list still judges whether that pillar is in the chart, and 임신 used as a word still fails.
 * (First written for the premium validators; shared here.)
 */
const GANZHI_HOMONYM = /(?<=壬申\()임신|임신(?=\(壬申\)|\s?(?:대운|세운|일주|월주|년주|시주|기둥)|(?:년|월|일)(?:[이은을의에도과와로]|(?![가-힣])))/g;

export const maskGanzhiReadings = (text: string) => text.replace(GANZHI_HOMONYM, "壬申");
