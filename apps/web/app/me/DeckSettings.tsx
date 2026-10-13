"use client";

import { CARD_BACKS, DEFAULT_DECK_PREFS, FRONT_DECKS, backImage, faceImage, setDeckPrefs, useDeckPrefs, type CardBack, type FrontDeck } from "@/lib/deck";
import s from "./DeckSettings.module.css";

const FRONT_NAME: Record<FrontDeck, string> = { starlog: "스타로그 카드", rws1909: "1909 원판" };
const BACK_NAME: Record<CardBack, string> = {
  constellation: "별자리 지도",
  "navy-gold": "남색 금선",
  "ribbon-garden": "아이보리 리본 정원",
  "moon-guardian": "달빛 수호 문양",
};
/** 바보 (0), the deck's first card: the same card in each deck, so the two can be compared. */
const PREVIEW_CARD = "major-00-fool";

type Option<T extends string> = { value: T; label: string; image: string; isDefault: boolean };

type GroupProps<T extends string> = {
  /** Names the radio group and prefixes the ids of its parts. */
  id: string;
  title: string;
  options: readonly Option<T>[];
  current: T;
  onChoose: (value: T) => void;
};

/**
 * One radio group of picture tiles. The inputs are real radios (arrow keys, Tab and Space come from the
 * browser) stretched invisibly over their tiles, so a tap anywhere on a tile picks it and the tile
 * shows the focus ring and the choice.
 */
function Group<T extends string>({ id, title, options, current, onChoose }: GroupProps<T>) {
  return (
    <div role="radiogroup" aria-labelledby={`${id}-title`} className={s.group}>
      <h3 id={`${id}-title`} className={s.groupTitle}>
        {title}
      </h3>
      <div className={s.options} data-count={options.length}>
        {options.map((option) => {
          const optionId = `${id}-${option.value}`;
          return (
            <label key={option.value} className={s.option}>
              <input
                className={s.input}
                type="radio"
                name={id}
                value={option.value}
                checked={option.value === current}
                onChange={() => onChoose(option.value)}
                aria-labelledby={`${optionId}-name`}
                aria-describedby={option.isDefault ? `${optionId}-default` : undefined}
              />
              <span className={s.tile}>
                <span className={s.picture}>
                  <img className={s.thumb} src={option.image} alt="" width={600} height={1040} loading="lazy" draggable={false} />
                  <span className={s.mark} aria-hidden="true" />
                </span>
                <span id={`${optionId}-name`} className={s.name}>
                  {option.label}
                </span>
                {option.isDefault ? (
                  <span id={`${optionId}-default`} className={s.badge}>
                    기본
                  </span>
                ) : null}
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

const FRONT_OPTIONS: readonly Option<FrontDeck>[] = FRONT_DECKS.map((deck) => ({
  value: deck,
  label: FRONT_NAME[deck],
  image: faceImage(PREVIEW_CARD, "sm", deck),
  isDefault: deck === DEFAULT_DECK_PREFS.front,
}));

const BACK_OPTIONS: readonly Option<CardBack>[] = CARD_BACKS.map((back) => ({
  value: back,
  label: BACK_NAME[back],
  image: backImage(back, "sm"),
  isDefault: back === DEFAULT_DECK_PREFS.back,
}));

/**
 * 내 정보 → 카드 디자인: which art the card faces are drawn in and which back they wear. A pick applies to
 * every card on the site at once (lib/deck.ts) and stays on this device; there is nothing to save.
 */
export function DeckSettings() {
  const { front, back } = useDeckPrefs();
  return (
    <section className={s.deck} aria-labelledby="deck-title">
      <div>
        <h2 id="deck-title" className={s.title}>
          카드 디자인
        </h2>
        <p className={s.hint}>고르면 바로 바뀌고, 이 기기에 저장돼요</p>
      </div>
      <Group id="deck-front" title="앞면" options={FRONT_OPTIONS} current={front} onChoose={(value) => setDeckPrefs({ front: value })} />
      <Group id="deck-back" title="뒷면" options={BACK_OPTIONS} current={back} onChoose={(value) => setDeckPrefs({ back: value })} />
    </section>
  );
}
