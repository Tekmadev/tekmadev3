import { getSupabaseAdmin } from "@/lib/supabase";
import { unsubscribeCopy } from "@/config/site";

/** A newsletter subscriber captured first-party from the site footer. */
export type SubscriberStatus = "active" | "unsubscribed" | "bounced" | "complained";

/**
 * Where the current status came from. Written to subscribers.status_source, and
 * the database trigger copies it onto the history row in subscriber_events.
 *
 * Every value is written by our own code. Nothing a visitor can put in a
 * request body ever reaches this column, because it is the provenance of a
 * consent decision: if a stranger can claim a withdrawal came from the CRM then
 * the column proves nothing at the moment we need it to prove something.
 * 'ghl_permanent' is a suppression the CRM reports as terminal (hard bounce,
 * spam complaint, carrier opt-out), which we record and never try to clear.
 */
export type SubscriberStatusSource =
  | "signup"
  | "email_link"
  | "unsubscribe_page"
  | "admin"
  | "ghl"
  | "ghl_permanent"
  | "reconcile"
  | "resend";

/** The subset the unsubscribe link, the admin and an inbound CRM event use. */
export type UnsubscribeSource = Extract<SubscriberStatusSource, "email_link" | "admin" | "ghl">;

/**
 * How suppressed an address is, as a ladder. Suppression is monotone: a write
 * may raise the rank and never lower it, which is what makes our unsubscribe
 * and a third party's unsubscribe crossing in flight converge on the same
 * answer instead of flapping.
 *
 * 1 is mailable. 2 is a withdrawal the person can reverse themselves. 3 is
 * permanent: a bounce or a spam complaint is evidence about the mailbox rather
 * than a preference, so no code path revives one. Rank alone cannot order
 * 'bounced' against 'complained', which is deliberate, see setSubscriberStatus.
 */
export function statusRank(s: SubscriberStatus): 1 | 2 | 3 {
  if (s === "active") return 1;
  if (s === "unsubscribed") return 2;
  return 3;
}

export type SubscriberRow = {
  id: string;
  created_at: string;
  email: string;
  status: SubscriberStatus;
  source: string;
  name: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  country: string | null;
  device: string | null;
  unsubscribe_token: string;
  ghl_synced_at: string | null;
  unsubscribed_at: string | null;
  status_source: string | null;
  unsubscribe_reason: string | null;
};

export type SubscriberStats = {
  total: number;
  active: number;
  unsubscribed: number;
  last30: number;
};

// Deliberately conservative: one @, one dot after it, no spaces. Real validation
// is the confirmation of a live inbox; this only rejects obvious junk.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Trim + lowercase + shape-check an email. null when it cannot be a valid address. */
export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const e = raw.trim().toLowerCase();
  if (e.length < 3 || e.length > 254) return null;
  if (!EMAIL_RE.test(e)) return null;
  return e;
}

export type AddSubscriberInput = {
  email: string; // must already be normalized via normalizeEmail
  source?: string;
  name?: string | null;
  path?: string | null;
  referrer?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  utm_term?: string | null;
  utm_content?: string | null;
  country?: string | null;
  device?: string | null;
  consentPolicyVersion?: string | null;
};

/** The minimal, non-PII-heavy shape we hand to the CRM sync after a successful add. */
export type AddedSubscriber = {
  email: string;
  name: string | null;
  source: string;
  /**
   * subscribers.public_id, the same opaque id the email tracking links already
   * carry, so an outbound sync can store one id that maps back to this row.
   * Never unsubscribe_token: that token unsubscribes whoever holds it, so it
   * must not travel outward or sit in a third party's custom field.
   */
  public_id: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
};

export type AddSubscriberResult =
  | {
      ok: true;
      created: boolean;
      reactivated: boolean;
      /**
       * The address is bounced or complained and the row was left untouched.
       * Callers must not report this to a visitor any differently from an
       * already-subscribed address, or the endpoint becomes a way to ask which
       * addresses are suppressed.
       */
      suppressed: boolean;
      subscriber: AddedSubscriber;
    }
  | { ok: false; reason: "config" | "db" };

