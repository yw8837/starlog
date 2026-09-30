"use client";

import { useState } from "react";
import { MoonIcon } from "@/components/home/icons";
import { Button } from "@/components/ui/Button";
import { SITE, won, type MoonPack } from "@/lib/config";
import s from "./MeView.module.css";

type MoonPackSheetProps = {
  titleId: string;
  moonlight: number;
  onBuy: (pack: MoonPack) => void;
};

/** 달빛 packs from config as native radios (arrow keys for free), and one pay button for the picked pack. */
export function MoonPackSheet({ titleId, moonlight, onBuy }: MoonPackSheetProps) {
  const [picked, setPicked] = useState(0);
  const packs = SITE.moonPacks;
  const pack = packs[picked] ?? packs[0];
  const { paid } = SITE.currency;

  return (
    <div className={s.sheet}>
      <h2 id={titleId} className={s.sheetTitle}>
        {`${paid} 충전`}
      </h2>
      <p className={s.sheetBalance}>{`지금 ${paid} ${moonlight}개 · 한 장은 ${SITE.price.unitsPerReading}개로 열려요`}</p>

      <fieldset className={s.packs}>
        <legend className={s.srOnly}>충전할 묶음</legend>
        {packs.map((option, i) => (
          <label key={option.units} className={s.pack}>
            <input type="radio" name="moon-pack" checked={picked === i} onChange={() => setPicked(i)} />
            <span className={s.packBody}>
              <span className={s.packUnits}>
                <MoonIcon size={18} />
                {`${paid} ${option.units}`}
                {option.bonus > 0 ? <span className={s.packBonus}>{`+ 보너스 ${option.bonus}`}</span> : null}
              </span>
              <span className={s.packPrice}>{won(option.krw)}</span>
            </span>
          </label>
        ))}
      </fieldset>

      {pack ? (
        <Button block onClick={() => onBuy(pack)}>
          {`${won(pack.krw)} 결제하기`}
        </Button>
      ) : null}
    </div>
  );
}
