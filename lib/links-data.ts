import { getSupabaseAdmin } from "@/lib/supabase";

/** A vanity / tracking link resolved at /<slug> and managed in the dashboard. */
export type LinkRow = {
  id: string;
  created_at: string;
  slug: string;
  destination: string;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  label: string | null;
  active: boolean;
  click_count: number;
};

/** One logged click (raw analytics) behind a link. */
export type LinkClickRow = {
  created_at: string;
  slug: string | null;
  device: string | null;
  country: string | null;
  referrer: string | null;
};

/**
 * Root paths and system routes a vanity slug must never shadow. Next resolves
 * real routes before the root [slug] segment, so a link on one of these would
 * silently never resolve; we block them at creation time to avoid dead links.
 */
export const RESERVED_SLUGS = new Set([
  "admin", "api", "start", "privacy", "terms", "cookies", "guides",
  "llms.txt", "sitemap.xml", "robots.txt", "manifest.webmanifest",
  "opengraph-image", "twitter-image", "favicon.ico", "not-found",
  "_next", "_vercel", "images", "fonts",
]);

/** Lowercase, dash-separated, url-safe slug. Empty string if nothing usable. */
export function normalizeSlug(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

export function isReservedSlug(slug: string): boolean {
  return RESERVED_SLUGS.has(slug);
}

/**
 * Resolve a link's destination, appending its UTM tags so the existing
 * attribution pipeline (lib/attribution.ts -> leads/subscriptions) stamps every
 * downstream booking or sale with the source. Existing query params win.
 */
export function buildLinkDestination(link: LinkRow): string {
  const utms: [string, string][] = [];
  if (link.utm_source) utms.push(["utm_source", link.utm_source]);
  if (link.utm_medium) utms.push(["utm_medium", link.utm_medium]);
  if (link.utm_campaign) utms.push(["utm_campaign", link.utm_campaign]);

  const isExternal = /^https?:\/\//i.test(link.destination);
  const base = isExternal
    ? link.destination
    : link.destination.startsWith("/")
      ? link.destination
      : `/${link.destination}`;

  if (utms.length === 0) return base;

  if (isExternal) {
    try {
      const u = new URL(base);
      for (const [k, v] of utms) if (!u.searchParams.has(k)) u.searchParams.set(k, v);
      return u.toString();
    } catch {
      return base;
    }
  }

  const [path, existing = ""] = base.split("?");
  const params = new URLSearchParams(existing);
  for (const [k, v] of utms) if (!params.has(k)) params.set(k, v);
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

export async function getLinks(): Promise<LinkRow[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];
  const { data } = await supabase.from("links").select("*").order("created_at", { ascending: false });
  return (data as LinkRow[]) ?? [];
}

export async function getActiveLinkBySlug(slug: string): Promise<LinkRow | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  const { data } = await supabase
    .from("links")
    .select("*")
    .eq("slug", slug)
    .eq("active", true)
    .maybeSingle();
  return (data as LinkRow | null) ?? null;
}

export async function getRecentLinkClicks(limit = 25): Promise<LinkClickRow[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];
  const { data } = await supabase
    .from("link_clicks")
    .select("created_at,slug,device,country,referrer")
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data as LinkClickRow[]) ?? [];
}

/** Log a click (raw analytics) and bump the denormalized counter. Best-effort. */
export async function logLinkClick(input: {
  link: LinkRow;
  referrer: string | null;
  device: string | null;
  country: string | null;
}): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return;
  const { link } = input;
  try {
    await supabase.from("link_clicks").insert({
      link_id: link.id,
      slug: link.slug,
      referrer: input.referrer,
      device: input.device,
      country: input.country,
      utm_source: link.utm_source,
      utm_medium: link.utm_medium,
      utm_campaign: link.utm_campaign,
    });
    await supabase.rpc("increment_link_click", { p_id: link.id });
  } catch (err) {
    console.error("[links] click log failed", err instanceof Error ? err.message : String(err));
  }
}
