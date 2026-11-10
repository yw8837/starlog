/**
 * Texts that must reach the care path (lib/crisis.ts crisisTier, as the server reads them in lib/api/http.ts), shared by the
 * server check's test (lib/api/http.test.ts) and the client tone check (lib/voice/tone.test.ts): one list, so the two cannot drift.
 */
export const CRISIS_HITS: readonly string[] = [
  // Phrases that mean one thing anywhere.
  "죽고싶어", "죽 고 싶 어", "죽어버리고 싶다", "자살", "자해", "극단적인 선택", "살 기 싫 어", "사라지고 싶은 밤",
  "목숨을 끊고 싶어", "목숨 끊고 싶어", "세상을 떠나고 싶어", "살아갈 이유가 없어", "콱 죽어버릴까", "차라리 죽어버릴까",
  "thinking about suicide", "I feel suicidal", "I want to kill myself",
  // Phrases that are also ordinary questions: at the start of a sentence or after the person's own word.
  "살고 싶지 않아요", "살고 싶지 않아. 너무 지쳤어", "요즘 살고 싶지 않아요", "이제 살고 싶지 않아", "정말 살고 싶지 않아", "그냥 살고 싶지 않아",
  "이 세상에 살고 싶지 않아", "세상에서 더 살고 싶지 않아", "그만 살고 싶어", "이제 그만 살고 싶어", "없어지고 싶어", "내가 없어지고 싶어",
  "삶을 끝내고 싶어", "인생을 끝내고 싶다", "내 인생을 끝내고 싶어", "그냥 인생을 끝내고 싶다", "이 인생을 끝내고 싶어",
  "생을 마감하고 싶어요", "인생을 마감하고 싶어", "제 삶을 마감하고 싶어요", "삶을 포기하고 싶어", "그냥 인생을 포기하고 싶어요",
  // Missed before (launch day, 2026-10-21): said alone, or after the person's own word or how hard things are.
  "다 끝내고 싶어", "그냥 다 끝내고 싶어", "이제 다 끝내고 싶어요", "너무 지쳤어. 다 끝내고 싶어", "다 끝내고 싶다는 생각만 들어",
  "죽을래", "그냥 죽을래", "나 죽을래", "차라리 죽을래요", "그냥 죽을까", "그냥 죽을까 싶어", "차라리 죽을까", "나 그냥 죽을까",
  "너무 힘들어서 살고 싶지 않아", "힘들어서 더는 살고 싶지 않아요", "너무 힘들어서 더 이상 살고 싶지 않아요", "괴로워서 살고 싶지 않아",
  "지쳐서 더는 살고 싶지 않아", "더는 살고 싶지 않아요", "정말 더 이상 살고 싶지 않아",
  // Review of 2026-10-21: the same phrases said a little differently.
  "그냥 죽을까요?", "차라리 죽을까요?", "너무 힘들어서 그냥 죽을까", "힘들어 그냥 죽을까", "요즘 그냥 죽을까 생각해",
  "힘들어서 더 살고 싶지 않아요", "살고 싶지가 않아요", "힘들어서 더 이상은 살고 싶지 않아", "나 그냥 죽을래요", "그냥 죽어버릴래",
  "나 그냥 다 끝내고 싶어", "다 끝내고 싶습니다", "너무 힘들어서 살고 싶지 않은 마음뿐이야", "너무 힘들어서 살고 싶지 않은데 어떻게 해야 할까요?", "지쳐서 더는 살고 싶지 않은데 버텨야 할까요", "너무 힘들어서 그냥 죽을까 싶어", "요즘 그냥 죽을까 싶어", "요즘 너무 지쳐\n다 끝내고 싶어", "힘들어… 살고 싶지 않아",
  // Invisible characters cannot split a phrase.
  "죽\u200B고 싶어", "죽\u2060고 싶어", "죽\u00AD고 싶어",
];
