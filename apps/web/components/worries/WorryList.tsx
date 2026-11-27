"use client";

import { useState } from "react";
import { Chip } from "@/components/ui/Chip";
import { usePremiumStatus } from "@/lib/premium/status";
import { WORRY_CATEGORIES, visibleWorries, type WorryCategory } from "@/lib/worries";
import { WorryCards } from "./WorryCards";
import s from "./worries.module.css";

const TABS: ReadonlyArray<{ id: "all" | WorryCategory; label: string }> = [{ id: "all", label: "전체" }, ...WORRY_CATEGORIES];

/**
 * /worries (spec 2026-11-26 worry catalog §5.3): the category chips (전체, 연애·재회, 돈, 일) and the worries in them. The two
 * premium worries join once the premium status says their product is visible here (nothing of premium before it answers).
 */
export function WorryList() {
  const status = usePremiumStatus();
  const [tab, setTab] = useState<"all" | WorryCategory>("all");
  const worries = visibleWorries(status).filter((worry) => tab === "all" || worry.category === tab);
  return (
    <>
      <div className={s.tabs} role="group" aria-label="고민 분류">
        {TABS.map((option) => (
          <Chip key={option.id} selected={tab === option.id} onClick={() => setTab(option.id)}>
            {option.label}
          </Chip>
        ))}
      </div>
      <WorryCards worries={worries} />
    </>
  );
}