/**
 * Idempotent subscribe. Inserts a new active subscriber; if the email already
 * exists it reactivates a previously unsubscribed address and otherwise is a
 * no-op success. `created || reactivated` signals a real change worth syncing.
 */
export async function addSubscriber(input: AddSubscriberInput): Promise<AddSubscriberResult> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { ok: false, reason: "config" };

  const now = new Date().toISOString();
  const summary: AddedSubscriber = {
    email: input.email,
    name: input.name ?? null,
    source: input.source ?? "footer",
    public_id: null,
    utm_source: input.utm_source ?? null,
    utm_medium: input.utm_medium ?? null,
    utm_campaign: input.utm_campaign ?? null,
  };

  const { data: existing, error: selErr } = await supabase
    .from("subscribers")
    .select("id,status,public_id")
    .eq("email", input.email)
    .maybeSingle();
  if (selErr) {
    console.error("[subscribers] select failed", selErr.message);
    return { ok: false, reason: "db" };
  }

  if (existing) {
    summary.public_id = (existing.public_id as string | null) ?? null;

    if (existing.status === "active") {
      return {
        ok: true,
        created: false,
        reactivated: false,
        suppressed: false,
        subscriber: summary,
      };
    }

    // A bounce or a spam complaint is evidence about the mailbox, not a
    // preference, and this path is reachable from an open endpoint that anyone
    // can post somebody else's address into. Reviving one from here would put a
    // person who reported us as spam back on the list and tell the CRM to clear
    // their DND flag. Refuse, and let the caller answer its visitor exactly as
    // it answers an already-subscribed address.
    if (existing.status === "bounced" || existing.status === "complained") {
      return {
        ok: true,
        created: false,
        reactivated: false,
        suppressed: true,
        subscriber: summary,
      };
    }

    const { data: revived, error: updErr } = await supabase
      .from("subscribers")
      .update({
        status: "active",
        // A fixed literal, never input.source. `source` arrives from a public
        // POST body, and status_source is the provenance of a consent decision:
        // left as the caller's value, a stranger could record this consent as
        // having come from the CRM or from the unsubscribe page. The caller's
        // own value stays in `source`, which is the column that describes where
        // the signup happened and is not evidence of anything.
        status_source: "signup",
        unsubscribed_at: null,
        unsubscribe_reason: null,
        updated_at: now,
        consented_at: now,
        consent_policy_version: input.consentPolicyVersion ?? null,
      })
      .eq("id", existing.id)
      // Compare and swap on the status we just read, so a complaint landing
      // between the select and this write is not overwritten by the revival.
      .eq("status", "unsubscribed")
      .select("id")
      .maybeSingle();
    if (updErr) {
      console.error("[subscribers] reactivate failed", updErr.message);
      return { ok: false, reason: "db" };
    }
    // No match means another writer changed the row first. Their outcome
    // stands, and nothing here changed, so this is the no-op success.
    if (!revived) {
      return {
        ok: true,
        created: false,
        reactivated: false,
        suppressed: false,
        subscriber: summary,
      };
    }
    return { ok: true, created: false, reactivated: true, suppressed: false, subscriber: summary };
  }

  // status_source is left null on a first signup on purpose: the trigger's
  // INSERT branch falls back to `source`, so the history row says "footer" or
  // "magnet:revenue-leak" rather than a flat "signup".
  const { data: inserted, error: insErr } = await supabase
    .from("subscribers")
    .insert({
      email: input.email,
      status: "active",
      source: input.source ?? "footer",
      name: input.name ?? null,
      path: input.path ?? null,
      referrer: input.referrer ?? null,
      utm_source: input.utm_source ?? null,
      utm_medium: input.utm_medium ?? null,
      utm_campaign: input.utm_campaign ?? null,
      utm_term: input.utm_term ?? null,
      utm_content: input.utm_content ?? null,
      country: input.country ?? null,
      device: input.device ?? null,
      consent_policy_version: input.consentPolicyVersion ?? null,
      consented_at: now,
    })
    .select("public_id")
    .maybeSingle();
  if (insErr) {
    // Race: a concurrent request inserted the same email between select and insert.
    // Prefer the stable SQLSTATE (23505 = unique_violation); fall back to message.
    // The winning insert fired the same triggers, so there is nothing to sync
    // here and no reason to spend a second query learning its public_id.
    if (insErr.code === "23505" || /duplicate key|unique/i.test(insErr.message)) {
      return {
        ok: true,
        created: false,
        reactivated: false,
        suppressed: false,
        subscriber: summary,
      };
    }
    console.error("[subscribers] insert failed", insErr.message);
    return { ok: false, reason: "db" };
  }
  summary.public_id = (inserted?.public_id as string | null) ?? null;
  return { ok: true, created: true, reactivated: false, suppressed: false, subscriber: summary };
}

