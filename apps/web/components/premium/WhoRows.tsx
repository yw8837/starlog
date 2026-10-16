import { profileSummary, type SajuForm } from "@/lib/sajuForm";
import p from "./premiumForm.module.css";

export interface WhoRow {
  name: string;
  form: SajuForm;
  /** 고치기's accessible name ("나의 태어난 날 고치기"). */
  edit: string;
  onEdit: () => void;
}

/** Who a premium reading is for (나, 그 사람), one line each from the birth, with 고치기. */
export function WhoRows({ rows }: { rows: WhoRow[] }) {
  return (
    <ul className={p.who}>
      {rows.map((row) => (
        <li key={row.name} className={p.whoRow}>
          <span className={p.whoText}>
            <span className={p.whoName}>{row.name}</span>
            <span className={p.whoLine}>{profileSummary(row.form)}</span>
          </span>
          <button type="button" className={p.edit} aria-label={row.edit} onClick={row.onEdit}>
            고치기
          </button>
        </li>
      ))}
    </ul>
  );
}
