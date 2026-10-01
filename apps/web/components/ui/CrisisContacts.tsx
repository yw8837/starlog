import { CRISIS_CONTACTS, CRISIS_LEAD } from "@/lib/crisis";
import s from "./CrisisContacts.module.css";

type CrisisContactsProps = {
  /** Show the lead line above the contacts (off when the screen already said it). */
  lead?: boolean;
  className?: string;
};

/**
 * The lead in body text, then one helpline per line in slightly smaller text beside a soft gold
 * rule; each line is a tel: link with a full touch target. Paragraphs with list roles, so text
 * extraction (FAQ structured data) reads exactly what is shown.
 */
export function CrisisContacts({ lead = true, className }: CrisisContactsProps) {
  return (
    <div className={[s.crisis, className].filter(Boolean).join(" ")}>
      {lead ? <p className={s.lead}>{CRISIS_LEAD}</p> : null}
      <div className={s.contacts} role="list" aria-label="상담 전화">
        {CRISIS_CONTACTS.map((contact) => (
          <p key={contact.number} role="listitem" className={s.contact}>
            <a href={`tel:${contact.number}`} className={s.link}>
              {`${contact.name} `}
              <span className={s.number}>{contact.number}</span>
            </a>
            {contact.note ? <span className={s.note}>{` · ${contact.note}`}</span> : null}
          </p>
        ))}
      </div>
    </div>
  );
}
