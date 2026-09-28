import type { GrowPath } from "@/config/grow";

/**
 * What the /grow form leaves for its welcome page, in this tab only
 * (sessionStorage). Never in the URL: the Meta pixel reports page addresses.
 * The welcome page must work without it (another device, private mode, a
 * link from the email), so every reader treats it as optional.
 */
export const GROW_SESSION_KEY = "tmd_grow";

export type GrowSession = {
  name: string;
  email: string;
  /** leads.id, passed to Cal so a booking attaches to this lead. Opaque, not personal data. */
  lead: string | null;
  path: GrowPath;
};

export function readGrowSession(): GrowSession | null {
  try {
    const raw = sessionStorage.getItem(GROW_SESSION_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<GrowSession>;
    if (typeof v.name !== "string" || typeof v.email !== "string") return null;
    return {
      name: v.name,
      email: v.email,
      lead: typeof v.lead === "string" ? v.lead : null,
      path: v.path === "webline" || v.path === "custom" ? v.path : "growth",
    };
  } catch {
    return null;
  }
}
