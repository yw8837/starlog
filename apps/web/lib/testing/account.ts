import { setAccountForTests, type AccountState } from "@/lib/account/client";

export const MEMBER_STATE: AccountState = { payments: true, login: true, owner: false, user: { nickname: "별", gift: null, unused: [], opening: [] } };

/** The screens as a logged-in account sees them, as if /api/me had answered: what a device keeps shows only with a session (owner 2026-11-05). */
export const asMember = (): void => setAccountForTests(MEMBER_STATE);