/** What the unsubscribe page may know about whoever is holding the link. */
export type TokenSubscriber = {
  status: SubscriberStatus;
  /** Masked, e.g. "sa***@gmail.com". A forwarded email must not leak the address. */
  maskedEmail: string;
  unsubscribe_reason: string | null;
};

/** "sam@gmail.com" -> "sa***@gmail.com". Enough to recognise, not enough to harvest. */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf("@");
  if (at < 1) return "your address";
  const local = email.slice(0, at);
  return `${local.slice(0, local.length > 2 ? 2 : 1)}***${email.slice(at)}`;
}

/** Look up the holder of an unsubscribe link. Reads only, so a mail scanner opening the link changes nothing. */
export async function getSubscriberByToken(
  token: string,
): Promise<{ ok: true; subscriber: TokenSubscriber } | { ok: false; reason: "notfound" | "config" }> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { ok: false, reason: "config" };
  if (!UUID_RE.test(token)) return { ok: false, reason: "notfound" };

  const { data, error } = await supabase
    .from("subscribers")
    .select("email,status,unsubscribe_reason")
    .eq("unsubscribe_token", token)
    .maybeSingle();
  if (error) {
    console.error("[subscribers] token lookup failed", error.message);
    return { ok: false, reason: "config" };
  }
  if (!data) return { ok: false, reason: "notfound" };
  return {
    ok: true,
    subscriber: {
      status: data.status as SubscriberStatus,
      maskedEmail: maskEmail(String(data.email)),
      unsubscribe_reason: (data.unsubscribe_reason as string | null) ?? null,
    },
  };
}

/** How to find the row a status change applies to. */
export type SetStatusMatch =
  | { by: "id"; id: string }
  | { by: "token"; token: string }
  | { by: "email"; email: string };

export type SetStatusResult =
  | {
      ok: true;
      changed: boolean;
      subscriberId: string;
      from: SubscriberStatus;
      to: SubscriberStatus;
    }
  | { ok: false; reason: "config" | "notfound" | "refused" | "stale" | "db" };

/**
 * Per-status filters rather than one reused guard, because the four statuses
 * are not interchangeable and a single "is it suppressed" test loses the thing
 * that matters. A complaint from an address that already unsubscribed has to be
 * recorded, or we throw away the harder signal and the evidence that the person
 * escalated. A bounce must not overwrite a complaint, for the same reason in
 * reverse. And a person who bounced or complained is never revived: the
 * mailbox, not their preference, is what told us to stop.
 *
 * Only called when `from` and `to` differ.
 */
function transitionAllowed(from: SubscriberStatus, to: SubscriberStatus): boolean {
  // Consent is an act, so the only suppression that can be undone is the one
  // the person chose and can therefore choose again.
  if (to === "active") return from === "unsubscribed";
  if (to === "unsubscribed") return from === "active";
  if (to === "bounced") return from === "active" || from === "unsubscribed";
  return from !== "complained";
}

/**
 * The one door every status change goes through. It exists because there is no
 * other choke point: the unsubscribe page, the admin, a signup and an inbound
 * CRM event all write public.subscribers directly, and each of them used to
 * carry its own copy of the guards.
 *
 * What it guarantees, and what breaks without each one:
 *
 * - status_source is always written. The log trigger's UPDATE branch coalesces
 *   only to 'unknown', with no fallback to anything else, so a write that
 *   forgets it records the provenance of a consent withdrawal as the one thing
 *   we cannot defend, permanently, and the owner's inbox reads "Source:
 *   unknown".
 * - updated_at is always written in the same statement, because set_updated_at
 *   exists in the database but is not attached to this table. The only trigger
 *   on public.subscribers is subscribers_log_event.
 * - It never writes subscriber_events and never calls notifyAdmins. The trigger
 *   is the only writer of that table and its dedupe key is unique per history
 *   row, so a second write here would double the history and report every
 *   unsubscribe to the owner twice.
 */
