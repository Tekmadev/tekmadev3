import type { SupabaseClient } from "@supabase/supabase-js";
import { offerName } from "@/config/products";
import { CLIENT_STATUS_LABEL, type ClientStatus } from "@/lib/clients-data";
import { scopeLabel, type CouponScope } from "@/lib/coupon-scopes";
import { formatMoney } from "@/lib/money";
import type { ApiContext } from "./auth";
import { dbError, instant, requireDb } from "./data";
import { metaForLabels, metaLabel, type MetaValues } from "./meta";
import { pgQuote } from "./cursor";

/**
 * GET /search: clients, leads, subscribers, posts, coupons and links in one
 * ranked list (docs/api-requests/search.md in the app repo).
 *
 * Matching is case, accent and punctuation insensitive, words in any order,
 * phone numbers by digits. The database narrows the candidates with an
 * accent and apostrophe tolerant regex per word (so "Côté" finds "Cote" and
 * "lets talk" finds "Let's Talk"); the ranking below is the mock's, exactly:
 * per field exact, starts with, a word starts with, contains; names, titles,
 * codes and slugs above other fields except that an exact email or code is as
 * good as an exact name; ties by type, then newest.
 *
 * Who sees what follows the permission matrix: a type is searched only when
 * the caller holds its `*.view` capability (managers: clients and leads only),
 * and test clients only with `testdata.view` (owners).
 */

export type SearchResultType = "client" | "lead" | "subscriber" | "post" | "coupon" | "link";
export type SearchResult = { type: SearchResultType; id: string; title: string; subtitle: string; url: string };

export const SEARCH_MAX = 20;
const QUERY_MAX = 100;
/** Below this length a word only matches at the start of a word ("ai" finds "Aisha", not "Detailing"). */
const MIN_INSIDE_WORD = 3;
/** Candidates fetched per type before ranking. */
const CANDIDATES = 100;
/**
 * Words sent to the database prefilter (the longest ones). Fewer words is
 * still a superset of the matches, and it keeps the request URL short; the
 * ranking below checks every word.
 */
const PREFILTER_WORDS = 6;
/** Ids per word when a client is found through its portal members. */
const MEMBER_IDS_PER_WORD = 30;

/* ------------------------------------------------------------------ */
/* Folding and scoring (same as the app mock: fixtures/overview.ts)    */
/* ------------------------------------------------------------------ */

/**
 * Text folded for matching: lowercase, accents and apostrophes dropped, every
 * other run of punctuation a single space. "Let's Talk" reads "lets talk",
 * "dan@acmeplumbing.test" reads "dan acmeplumbing test".
 */
