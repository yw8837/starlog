# 감질맛 맛보기: the second card cut halfway (tarot), 2026-10-14

Owner decisions (10/14 evening): after the 오픈 기념 무료 ends (2026-10-31), the free tier is a teaser that shows **the first card in full and the second card cut about halfway**, the rest locked. Chosen over "two cards in full" (≈200–316원 a teaser) for cost; estimate ≈120원 a teaser against ≈50원 today. Measure 3 tarot + 3 saju teasers after building (real API, cap 1,000원, approved).

## What exists
- `TarotTeaserData = { cards[{position, cardId, keyword}], firstCard: Section, lockedToc }`. `firstCard.body` is already a complete 250–350-character paragraph on the first card (lib/ai/prompts/tarot.ts `## teaser`), so "the first card in full" is today's teaser.
- The paid reading (`## reading`) writes every card again (150–250 characters each) and is told to avoid the teaser's first card ("다른 그림 사실과 다른 각도").

## The problem with a plain cut
If the teaser only showed half of a second card, the paid reading would write that card again in other words: the "…" would never continue, and the payoff of the cut is lost.

## Design
1. **Teaser writes two cards.** The schema gains `secondCard: Section` with the same rules as `firstCard` (a complete 250–350-character paragraph on the second card only). The teaser prompt's lens and quote rules apply to both; neither gives the overall conclusion.
2. **The server sends half.** The teaser route cuts `secondCard.body` at the sentence end nearest 50% (never under 35% or over 65% of the characters) and returns `secondCard: { heading, body: <first half>, cut: true }`. The hidden half never leaves the server in clear text.
3. **The rest is sealed on the device.** The route also returns `seal`: AES-256-GCM (lib/account/secrets.ts, a new key label `teaser-v1`) over `{ first, second }` (the two full sections), with additional data binding it to the draw token and the input hash, valid for the draw token's lifetime. The client stores it with the teaser (lib/reading/teaserCache) and sends it with the unlock request.
4. **The paid reading continues.** The reading route opens the seal (a seal that does not open or does not match the draw and input is ignored: the reading is written as today). With it, the prompt gets the two written cards as `<written_cards>` and the reading task writes **card 3 and the rest** (connection, timing, observation, scenarios, messages, avoid, alternatives, action, verdict, followUps) in the same voice, using the two cards as context; the response's `cards` are `[first, second(full), generated third]`, so the result screen reads straight on from the cut. The paid generation writes ~2 card bodies less (cheaper).
5. **Screens.** The teaser shows the second card's half with a fade and "…", then the locked TOC and the unlock sheet. Saved chapters and shares keep the merged full reading.
6. **Validation.** The teaser validator checks `secondCard` like `firstCard` (length, quotes, reversed rule, imagery). The reading validator accepts a reading whose first two cards came from the seal (it validates the generated part and the merged whole).

## Saju (to confirm with the owner)
Analog: the 사주팔자/운 teaser shows section 1 in full and section 2 cut halfway, the rest (한눈에 보기 included) locked; the paid saju reading continues from the sealed sections 1–2. Saju generation and its validator are larger; build after tarot.

## Out of scope
The 오픈 기념 무료 rules and the gift removal (lane F3). Free budget changes (owner: revisit with real traffic).
