"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { WhoRows } from "@/components/premium/WhoRows";
import p from "@/components/premium/premiumForm.module.css";
import { SajuFields } from "@/components/saju/SajuForm";
import { Stepper } from "@/components/tarot/Stepper";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { Chip } from "@/components/ui/Chip";
import f from "@/app/tarot/flow.module.css";
import n from "@/app/tarot/new/situation/SituationPicker.module.css";
import { MATCH_CONCERN_MAX, MATCH_RELATION_OPTIONS, PARTNER_LABEL_MAX, useMatchFlow, type MatchFlow, type MatchRelationId } from "@/lib/premium/matchFlow";
import { PREMIUM } from "@/lib/premium/products";
import type { SajuContext } from "@/lib/reading/types";
import { saveSajuProfile, useSajuContext, useSajuProfile } from "@/lib/sajuFlow";

type Step = "me" | "partner" | "relation";

const statusOf = (context: SajuContext): MatchFlow["meStatus"] => {
  const status = { ...(context.loveStatus ? { loveStatus: context.loveStatus } : {}), ...(context.workStatus ? { workStatus: context.workStatus } : {}) };
  return Object.keys(status).length ? status : undefined;
};

/**
 * 우리 사이 궁합's step 1 (Task 20), one part at a time so one birth form is on screen: 나 (the saved saju
 * profile as a line, or the birth form), 그 사람 (the birth form without a birthplace, a 10-character
 * 부르는 말), then 관계 (six chips), an optional one-line concern, the privacy line and the required
 * consent. Everything stays in this tab (lib/premium/matchFlow.ts); no birth data ever enters a URL.
 */
export function MatchForm() {
  const router = useRouter();
  const { profile } = useSajuProfile();
  const sajuContext = useSajuContext();
  const { flow, setFlow } = useMatchFlow();
  const [step, setStep] = useState<Step | null>(null);
  const [label, setLabel] = useState("");
  const [relation, setRelation] = useState<MatchRelationId | undefined>();
  const [concern, setConcern] = useState("");
  const [ack, setAck] = useState(false);
  const loaded = flow !== undefined && profile !== undefined;
  const me = flow?.me ?? profile ?? null;

  // Where to start once the tab's flow and the saved profile are read: the first part not given yet.
  useEffect(() => {
    if (!loaded || step !== null) return;
    setLabel(flow.partnerLabel ?? "");
    setRelation(flow.relation);
    setConcern(flow.concern ?? "");
    setAck(flow.ack === true);
    setStep(!me ? "me" : flow.partner ? "relation" : "partner");
  }, [loaded, step, flow, me]);

  const stepper = <Stepper step={1} total={3} label={PREMIUM.match.name} backHref="/saju/start" backLabel="무엇이 궁금해요로 돌아가기" />;
  if (!loaded || step === null) return <div className={f.screen}>{stepper}</div>;

  const meRow = me ? { name: "나", form: me, edit: "나의 태어난 날 고치기", onEdit: () => setStep("me") } : null;

  if (step === "me" || !me) {
    return (
      <div className={f.screen}>
        {stepper}
        <div className={f.intro}>
          <h1 className={f.title}>나의 태어난 날을 알려 주세요</h1>
        </div>
        <div className={p.form}>
          <SajuFields
            key="me"
            initial={me}
            initialContext={flow.meStatus ?? sajuContext ?? {}}
            submitLabel="다음"
            onDone={(form, context) => {
              saveSajuProfile(form);
              setFlow({ ...flow, me: form, meStatus: statusOf(context), draw: undefined });
              setStep(flow.partner ? "relation" : "partner");
            }}
          />
        </div>
      </div>
    );
  }

  if (step === "partner" || !flow.partner) {
    return (
      <div className={f.screen}>
        {stepper}
        <div className={f.intro}>
          <h1 className={f.title}>그 사람의 태어난 날을 알려 주세요</h1>
        </div>
        <WhoRows rows={[meRow!]} />
        <div className={f.group}>
          <label htmlFor="partner-label" className={f.groupLabel}>
            부르는 말 <span className={n.optional}>(선택)</span>
          </label>
          <input
            id="partner-label"
            className={p.input}
            value={label}
            maxLength={PARTNER_LABEL_MAX}
            placeholder="예: 민지, 팀장님"
            autoComplete="off"
            onChange={(e) => setLabel(e.target.value)}
            aria-describedby="partner-label-hint"
          />
          <p id="partner-label-hint" className={p.hint}>
            풀이에서 그 사람을 이렇게 불러요. 적지 않으면 그 사람이라고 불러요.
          </p>
        </div>
        <div className={p.form}>
          <SajuFields
            key="partner"
            partner
            initial={flow.partner ?? null}
            submitLabel="다음"
            onDone={(form) => {
              const partnerLabel = label.trim();
              setFlow({ ...flow, me, partner: form, partnerLabel: partnerLabel || undefined, draw: undefined });
              setStep("relation");
            }}
          />
        </div>
      </div>
    );
  }

  const go = () => {
    if (!relation || !ack) return;
    const text = concern.trim();
    // A new deal for what was given now: cards dealt for earlier answers are dropped.
    setFlow({ ...flow, me, relation, concern: text || undefined, ack: true, draw: undefined });
    router.push("/premium/match/draw");
  };

  return (
    <div className={f.screen}>
      {stepper}
      <div className={f.intro}>
        <h1 className={f.title}>어떤 사이인지 알려 주세요</h1>
      </div>
      <WhoRows
        rows={[
          meRow!,
          { name: flow.partnerLabel || "그 사람", form: flow.partner, edit: "그 사람의 태어난 날 고치기", onEdit: () => setStep("partner") },
        ]}
      />

      <section className={f.group} aria-labelledby="relation-label">
        <h2 id="relation-label" className={f.groupLabel}>
          관계
        </h2>
        <div className={f.chips} role="group" aria-labelledby="relation-label">
          {MATCH_RELATION_OPTIONS.map((option) => (
            <Chip key={option.value} selected={relation === option.value} onClick={() => setRelation(option.value)}>
              {option.label}
            </Chip>
          ))}
        </div>
      </section>

      <section className={f.group}>
        <label htmlFor="match-concern" className={f.groupLabel}>
          고민 한 줄 <span className={n.optional}>(선택)</span>
        </label>
        <textarea
          id="match-concern"
          className={n.note}
          rows={2}
          maxLength={MATCH_CONCERN_MAX}
          value={concern}
          onChange={(e) => setConcern(e.target.value)}
          placeholder="예: 요즘 연락이 뜸해졌어요"
          aria-describedby="match-concern-count"
        />
        <p id="match-concern-count" className={n.counter}>
          {concern.length}/{MATCH_CONCERN_MAX}
        </p>
      </section>

      <p className={p.privacy}>상대의 생년월일과 태어난 시는 이 풀이를 만드는 데만 쓰고 스타로그 서버에 남기지 않아요. 이어서 물어보기를 위해 이 기기에만 잠근 채로 30일 동안 둬요.</p>
      <div className={p.consent}>
        <Checkbox checked={ack} onChange={setAck} required>
          상대에게 알리거나 동의를 받을 수 있는 사이에서만 입력할게요
        </Checkbox>
      </div>

      <div className={f.footer}>
        <Button block disabled={!relation || !ack} onClick={go} trailing="→">
          카드 5장 뽑으러 가기
        </Button>
      </div>
    </div>
  );
}
