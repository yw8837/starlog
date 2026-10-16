"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { WhoRows } from "@/components/premium/WhoRows";
import p from "@/components/premium/premiumForm.module.css";
import { SajuFields } from "@/components/saju/SajuForm";
import { Stepper } from "@/components/tarot/Stepper";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import f from "@/app/tarot/flow.module.css";
import n from "@/app/tarot/new/situation/SituationPicker.module.css";
import { PREMIUM } from "@/lib/premium/products";
import type { SajuContext } from "@/lib/reading/types";
import { LOVE_STATUS_OPTIONS, WORK_STATUS_OPTIONS, saveSajuContext, saveSajuProfile, useSajuContext, useSajuProfile } from "@/lib/sajuFlow";

const PREVIEW_PATH = "/premium/newyear-2027/preview";

/**
 * 2027 신년운세's step 1 (Task 21): the saved saju profile as one line (고치기) with the optional status chips,
 * or the birth form when there is none (or 고치기 was pressed). No concern box (saju-topics §18-1). The gold
 * 2027년 미리 보기 keeps the profile and the chips on this device, as the saju flow does, and opens the
 * preview; no birth data ever enters a URL.
 */
export function NewYearForm() {
  const router = useRouter();
  const { profile } = useSajuProfile();
  const saved = useSajuContext();
  const [editing, setEditing] = useState(false);
  const [context, setContext] = useState<SajuContext | null>(null);
  useEffect(() => {
    if (saved !== undefined && context === null) setContext(saved);
  }, [saved, context]);

  const stepper = <Stepper step={1} total={2} label={PREMIUM["newyear-2027"].name} backHref="/saju/start" backLabel="무엇이 궁금해요로 돌아가기" />;
  if (profile === undefined || context === null) return <div className={f.screen}>{stepper}</div>;

  if (!profile || editing) {
    return (
      <div className={f.screen}>
        {stepper}
        <div className={f.intro}>
          <h1 className={f.title}>태어난 날을 알려 주세요</h1>
        </div>
        <div className={p.form}>
          <SajuFields
            initial={profile}
            initialContext={context}
            submitLabel="2027년 미리 보기"
            onDone={(form, chips) => {
              saveSajuProfile(form);
              saveSajuContext(chips);
              router.push(PREVIEW_PATH);
            }}
          />
        </div>
      </div>
    );
  }

  const toggle = (key: "loveStatus" | "workStatus", value: string) =>
    setContext((prev) => ({ ...prev, [key]: prev?.[key] === value ? undefined : value }) as SajuContext);

  return (
    <div className={f.screen}>
      {stepper}
      <div className={f.intro}>
        <h1 className={f.title}>2027년을 미리 볼게요</h1>
      </div>
      <WhoRows rows={[{ name: "나", form: profile, edit: "나의 태어난 날 고치기", onEdit: () => setEditing(true) }]} />

      <section className={f.group} aria-labelledby="ny-love">
        <h2 id="ny-love" className={f.groupLabel}>
          연애 <span className={n.optional}>(선택)</span>
        </h2>
        <div className={f.chips}>
          {LOVE_STATUS_OPTIONS.map((option) => (
            <Chip key={option.value} selected={context.loveStatus === option.value} onClick={() => toggle("loveStatus", option.value)}>
              {option.label}
            </Chip>
          ))}
        </div>
      </section>
      <section className={f.group} aria-labelledby="ny-work">
        <h2 id="ny-work" className={f.groupLabel}>
          일 <span className={n.optional}>(선택)</span>
        </h2>
        <div className={f.chips}>
          {WORK_STATUS_OPTIONS.map((option) => (
            <Chip key={option.value} selected={context.workStatus === option.value} onClick={() => toggle("workStatus", option.value)}>
              {option.label}
            </Chip>
          ))}
        </div>
        <p className={p.hint}>고르면 지금 상황에 맞춰 조금 더 구체적으로 풀어요</p>
      </section>

      <div className={f.footer}>
        <Button
          block
          onClick={() => {
            saveSajuContext(context);
            router.push(PREVIEW_PATH);
          }}
          trailing="→"
        >
          2027년 미리 보기
        </Button>
      </div>
    </div>
  );
}
