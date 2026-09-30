import { DotLine } from "@/components/ui/DotLine";
import { chartInputLine, type SajuForm } from "@/lib/sajuForm";
import s from "./InputLine.module.css";

/** "1990년 1월 1일 (양력) · 시간 모름 · 여성 · 서울". Blank until the saved input is read. */
export function InputLine({ form, className }: { form: SajuForm | null; className?: string }) {
  return <p className={className ? `${s.line} ${className}` : s.line}>{form ? <DotLine parts={chartInputLine(form).split(" · ")} /> : " "}</p>;
}