export function foldSearchText(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const digitsOf = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");

type Candidate = SearchResult & {
  primary: (string | null | undefined)[];
  secondary: (string | null | undefined)[];
  phones?: (string | null | undefined)[];
  recency: string;
};

function fieldScore(field: string, q: string): number {
  if (!field) return 0;
  if (field === q) return 100;
  if (field.startsWith(q)) return 80;
  if (` ${field}`.includes(` ${q}`)) return 60;
  if (q.length >= MIN_INSIDE_WORD && field.includes(q)) return 30;
  return 0;
}

function scoreOf(c: Candidate, q: string, tokens: string[], qDigits: string): number {
  const primary = c.primary.map((f) => foldSearchText(f ?? ""));
  const secondary = c.secondary.map((f) => foldSearchText(f ?? ""));
  let best = 0;
  for (const f of primary) best = Math.max(best, fieldScore(f, q));
  for (const f of secondary) {
    const s = fieldScore(f, q);
    best = Math.max(best, s === 100 ? 100 : s * 0.75);
  }
  if (best === 0 && tokens.length > 1) {
    const all = ` ${[...primary, ...secondary].join(" ")}`;
    if (tokens.every((t) => all.includes(` ${t}`))) best = 20;
    else if (tokens.every((t) => t.length >= MIN_INSIDE_WORD && all.includes(t))) best = 10;
  }
  if (best < 50 && qDigits.length >= 4 && c.phones?.some((p) => digitsOf(p).includes(qDigits))) best = 50;
  return best;
}

const TYPE_ORDER: Record<SearchResultType, number> = { client: 0, lead: 1, subscriber: 2, post: 3, coupon: 4, link: 5 };

const joinParts = (parts: (string | null | undefined | false)[]) => parts.filter((p): p is string => !!p).join(" · ");

/* ------------------------------------------------------------------ */
/* Database prefilter                                                  */
/* ------------------------------------------------------------------ */

const ACCENTED: Record<string, string> = {
  a: "aàáâãäåā",
  c: "cç",
  e: "eèéêëē",
  i: "iìíîïī",
  n: "nñ",
  o: "oòóôõöøō",
  u: "uùúûüū",
  y: "yýÿ",
};

/**
 * A Postgres regex (used with imatch, case insensitive) that matches where the
 * folded text would contain `token`: each letter may carry an accent and
 * apostrophes may sit between letters. Short words must start a word.
 */
function tokenRegex(token: string): string {
  const body = token
    .split("")
    .map((ch) => (ACCENTED[ch] ? `[${ACCENTED[ch]}]` : ch))
    .join("['’]?");
  return token.length < MIN_INSIDE_WORD ? `(^|[^[:alnum:]'’])${body}` : body;
}

// Only "?" repeats: no "*" (a wildcard for some PostgREST operators) and no
// "{m,n}" (its comma would need quoting care) in a filter value.
const digitsRegex = (digits: string) => digits.split("").join("[^0-9]?[^0-9]?[^0-9]?");

/**
 * The `.or()` filter: every word matches one of `columns` (or one of the
 * `extra` conditions for that word), or the phone column matches the digits.
 */
function prefilter(
  columns: string[],
  tokens: string[],
  opts: { phone?: { column: string; digits: string }; extra?: (token: string) => string[] } = {},
): string {
  const groups = tokens.map((t) => {
    const re = pgQuote(tokenRegex(t));
    return [...columns.map((c) => `${c}.imatch.${re}`), ...(opts.extra?.(t) ?? [])];
  });
  const phone = opts.phone && opts.phone.digits.length >= 4 ? [`${opts.phone.column}.imatch.${pgQuote(digitsRegex(opts.phone.digits))}`] : [];
  if (groups.length === 1) return [...groups[0], ...phone].join(",");
  return [`and(${groups.map((g) => `or(${g.join(",")})`).join(",")})`, ...phone].join(",");
}

/** Whether folded text holds a word the way the prefilter would match it. */
function foldedHas(folded: string, token: string): boolean {
  return token.length < MIN_INSIDE_WORD ? ` ${folded}`.includes(` ${token}`) : folded.includes(token);
}

/** Ids of rows in a small in-memory list (category names) that hold a word. */
function idsMatching(rows: { id: string; name: string }[], token: string): string[] {
  return rows.filter((r) => foldedHas(foldSearchText(r.name), token)).map((r) => r.id);
}

/* ------------------------------------------------------------------ */
/* Candidates per type                                                 */
/* ------------------------------------------------------------------ */

type Query = { tokens: string[]; digits: string };

type ClientRow = {
  id: string;
  business_name: string;
  legal_name: string | null;
  website_url: string | null;
  primary_email: string;
  primary_phone: string | null;
  status: string;
  plan_id: string | null;
  is_test: boolean | null;
  updated_at: string;
};
const CLIENT_COLUMNS = "id,business_name,legal_name,website_url,primary_email,primary_phone,status,plan_id,is_test,updated_at";

async function clientCandidates(db: SupabaseClient, q: Query, meta: MetaValues, includeTest: boolean): Promise<Candidate[]> {
  // Contact names live on the portal members. Find the members matching any
  // word, then let each word match a client through them as well.
  const memberMatch = await db
    .from("client_members")
    .select("client_id,name,email")
    .or(q.tokens.flatMap((t) => ["name", "email"].map((c) => `${c}.imatch.${pgQuote(tokenRegex(t))}`)).join(","))
    .limit(500);
  if (memberMatch.error) throw dbError("search client members", memberMatch.error);
  const memberRows = (memberMatch.data ?? []) as { client_id: string; name: string | null; email: string }[];
  const clientIdsFor = (token: string) =>
    [
      ...new Set(
        memberRows
          .filter((m) => foldedHas(foldSearchText(m.name ?? ""), token) || foldedHas(foldSearchText(m.email), token))
          .map((m) => String(m.client_id)),
      ),
    ].slice(0, MEMBER_IDS_PER_WORD);

  let query = db
    .from("clients")
    .select(CLIENT_COLUMNS)
    .is("deleted_at", null)
    .or(
      prefilter(["business_name", "legal_name", "website_url", "primary_email"], q.tokens, {
        phone: { column: "primary_phone", digits: q.digits },
        extra: (token) => {
          const ids = clientIdsFor(token);
          return ids.length ? [`id.in.(${ids.join(",")})`] : [];
        },
      }),
    );
  if (!includeTest) query = query.eq("is_test", false);
  const { data, error } = await query.order("updated_at", { ascending: false }).limit(CANDIDATES);
  if (error) throw dbError("search clients", error);

  const rows = new Map<string, ClientRow>();
  for (const row of (data ?? []) as ClientRow[]) rows.set(row.id, row);
  if (rows.size === 0) return [];

  // The contact name: the portal owner first, else the first member with a name.
  const members = await db
    .from("client_members")
    .select("client_id,name,role,created_at")
    .in("client_id", [...rows.keys()])
    .order("created_at", { ascending: true });
  if (members.error) throw dbError("search client contacts", members.error);
  const contact = new Map<string, string>();
  const rank = (role: string) => (role === "owner" ? 0 : role === "admin" ? 1 : 2);
  const sorted = ((members.data ?? []) as { client_id: string; name: string | null; role: string }[])
    .filter((m) => m.name && m.name.trim())
    .sort((a, b) => rank(a.role) - rank(b.role));
  for (const m of sorted) if (!contact.has(m.client_id)) contact.set(m.client_id, (m.name ?? "").trim());

  return [...rows.values()].map((c) => {
    const statusFallback = CLIENT_STATUS_LABEL[c.status as ClientStatus] ?? null;
    return {
      type: "client" as const,
      id: c.id,
      title: c.business_name,
      subtitle: joinParts([
        !!c.is_test && "Test",
        metaLabel(meta, "clientStatuses", c.status, statusFallback),
        offerName(c.plan_id) ?? (c.plan_id ? c.plan_id : "No plan"),
        c.primary_email,
      ]),
      url: `/admin/clients/${encodeURIComponent(c.id)}`,
      primary: [c.business_name],
      secondary: [c.primary_email, contact.get(c.id) ?? null, c.legal_name, c.website_url?.replace(/^https?:\/\/(www\.)?/i, "")],
      phones: [c.primary_phone],
      recency: instant(c.updated_at),
    };
  });
}

const LEAD_SOURCE_FALLBACK: Record<string, string> = {
  cal_booking: "Booked call",
  grow: "Lead form",
  lead_magnet: "Free tool",
  portal_signup: "Portal sign-up",
  outreach: "Outreach",
};

type LeadRow = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  business_name: string | null;
  status: string | null;
  source: string | null;
  created_at: string;
};

