// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { bondBasis } from "@starlog/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SAJU_FORM, withLeapChoice } from "@/lib/sajuForm";
import { BirthFields, EMPTY_BIRTH, birthBody, birthComplete, savedBirth, type BirthValue } from "./BirthFields";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

afterEach(cleanup);

function Harness({ onValue }: { onValue: (v: BirthValue) => void }) {
  const [value, setValue] = useState<BirthValue>(EMPTY_BIRTH);
  return (
    <BirthFields
      id="t"
      value={value}
      onChange={(v) => {
        setValue(v);
        onValue(v);
      }}
      helper="도움말"
    />
  );
}

describe("BirthFields", () => {
  it("starts with every part at 선택: no date is assumed", () => {
    render(<Harness onValue={() => undefined} />);
    for (const label of ["태어난 연도", "태어난 월", "태어난 일"]) {
      const select = screen.getByLabelText(label) as HTMLSelectElement;
      expect(select.value).toBe("");
      expect(select.options[0]?.textContent).toBe("선택");
    }
    expect(birthComplete(EMPTY_BIRTH)).toBe(false);
    expect(birthBody(EMPTY_BIRTH)).toBeNull();
  });

  it("gives a body only once year, month and day are all picked", () => {
    let last: BirthValue = EMPTY_BIRTH;
    render(<Harness onValue={(v) => (last = v)} />);
    fireEvent.change(screen.getByLabelText("태어난 연도"), { target: { value: "1993" } });
    fireEvent.change(screen.getByLabelText("태어난 월"), { target: { value: "2" } });
    expect(birthBody(last)).toBeNull();
    fireEvent.change(screen.getByLabelText("태어난 일"), { target: { value: "28" } });
    expect(birthBody(last)).toEqual({ calendar: "solar", year: 1993, month: 2, day: 28 });
    // back to 선택 empties the body again
    fireEvent.change(screen.getByLabelText("태어난 월"), { target: { value: "" } });
    expect(birthBody(last)).toBeNull();
  });
});

describe("savedBirth", () => {
  const unknown = withLeapChoice({ ...DEFAULT_SAJU_FORM, calendar: "lunar", year: 1952, month: 5, day: 30, timeKnown: true, hour: 9, minute: 0 }, "unknown");

  it("fills 윤달 모름 from the engine: 1952 음5-30 exists only in the 윤달, so the prefill is 윤달 and its 인연 basis computes", () => {
    const value = savedBirth(unknown)!;
    expect(value).toEqual({ calendar: "lunar", year: 1952, month: 5, day: 30, isLeapMonth: true });
    expect(() => bondBasis(birthBody(value)!)).not.toThrow();
  });

  it("keeps 평달 for 모름 when that month has the day (2023 음2-15), and an explicit choice as saved", () => {
    expect(savedBirth({ ...unknown, year: 2023, month: 2, day: 15 })?.isLeapMonth).toBe(false);
    const explicit = withLeapChoice({ ...unknown, year: 2023, month: 2, day: 15 }, "leap");
    expect(savedBirth(explicit)?.isLeapMonth).toBe(true);
    expect(savedBirth({ ...DEFAULT_SAJU_FORM })).toEqual({ calendar: "solar", year: 1990, month: 1, day: 1, isLeapMonth: false });
    expect(savedBirth(null)).toBeNull();
  });
});
