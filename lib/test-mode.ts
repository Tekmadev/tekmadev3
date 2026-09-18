import { cookies } from "next/headers";
import { getAdminContext } from "@/lib/admin";
import { testModeConfigured, type StripeMode } from "@/lib/stripe-mode";

/**
 * The switch that lets an admin buy on the real site with Stripe test cards.
 *
 * The cookie is only a preference. It authorizes nothing: anyone can set a
 * cookie. What authorizes test mode is a signed-in admin, checked on the
 * server on every checkout. So a visitor who forges the cookie still pays
 * live, and an admin who never flipped the switch does too.
 *
 * It expires by itself after two hours, so a forgotten switch cannot leave
 * the owner's browser in test mode for days.
 */

const COOKIE = "tmd_stripe_test";
/** Readable by the page, so it can show the TEST MODE bar. A hint only; never trusted. */
export const TEST_MODE_UI_COOKIE = "tmd_stripe_test_ui";
const MAX_AGE = 2 * 60 * 60;

/** The mode a new checkout should run in. Live unless every condition for test holds. */
export async function checkoutMode(): Promise<StripeMode> {
  if (!testModeConfigured()) return "live";
  const jar = await cookies();
  if (jar.get(COOKIE)?.value !== "1") return "live";
  return (await getAdminContext()) ? "test" : "live";
}

export async function testModeSwitchedOn(): Promise<boolean> {
  return (await cookies()).get(COOKIE)?.value === "1";
}

/** Call only from an action that has already verified the admin. */
export async function setTestModeSwitch(on: boolean): Promise<void> {
  const jar = await cookies();
  const base = { path: "/", sameSite: "lax" as const, secure: process.env.NODE_ENV === "production" };
  if (on) {
    jar.set(COOKIE, "1", { ...base, httpOnly: true, maxAge: MAX_AGE });
    jar.set(TEST_MODE_UI_COOKIE, "1", { ...base, httpOnly: false, maxAge: MAX_AGE });
  } else {
    jar.delete(COOKIE);
    jar.delete(TEST_MODE_UI_COOKIE);
  }
}