export async function setSubscriberStatus(input: {
  match: SetStatusMatch;
  status: SubscriberStatus;
  source: SubscriberStatusSource;
  policyVersion?: string | null;
  reason?: string | null;
  /** Reject the write if our row changed after this instant. A stale webhook loses. */
  notNewerThan?: string | null;
}): Promise<SetStatusResult> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { ok: false, reason: "config" };

  const to = input.status;

  // Refused before we even read the row. The trigger records
  // consent_policy_version only on a transition into active, and that record is
  // the proof of the new consent: CASL puts the burden of proving it on us and
  // there is no way to add it afterwards. Every caller has
  // business.legalDates.lastUpdated from "@/config/site" to hand.
  if (to === "active" && !input.policyVersion) return { ok: false, reason: "refused" };

  let column: "id" | "unsubscribe_token" | "email";
  let value: string;
  if (input.match.by === "id") {
    if (!UUID_RE.test(input.match.id)) return { ok: false, reason: "notfound" };
    column = "id";
    value = input.match.id;
  } else if (input.match.by === "token") {
    if (!UUID_RE.test(input.match.token)) return { ok: false, reason: "notfound" };
    column = "unsubscribe_token";
    value = input.match.token;
  } else {
    // Normalized first because subscribers_email_key is unique on lower(email),
    // so the stored address is already lowercase and an exact match finds it.
    const email = normalizeEmail(input.match.email);
    if (!email) return { ok: false, reason: "notfound" };
    column = "email";
    value = email;
  }

  const { data: row, error: selErr } = await supabase
    .from("subscribers")
    .select("id,status,updated_at")
    .eq(column, value)
    .maybeSingle();
  if (selErr) {
    console.error("[subscribers] status read failed", selErr.message);
    return { ok: false, reason: "db" };
  }
  if (!row) return { ok: false, reason: "notfound" };

  const id = String(row.id);
  const from = row.status as SubscriberStatus;

  // A webhook that sat in somebody's retry queue must not overwrite a decision
  // the person made afterwards on our own site. Measured against the row we
  // just read, so the comparison is our clock deciding, not the sender's.
  if (input.notNewerThan) {
    const ours = Date.parse(String(row.updated_at ?? ""));
    const theirs = Date.parse(input.notNewerThan);
    if (Number.isFinite(ours) && Number.isFinite(theirs) && ours > theirs) {
      return { ok: false, reason: "stale" };
    }
  }

  // Already there, so nothing is written. Writing anyway would bump updated_at
  // and stamp this caller's status_source over the real one, rewriting the
  // provenance of a withdrawal that happened somewhere else, while the trigger
  // logged nothing at all because the status did not change.
  if (from === to) return { ok: true, changed: false, subscriberId: id, from, to };

  if (!transitionAllowed(from, to)) return { ok: false, reason: "refused" };

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    status: to,
    status_source: input.source,
    updated_at: now,
  };

  if (to === "active") {
    patch.unsubscribed_at = null;
    patch.unsubscribe_reason = null;
    patch.consented_at = now;
    patch.consent_policy_version = input.policyVersion;
  } else {
    patch.unsubscribed_at = now;
    // The optional "why are you leaving" answer, allowlisted exactly as
    // setUnsubscribeReason allowlists it. Any change to this column makes the
    // trigger write a 'feedback' history row whose text the owner's inbox
    // prints, so an arbitrary string from a webhook would land there verbatim.
    if (input.reason && unsubscribeCopy.reasons.some((r) => r.key === input.reason)) {
      patch.unsubscribe_reason = input.reason;
    }
  }

  const { data: updated, error: updErr } = await supabase
    .from("subscribers")
    .update(patch)
    .eq("id", id)
    // Compare and swap on the status we read. Our unsubscribe page and an
    // inbound CRM event can both pass the filter above at the same moment, and
    // without this the loser would apply a decision made against a state that
    // no longer exists.
    .eq("status", from)
    .select("id")
    .maybeSingle();
  if (updErr) {
    console.error("[subscribers] status write failed", updErr.message);
    return { ok: false, reason: "db" };
  }
  if (!updated) return { ok: false, reason: "stale" };

  return { ok: true, changed: true, subscriberId: id, from, to };
}

