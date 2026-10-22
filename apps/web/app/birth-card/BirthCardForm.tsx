"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { BIRTH_MISSING, BirthFields, EMPTY_BIRTH, birthComplete, type BirthValue } from "@/components/bonds/BirthFields";
import { Button } from "@/components/ui/Button";
import { birthCardFor, birthCardPath, solarBirthDate } from "@/lib/birthCard";
import s from "./birthCard.module.css";

const NO_SUCH_DAY = "없는 날짜예요. 양력·음력과 날짜를 다시 확인해 주세요.";

/**
 * 내 카드 찾기: the app's date fields (양력/음력, year · month · day), then the card's page. The date stays in
 * this component's state: it is added up here and dropped; only the card's slug goes into the address.
 * `primary` is the gold button on /birth-card; under a result the reading is the gold one, so this is quieter.
 */
export function BirthCardForm({ id, primary = true }: { id: string; primary?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const [birth, setBirth] = useState<BirthValue>(EMPTY_BIRTH);
  const [error, setError] = useState("");

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!birthComplete(birth)) return setError(BIRTH_MISSING);
    const date = solarBirthDate(birth);
    if (!date) return setError(NO_SUCH_DAY);
    setError("");
    const href = birthCardPath(birthCardFor(date.year, date.month, date.day).slug);
    // The same card as the page shown (a friend shares it): back up to it rather than a push that changes nothing.
    if (href === pathname) window.scrollTo({ top: 0 });
    else router.push(href);
  };

  return (
    <form className={s.form} onSubmit={submit} noValidate>
      <BirthFields id={id} value={birth} onChange={setBirth} error={error} helper="카드를 찾는 데만 쓰고 저장하지 않아요. 주소에도 남지 않아요." />
      <Button type="submit" block variant={primary ? "primary" : "secondary"}>
        내 카드 찾기
      </Button>
    </form>
  );
}
