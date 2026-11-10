import { json, parseCookies } from "@/lib/api/http";
import { SET_PRODUCT_ID, productById } from "@/lib/pay/catalog";
import { premiumOpen, premiumVisible, setOpen } from "@/lib/premium/flags";
import { PREMIUM, PREMIUM_IDS } from "@/lib/premium/products";
import { OWNER_COOKIE, isOwner } from "@/lib/security/owner";
import { signingSecret } from "@/lib/security/sign";

/**
 * GET → which premium readings this device may start now (`open`) and whether it may see them at all
 * (`visible`: entries and pages; false for everyone while STARLOG_PREMIUM is off), and whether the 2027 신년운세 +
 * 프리미엄 궁합 set may be ordered now (`set`, from its opening moment). No D1, no personal data.
 * Kept by this browser for a minute, never by a shared cache: the owner pass changes the answer (review 2026-10-17 L4).
 */
export async function GET(request: Request): Promise<Response> {
  const now = Date.now();
  const secret = signingSecret();
  const owner = secret ? await isOwner(parseCookies(request)[OWNER_COOKIE], secret, now) : false;
  const res = json({
    products: PREMIUM_IDS.map((id) => ({
      id, open: premiumOpen(id, owner, now), visible: premiumVisible(id, owner), opensAt: PREMIUM[id].opensAt ?? null, closesAt: PREMIUM[id].closesAt ?? null,
    })),
    set: { open: setOpen(owner, now), opensAt: productById(SET_PRODUCT_ID)!.opensAt ?? null },
  });
  res.headers.set("Cache-Control", "private, max-age=60");
  return res;
}
