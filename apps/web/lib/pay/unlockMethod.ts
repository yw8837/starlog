/** How a full reading is opened: 첫 이용 무료 (the device's one free tarot reading), a paid purchase, the signup gift (`free`, tarot only), or the owner pass. */
export const UNLOCK_METHODS = ["opening", "paid", "free", "owner"] as const;
export type UnlockMethod = (typeof UNLOCK_METHODS)[number];