async function leadCandidates(db: SupabaseClient, q: Query, meta: MetaValues): Promise<Candidate[]> {
  const { data, error } = await db
    .from("leads")
    .select("id,name,email,phone,business_name,status,source,created_at")
    .or(prefilter(["name", "email", "business_name"], q.tokens, { phone: { column: "phone", digits: q.digits } }))
    .order("created_at", { ascending: false })
    .limit(CANDIDATES);
  if (error) throw dbError("search leads", error);
  return ((data ?? []) as LeadRow[]).map((l) => ({
    type: "lead" as const,
    id: l.id,
    title: l.name || l.email || l.business_name || "Unnamed lead",
    subtitle: joinParts([
      metaLabel(meta, "leadStatuses", l.status),
      metaLabel(meta, "leadSources", l.source, l.source ? LEAD_SOURCE_FALLBACK[l.source] : null),
      l.name ? l.email : l.business_name,
    ]),
    url: `/admin/leads/${encodeURIComponent(l.id)}`,
    primary: [l.name],
    secondary: [l.email, l.business_name],
    phones: [l.phone],
    recency: instant(l.created_at),
  }));
}

async function subscriberCandidates(db: SupabaseClient, q: Query, meta: MetaValues): Promise<Candidate[]> {
  const { data, error } = await db
    .from("subscribers")
    .select("id,email,status,source,created_at")
    .or(prefilter(["email"], q.tokens))
    .order("created_at", { ascending: false })
    .limit(CANDIDATES);
  if (error) throw dbError("search subscribers", error);
  return ((data ?? []) as { id: string; email: string; status: string; source: string | null; created_at: string }[]).map((s) => ({
    type: "subscriber" as const,
    id: s.id,
    title: s.email,
    subtitle: joinParts([metaLabel(meta, "subscriberStatuses", s.status), metaLabel(meta, "subscriberSources", s.source)]),
    url: `/admin/email/subscribers/${encodeURIComponent(s.id)}`,
    primary: [s.email],
    secondary: [],
    recency: instant(s.created_at),
  }));
}

