/** How a full reading is opened: the 오픈 기념 daily free one, a paid purchase, the signup gift (`free`, tarot only), or the owner pass. */
export const UNLOCK_METHODS = ["opening", "paid", "free", "owner"] as const;
export type UnlockMethod = (typeof UNLOCK_METHODS)[number];