/**
 * Mark a subscriber unsubscribed by their opaque token. Idempotent: a row that
 * is already suppressed is left exactly as it is, so a second click never
 * writes a second history row and never rewrites the source of the first.
 */
export async function unsubscribeByToken(
  token: string,
  source: UnsubscribeSource = "email_link",
): Promise<"ok" | "notfound" | "config"> {
  const result = await setSubscriberStatus({
    match: { by: "token", token },
    status: "unsubscribed",
    source,
  });
  if (result.ok) return "ok";
  if (result.reason === "notfound") return "notfound";
  // "refused" is a bounced or complained row, suppressed harder than this
  // request asks for, and "stale" is another writer getting there first. Both
  // leave the person off the list, which is what they pressed the button for,
  // so neither one earns an error screen.
  if (result.reason === "refused" || result.reason === "stale") return "ok";
  return "config";
}

/**
 * Undo an unsubscribe from the same link. Pressing the button is the person's
 * own express consent, so it is stamped with the time and the policy version
 * like any other signup. Only an unsubscribed row comes back: a bounced or
 * complained address is never revived from here.
 */
export async function resubscribeByToken(
  token: string,
  consentPolicyVersion: string | null,
): Promise<"ok" | "notfound" | "config"> {
  const result = await setSubscriberStatus({
    match: { by: "token", token },
    status: "active",
    source: "unsubscribe_page",
    policyVersion: consentPolicyVersion,
  });
  if (result.ok) return "ok";
  if (result.reason === "config" || result.reason === "db") return "config";
  // "refused" covers a bounced or complained row and a missing policy version,
  // "stale" covers losing a race: in each case the row is not in the state this
  // undo needs, which is what the old filtered update reported as a miss.
  return "notfound";
}

/** Save the optional "why are you leaving" answer. Unknown keys are dropped, never stored. */
export async function setUnsubscribeReason(
  token: string,
  reason: string,
): Promise<"ok" | "notfound" | "config"> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return "config";
  if (!UUID_RE.test(token)) return "notfound";
  if (!unsubscribeCopy.reasons.some((r) => r.key === reason)) return "notfound";

  const { data, error } = await supabase
    .from("subscribers")
    .update({ unsubscribe_reason: reason, updated_at: new Date().toISOString() })
    .eq("unsubscribe_token", token)
    .eq("status", "unsubscribed")
    .select("id")
    .maybeSingle();
  if (error) {
    console.error("[subscribers] reason save failed", error.message);
    return "config";
  }
  return data ? "ok" : "notfound";
}

/** Resolve our opaque public_id (used in tracking URLs) to a subscriber id. */
export async function resolveSubscriberIdByPublicId(publicId: string): Promise<string | null> {
  if (!UUID_RE.test(publicId)) return null;
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  const { data } = await supabase
    .from("subscribers")
    .select("id")
    .eq("public_id", publicId)
    .maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

export async function getSubscribers(limit = 200): Promise<SubscriberRow[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];
  const { data } = await supabase
    .from("subscribers")
    .select(
      "id,created_at,email,status,source,name,utm_source,utm_medium,utm_campaign,country,device,unsubscribe_token,ghl_synced_at,unsubscribed_at,status_source,unsubscribe_reason",
    )
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data as SubscriberRow[]) ?? [];
}

export async function getSubscriberStats(): Promise<SubscriberStats> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { total: 0, active: 0, unsubscribed: 0, last30: 0 };

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const countQuery = () => supabase.from("subscribers").select("*", { count: "exact", head: true });

  const [total, active, unsub, last30] = await Promise.all([
    countQuery(),
    countQuery().eq("status", "active"),
    countQuery().eq("status", "unsubscribed"),
    countQuery().gte("created_at", since),
  ]);

  return {
    total: total.count ?? 0,
    active: active.count ?? 0,
    unsubscribed: unsub.count ?? 0,
    last30: last30.count ?? 0,
  };
}
