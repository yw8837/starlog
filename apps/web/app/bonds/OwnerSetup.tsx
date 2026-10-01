"use client";

import { useState, type FormEvent } from "react";
import { BIRTH_MISSING, BirthFields, EMPTY_BIRTH, birthBody, type BirthValue } from "@/components/bonds/BirthFields";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { bondsApi, bondsMessage, rememberSunSign, sunSignOf } from "@/lib/bonds/client";
import { NICKNAME_MAX, NICKNAME_MIN } from "@/lib/bonds/text";
import { useSajuProfile } from "@/lib/sajuFlow";
import b from "@/components/bonds/bonds.module.css";

/**
 * The first step of 별자리 인연: a nickname for the ranking and the birth date for the 궁합 basis.
 * The date starts from this device's saju profile when there is one; it is sent once and not stored.
 */
export function OwnerSetup({ onDone }: { onDone: () => void }) {
  const { profile } = useSajuProfile();
  const initial: BirthValue | null = profile
    ? { calendar: profile.calendar, year: profile.year, month: profile.month, day: profile.day, isLeapMonth: profile.isLeapMonth }
    : null;
  // Remount once the saved profile is read, so the fields start from it.
  return <SetupForm key={initial ? "profile" : "fresh"} initial={initial ?? EMPTY_BIRTH} onDone={onDone} />;
}

function SetupForm({ initial, onDone }: { initial: BirthValue; onDone: () => void }) {
  const [nickname, setNickname] = useState("");
  const [birth, setBirth] = useState<BirthValue>(initial);
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<{ nickname?: string; birth?: string; consent?: string; form?: string }>({});
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const length = Array.from(nickname.trim()).length;
    const next: typeof errors = {};
    if (length < NICKNAME_MIN || length > NICKNAME_MAX) next.nickname = `닉네임은 ${NICKNAME_MIN}~${NICKNAME_MAX}자로 지어 주세요`;
    const body = birthBody(birth);
    if (!body) next.birth = BIRTH_MISSING;
    if (!consent) next.consent = "확인에 체크해 주세요";
    setErrors(next);
    if (Object.keys(next).length || !body) return;
    setBusy(true);
    const result = await bondsApi<{ code: string }>("owner", { nickname: nickname.trim(), birth: body });
    setBusy(false);
    if (!result.ok) {
      const message = bondsMessage(result);
      setErrors(result.field === "nickname" ? { nickname: message } : result.field === "birth" ? { birth: message } : { form: message });
      return;
    }
    const sun = sunSignOf(body);
    if (sun) rememberSunSign(sun);
    onDone();
  };

  return (
    <form className={`${b.panel} ${b.form}`} onSubmit={submit} noValidate>
      <div className={b.group}>
        <div className={b.labelRow}>
          <label htmlFor="bonds-nickname" className={b.label}>
            닉네임
          </label>
          <span className={b.count} aria-hidden="true">
            {Array.from(nickname).length}/{NICKNAME_MAX}
          </span>
        </div>
        <input
          id="bonds-nickname"
          className={b.input}
          value={nickname}
          maxLength={NICKNAME_MAX + 4}
          onChange={(e) => setNickname(e.target.value)}
          placeholder="예: 별빛용우"
          autoComplete="nickname"
          enterKeyHint="next"
          aria-invalid={Boolean(errors.nickname)}
          aria-describedby="bonds-nickname-help"
        />
        <p id="bonds-nickname-help" className={b.helper}>
          랭킹과 공유 이미지에 쓰이는 이름이라 실명 대신 별명을 권해요
        </p>
        {errors.nickname ? (
          <p className={b.error} role="alert">
            {errors.nickname}
          </p>
        ) : null}
      </div>

      <BirthFields
        id="bonds-birth"
        value={birth}
        onChange={setBirth}
        error={errors.birth}
        helper="친구와의 인연 점수를 계산하는 데만 써요. 생년월일은 저장하지 않고 계산한 기준값만 남겨요."
      />

      <div className={b.group}>
        <Checkbox checked={consent} onChange={setConsent} invalid={Boolean(errors.consent)} required>
          만 14세 이상이고, 닉네임과 인연 점수가 별자리 랭킹에 보이는 데 동의해요
        </Checkbox>
        <p className={b.helper}>랭킹 공개는 나중에 끌 수 있어요.</p>
        {errors.consent ? (
          <p className={b.error} role="alert">
            {errors.consent}
          </p>
        ) : null}
      </div>

      {errors.form ? (
        <p className={b.error} role="alert">
          {errors.form}
        </p>
      ) : null}
      <Button type="submit" block disabled={busy}>
        별자리 인연 시작하기
      </Button>
    </form>
  );
}