async function postCandidates(db: SupabaseClient, q: Query, meta: MetaValues): Promise<Candidate[]> {
  const cats = await db.from("blog_categories").select("id,name");
  if (cats.error) throw dbError("search blog categories", cats.error);
  const categories = (cats.data ?? []) as { id: string; name: string }[];
  const categoryName = new Map(categories.map((c) => [c.id, c.name]));

  const { data, error } = await db
    .from("blog_posts")
    .select("id,title,slug,target_query,status,category_id,updated_at")
    .is("deleted_at", null)
    .or(
      prefilter(["title", "slug", "target_query"], q.tokens, {
        extra: (token) => {
          const ids = idsMatching(categories, token);
          return ids.length ? [`category_id.in.(${ids.join(",")})`] : [];
        },
      }),
    )
    .order("updated_at", { ascending: false })
    .limit(CANDIDATES);
  if (error) throw dbError("search posts", error);
  return (
    (data ?? []) as { id: string; title: string; slug: string; target_query: string | null; status: string; category_id: string | null; updated_at: string }[]
  ).map((p) => {
    const category = p.category_id ? categoryName.get(p.category_id) ?? null : null;
    return {
      type: "post" as const,
      id: p.id,
      title: p.title,
      subtitle: joinParts([metaLabel(meta, "blogStatuses", p.status), category ?? "No category"]),
      url: `/admin/blog/${encodeURIComponent(p.id)}`,
      primary: [p.title],
      secondary: [p.slug, p.target_query, category],
      recency: instant(p.updated_at),
    };
  });
}

type CouponRow = {
  id: string;
  code: string;
  name: string | null;
  discount_type: string;
  percent_off: number | null;
  amount_off: number | null;
  currency: string | null;
  applies_to: string;
  active: boolean;
  created_at: string;
};

