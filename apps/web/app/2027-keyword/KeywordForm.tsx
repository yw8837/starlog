"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { BIRTH_MISSING, BirthFields, EMPTY_BIRTH, birthComplete, type BirthValue } from "@/components/bonds/BirthFields";
import { Button } from "@/components/ui/Button";
import { iljuOfBirth, keywordPath } from "@/lib/keyword2027";
import s from "./keyword.module.css";

/**
 * 내 키워드 찾기: the date-only birth fields of 별자리 인연, then the 일주's page. The date stays in this component's
 * state: it is never stored, sent or put in the address; the page is opened by the 일주's slug alone. The form page's
 * button is the screen's gold primary; on a result page (`primary={false}`) the CTAs keep that place.
 */
export function KeywordForm({ primary = true }: { primary?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const [birth, setBirth] = useState<BirthValue>(EMPTY_BIRTH);
  const [error, setError] = useState("");

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!birthComplete(birth)) {
      setError(BIRTH_MISSING);
      return;
    }
    const result = iljuOfBirth(birth);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setError("");
    const href = keywordPath(result.ilju);
    // The 일주 of the page shown (a friend shared it): back up to the result rather than a push that changes nothing.
    if (href === pathname) window.scrollTo({ top: 0 });
    else router.push(href);
  };

  return (
    <form className={s.panel} onSubmit={submit} noValidate>
      <BirthFields
        id="keyword-birth"
        value={birth}
        onChange={(next) => {
          setBirth(next);
          setError("");
        }}
        error={error}
        helper="생일은 키워드를 찾는 데만 쓰고 저장하지 않아요. 주소에도 남지 않아요."
      />
      <Button type="submit" variant={primary ? "primary" : "secondary"} block>
        내 키워드 보기
      </Button>
    </form>
  );
}
