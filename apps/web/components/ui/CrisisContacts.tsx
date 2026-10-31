import { CARE_URGENT, CRISIS_CONTACTS, CRISIS_LEAD, EMERGENCY_LINES, TEXT_HELP, type CrisisContact } from "@/lib/crisis";
import s from "./CrisisContacts.module.css";

type CrisisContactsProps = {
  /** Show the lead line above the contacts (off when the screen already said it). */
  lead?: boolean;
  /**
   * Care screens (owner 2026-10-31): 109 by call or by text and 마들랜 on KakaoTalk first, the other lines folded under
   * 다른 상담 창구, since two or three at a time are easier to act on than four (Samaritans' guidance for tech).
   */
  compact?: boolean;
  /** A plan or a means next to the crisis words: the emergency lines lead. */
  urgent?: boolean;
  className?: string;
};

function Line({ contact }: { contact: CrisisContact }) {
  return (
    <p role="listitem" className={s.contact}>
      <a href={`tel:${contact.number}`} className={s.link}>
        {`${contact.name} `}
        <span className={s.number}>{contact.number}</span>
      </a>
      {contact.note ? <span className={s.note}>{` · ${contact.note}`}</span> : null}
    </p>
  );
}

/**
 * The lead in body text, then one helpline per line in slightly smaller text beside a soft gold
 * rule; each line is a tel: link with a full touch target. Paragraphs with list roles, so text
 * extraction (FAQ structured data) reads exactly what is shown.
 */
export function CrisisContacts({ lead = true, compact = false, urgent = false, className }: CrisisContactsProps) {
  const first = CRISIS_CONTACTS[0]!;
  return (
    <div className={[s.crisis, className].filter(Boolean).join(" ")}>
      {lead ? <p className={s.lead}>{CRISIS_LEAD}</p> : null}
      {urgent ? (
        <div className={s.urgent}>
          <p className={s.urgentLead}>{CARE_URGENT}</p>
          <div className={s.contacts} role="list" aria-label="긴급 전화">
            {EMERGENCY_LINES.map((contact) => (
              <Line key={contact.number} contact={contact} />
            ))}
          </div>
        </div>
      ) : null}
      {compact ? (
        <>
          <div className={s.contacts} role="list" aria-label="상담 전화와 문자">
            <p role="listitem" className={s.contact}>
              <a href={`tel:${first.number}`} className={s.link}>
                {`${first.name} `}
                <span className={s.number}>{first.number}</span>
              </a>
              <span className={s.note}>{` · ${first.note ?? ""} ·\u00a0`}</span>
              <a href={`sms:${TEXT_HELP.sms}`} className={s.link}>
                문자로 상담
              </a>
            </p>
            <p role="listitem" className={s.contact}>
              <span>{`SNS 상담 ${TEXT_HELP.name}`}</span>
              <span className={s.note}>{` · ${TEXT_HELP.how} · ${TEXT_HELP.note}`}</span>
            </p>
          </div>
          <details className={s.more}>
            <summary className={s.moreSummary}>다른 상담 창구</summary>
            <div className={s.contacts} role="list" aria-label="다른 상담 전화">
              {CRISIS_CONTACTS.slice(1).map((contact) => (
                <Line key={contact.number} contact={contact} />
              ))}
            </div>
          </details>
        </>
      ) : (
        <div className={s.contacts} role="list" aria-label="상담 전화">
          {CRISIS_CONTACTS.map((contact) => (
            <Line key={contact.number} contact={contact} />
          ))}
        </div>
      )}
    </div>
  );
}