async function couponCandidates(db: SupabaseClient, q: Query, meta: MetaValues): Promise<Candidate[]> {
  const { data, error } = await db
    .from("coupons")
    .select("id,code,name,discount_type,percent_off,amount_off,currency,applies_to,active,created_at")
    .or(prefilter(["code", "name"], q.tokens))
    .order("created_at", { ascending: false })
    .limit(CANDIDATES);
  if (error) throw dbError("search coupons", error);
  return ((data ?? []) as CouponRow[]).map((c) => {
    const off =
      c.discount_type === "percent" || (c.percent_off !== null && c.amount_off === null)
        ? `${c.percent_off ?? 0}% off`
        : `${formatMoney(c.amount_off ?? 0, c.currency || "CAD")} off`;
    return {
      type: "coupon" as const,
      id: c.id,
      title: c.code,
      subtitle: joinParts([
        off,
        metaLabel(meta, "couponScopes", c.applies_to, scopeLabel(c.applies_to as CouponScope)),
        metaLabel(meta, "couponStatuses", c.active ? "active" : "disabled"),
        c.name,
      ]),
      // Coupons have no detail screen: the list is the destination.
      url: "/admin/coupons",
      primary: [c.code],
      secondary: [c.name],
      recency: instant(c.created_at),
    };
  });
}

type LinkRow = {
  id: string;
  slug: string;
  label: string | null;
  destination: string;
  utm_campaign: string | null;
  utm_source: string | null;
  active: boolean;
  created_at: string;
};

async function linkCandidates(db: SupabaseClient, q: Query): Promise<Candidate[]> {
  const { data, error } = await db
    .from("links")
    .select("id,slug,label,destination,utm_campaign,utm_source,active,created_at")
    .or(prefilter(["slug", "label", "destination", "utm_campaign", "utm_source"], q.tokens))
    .order("created_at", { ascending: false })
    .limit(CANDIDATES);
  if (error) throw dbError("search links", error);
  return ((data ?? []) as LinkRow[]).map((l) => ({
    type: "link" as const,
    id: l.id,
    title: `tekmadev.com/${l.slug}`,
    subtitle: joinParts([l.label, l.destination, !l.active && "Disabled"]),
    url: `/admin/links/${encodeURIComponent(l.id)}`,
    primary: [l.slug, l.label],
    secondary: [l.destination, l.utm_campaign, l.utm_source],
    recency: instant(l.created_at),
  }));
}

/* ------------------------------------------------------------------ */
/* Entry point                                                         */
/* ------------------------------------------------------------------ */

/** The ranked results for a query, filtered by the caller's role. Never a 400. */
export async function searchAdmin(ctx: ApiContext, rawQuery: string): Promise<SearchResult[]> {
  const cut = rawQuery.slice(0, QUERY_MAX);
  const q = foldSearchText(cut);
  if (!q) return [];
  const tokens = q.split(" ");
  // Only a query that looks like a phone number is matched against phone digits.
  const digits = /^[\d\s()+.-]+$/.test(cut.trim()) ? digitsOf(cut) : "";
  const query: Query = { tokens: [...new Set(tokens)].sort((a, b) => b.length - a.length).slice(0, PREFILTER_WORDS), digits };

  const db = requireDb();
  const meta = await metaForLabels(ctx);

  const jobs: Promise<Candidate[]>[] = [];
  if (ctx.can("clients.view")) jobs.push(clientCandidates(db, query, meta, ctx.can("testdata.view")));
  if (ctx.can("leads.view")) jobs.push(leadCandidates(db, query, meta));
  if (ctx.can("email.subscribers.view")) jobs.push(subscriberCandidates(db, query, meta));
  if (ctx.can("blog.view")) jobs.push(postCandidates(db, query, meta));
  if (ctx.can("coupons.view")) jobs.push(couponCandidates(db, query, meta));
  if (ctx.can("links.view")) jobs.push(linkCandidates(db, query));
  const pool = (await Promise.all(jobs)).flat();

  return pool
    .map((c) => ({ c, score: scoreOf(c, q, tokens, digits) }))
    .filter((x) => x.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        TYPE_ORDER[a.c.type] - TYPE_ORDER[b.c.type] ||
        b.c.recency.localeCompare(a.c.recency) ||
        a.c.title.localeCompare(b.c.title),
    )
    .slice(0, SEARCH_MAX)
    .map(({ c }) => ({ type: c.type, id: c.id, title: c.title, subtitle: c.subtitle, url: c.url }));
}
