import {
  PROBE_TIMEOUT_MS,
  addTags,
  crmFetch,
  getContact,
  removeTags,
  setEmailDnd,
  upsertContact,
  type GhlContact,
} from "@/lib/crm/client";
import { crmConfig, patchCrmProbeSetting, setCrmSync, type CrmConfig } from "@/lib/crm/config";
import { readEmailDnd, writeEmailDnd } from "@/lib/crm/dnd";
import { CRM_FIELDS, resolveFieldIds } from "@/lib/crm/fields";
import { emailKey } from "@/lib/crm/identity";

/**
 * The arming gate.
 *
 * Eight facts this integration stands on are either contradictory in the
 * official documentation or undocumented altogether, and three of them, read
 * backwards, invert somebody's consent: we would mark a person who opted out
 * as mailable and never notice. So none of them is assumed. Nothing arms until
 * every one has been demonstrated against the owner's own sub-account, which
 * is what `health = "ok"` means and why lib/crm/config.ts refuses every
 * surface until it says so.
 *
 * The rule this module is built on: a check that could not be performed
 * reports ok:false with the reason. There is no default pass anywhere in here.
 * A probe that cannot reach the API, or that gets an answer it cannot
 * interpret, leaves the integration disarmed, because the alternative is
 * arming on an assumption and finding out from a complaint.
 *
 * Everything happens on one disposable contact at an address at our own
 * domain, created with its email channel already suppressed so that no
 * workflow on their side can mail it even for the seconds it exists. It is
 * suppressed again and deleted when the probe finishes; if the delete is
 * refused, what is left behind is one contact obviously named as a probe, and
 * the stored result says so.
 *
 * Cost: roughly twenty API calls, plus one per custom field that has to be
 * created on the first run. All of it inside the owner's click on
 * /admin/crm, which is why the raw calls use the shorter probe timeout.
 */

/** Table order from the design, which is also display order on /admin/crm. */
const CHECK_NAMES = [
  "auth",
  "dnd_polarity",
  "dnd_legacy_rejected",
  "lookup_with_pit",
  "tags_preserved_on_upsert",
  "delete_tags_body",
  "dedupe_on_email",
  "custom_fields",
] as const;

export type CrmProbeCheckName = (typeof CHECK_NAMES)[number];

export type ProbeCheck = { name: CrmProbeCheckName; ok: boolean; detail: string };

export type CrmProbeResult =
  | { ok: true; checks: ProbeCheck[]; at: string }
  | { ok: false; checks: ProbeCheck[]; error: string };

/**
 * The disposable contact.
 *
 * At our own domain on purpose: an address at a domain we do not control could
 * be a real person's, and a probe must never create or suppress a contact that
 * belongs to somebody. The local part says what it is, so the one that a
 * failed cleanup leaves behind is self-explanatory in the owner's contact list.
 */
const PROBE_EMAIL = "crm-probe@tekmadev.com";

/**
 * Deliberately outside the tmd- vocabulary in lib/crm/tags.ts.
 *
 * isCrmTag() does not recognise it, so reconciliation can never decide this
 * tag belongs on a real contact, and nothing in the live path will ever write
 * or remove it.
 */
const PROBE_TAG = "tmd-probe-only";

/**
 * Two numbers from the 555-01xx block, which is reserved for fiction and can
 * never reach anyone. The dedupe check has to send DIFFERENT phone numbers to
 * prove matching happens on the email, and sending a real number would risk
 * matching a real contact on the phone, which is the exact accident the whole
 * mismatch guard exists for.
 */
const PROBE_PHONE_A = "+16135550100";
const PROBE_PHONE_B = "+16135550101";

const DETAIL_MAX = 400;

type Recorder = {
  record: (name: CrmProbeCheckName, ok: boolean, detail: string) => boolean;
  checks: ProbeCheck[];
};

function recorder(): Recorder {
  const checks: ProbeCheck[] = [];
  return {
    checks,
    record: (name, ok, detail) => {
      checks.push({ name, ok, detail: detail.length > DETAIL_MAX ? `${detail.slice(0, DETAIL_MAX)}...` : detail });
      return ok;
    },
  };
}

/** Anything not reached gets an honest "not run", never a pass. */
function settle(checks: ProbeCheck[], reason: string): ProbeCheck[] {
  const byName = new Map(checks.map((c) => [c.name, c]));
  return CHECK_NAMES.map((name) => byName.get(name) ?? { name, ok: false, detail: `not run: ${reason}` });
}

/** What readEmailDnd made of a contact, in one line for the checklist. */
function dndLine(contact: GhlContact): string {
  const read = readEmailDnd(contact.dndSettings, contact.dnd);
  return `email channel "${read.state}"${read.code ? ` (code ${read.code})` : ""}, global dnd ${String(contact.dnd)}${
    read.conflict ? ", which disagree" : ""
  }`;
}

/**
 * Check 1, and the prerequisite for every other one.
 *
 * A successful upsert proves the whole credential story at once: the token
 * authenticates, the sub-account id is accepted, and `Version: v3` (which the
 * client puts on every request and whose enum has exactly one member) was not
 * refused. It also proves the returned contact is the address we asked for
 * rather than one the sub-account matched on some other field.
 *
 * The contact is created with its email channel already suppressed. Creating
 * an unsuppressed contact can start a workflow on their side, and the first
 * thing that workflow does is email the address.
 */
async function checkAuth(cfg: CrmConfig, rec: Recorder): Promise<{ contact: GhlContact | null; authFailed: boolean }> {
  const made = await upsertContact(cfg, {
    email: PROBE_EMAIL,
    firstName: "Tekmadev",
    lastName: "Probe",
    source: "tekmadev-probe",
    ...writeEmailDnd("active", "OPTED_OUT"),
  });
  if (!made.ok) {
    rec.record(
      "auth",
      false,
      `the CRM refused the probe contact: ${made.error.status} ${made.error.code}, ${made.error.message}`,
    );
    // Only a refusal HERE means the credentials are wrong. The lookup check
    // further down expects a 401 and treats it as an answer, so reading every
    // 401 in the run as a rejected token would mislabel a healthy account.
    return { contact: null, authFailed: made.error.code === "auth" };
  }
  const contact = made.data.contact;
  if (emailKey(contact.email) !== emailKey(PROBE_EMAIL)) {
    rec.record(
      "auth",
      false,
      `asked for ${PROBE_EMAIL} and got contact ${contact.id} with address ${contact.email ?? "empty"}. The sub-account is matching on something other than the email.`,
    );
    return { contact: null, authFailed: false };
  }
  rec.record(
    "auth",
    true,
    `token and location accepted, Version v3 accepted. Working on the disposable contact ${PROBE_EMAIL} (${contact.id}), which is suppressed and deleted when the probe finishes.`,
  );
  return { contact, authFailed: false };
}

/**
 * Check 2: which way round the DND enum runs.
 *
 * Reading back what we just wrote proves nothing on its own: if "active"
 * meant contactable, a read would still say "active". The global `dnd` boolean
 * is the only unambiguous field on the contact, so the check writes both
 * states through the endpoint the worker actually uses and asserts the boolean
 * tracks the channel each time: "inactive" has to leave dnd false, "active"
 * has to leave it true. That is the whole of the evidence available, and
 * without it the polarity is a guess.
 *
 * The read is a separate GET on purpose. The PUT response echoes the body we
 * sent, so trusting it would make this check circular.
 */
async function checkPolarity(cfg: CrmConfig, contactId: string, rec: Recorder): Promise<boolean> {
  const steps: string[] = [];

  for (const [status, expectSuppressed] of [
    ["inactive", false],
    ["active", true],
  ] as const) {
    const write = await setEmailDnd(cfg, contactId, status, status === "active" ? "OPTED_OUT" : undefined);
    if (!write.ok) {
      return rec.record(
        "dnd_polarity",
        false,
        `writing dndSettings.email.status = "${status}" failed: ${write.error.status} ${write.error.code}, ${write.error.message}`,
      );
    }
    const back = await getContact(cfg, contactId);
    if (!back.ok) {
      return rec.record("dnd_polarity", false, `could not read the contact back: ${back.error.message}`);
    }
    const read = readEmailDnd(back.data.dndSettings, back.data.dnd);
    steps.push(`wrote "${status}", read ${dndLine(back.data)}`);

    const suppressed = read.state === "active" || read.state === "permanent";
    if (read.state === "unknown") {
      return rec.record("dnd_polarity", false, `${steps.join("; ")}. The email channel came back unreadable.`);
    }
    if (suppressed !== expectSuppressed) {
      return rec.record(
        "dnd_polarity",
        false,
        `${steps.join("; ")}. The enum is the other way round from what every module here assumes, so nothing may sync.`,
      );
    }
    if (read.conflict) {
      return rec.record(
        "dnd_polarity",
        false,
        `${steps.join("; ")}. The global dnd boolean does not corroborate the email channel, so the polarity cannot be confirmed and the conflict tripwire in lib/crm/dnd.ts would fire on every suppression.`,
      );
    }
  }

  return rec.record("dnd_polarity", true, `${steps.join("; ")}. "active" means suppressed, confirmed against the global boolean.`);
}

/**
 * Check 3: the legacy capitalised keys must not take effect on a write.
 *
 * Webhook payloads arrive with the capitalised channel names while the v3 REST
 * API takes lowercase ones, so lib/crm/dnd.ts reads both and writes only
 * lowercase. This proves the writing half of that rule: if the API also
 * honoured `{ Email: ... }` then two spellings would both work and our reading
 * of which one is authoritative would be unproven, while if it silently
 * accepts and drops one, anyone who wrote it would believe they had suppressed
 * someone who is still mailable.
 *
 * The direction is inverted from the design's sketch for one reason: the
 * contact is suppressed at this point, so a legacy write of "active" could not
 * be told from a no-op. Writing the legacy body that would UN-suppress is the
 * only version of this check whose silent success is detectable, and it is
 * also the dangerous direction.
 */
async function checkLegacyRejected(cfg: CrmConfig, contactId: string, rec: Recorder): Promise<boolean> {
  const legacy = await crmFetch<Record<string, unknown>>(cfg, `/contacts/${encodeURIComponent(contactId)}`, {
    method: "PUT",
    body: { dndSettings: { Email: { status: "inactive" } } },
    timeoutMs: PROBE_TIMEOUT_MS,
  });

  if (!legacy.ok) {
    if (legacy.error.status >= 400) {
      return rec.record(
        "dnd_legacy_rejected",
        true,
        `the capitalised { Email: ... } body was refused outright: ${legacy.error.status} ${legacy.error.message}`,
      );
    }
    return rec.record(
      "dnd_legacy_rejected",
      false,
      `the request never reached the CRM (${legacy.error.code}: ${legacy.error.message}), so nothing was settled`,
    );
  }

  const back = await getContact(cfg, contactId);
  if (!back.ok) {
    return rec.record("dnd_legacy_rejected", false, `could not read the contact back: ${back.error.message}`);
  }
  const read = readEmailDnd(back.data.dndSettings, back.data.dnd);
  if (read.state === "active" || read.state === "permanent") {
    return rec.record(
      "dnd_legacy_rejected",
      true,
      `the CRM answered 200 to the capitalised body and ignored it: ${dndLine(back.data)}. Writing lowercase is therefore mandatory, which is what lib/crm/dnd.ts does.`,
    );
  }

  // It took effect, so the contact is contactable again. Put it back before
  // reporting: a probe must not leave a mailable contact behind.
  const restore = await setEmailDnd(cfg, contactId, "active", "OPTED_OUT");
  return rec.record(
    "dnd_legacy_rejected",
    false,
    `the capitalised body took effect and cleared the suppression: ${dndLine(back.data)}. Restoring it ${
      restore.ok ? "succeeded" : `FAILED: ${restore.error.message}`
    }. Two spellings both write, so which one the API treats as authoritative is unproven.`,
  );
}

/**
 * Check 4: whether a Private Integration Token may call the lookup endpoint.
 *
 * The endpoint's own description says OAuth only while its security scheme
 * permits a token, so the documentation contradicts itself and the answer has
 * to come from the account. The endpoints are called directly rather than
 * through lookupContactByEmail, so the probe measures the API rather than the
 * client's cache of a previous answer, and the winner is written back into
 * site_settings.crm_probe for the client to pick up.
 *
 * The body of the duplicate search is documented with an empty description, so
 * the assertion is that the contact id appears somewhere in the answer rather
 * than at a key path we would be guessing at.
 */
async function checkLookup(cfg: CrmConfig, contactId: string, rec: Recorder): Promise<boolean> {
  const found = (body: unknown): boolean => JSON.stringify(body ?? null).includes(contactId);

  const lookup = await crmFetch<Record<string, unknown>>(cfg, "/contacts/lookup", {
    query: { locationId: cfg.locationId, email: PROBE_EMAIL, limit: "20" },
    timeoutMs: PROBE_TIMEOUT_MS,
  });
  if (lookup.ok && found(lookup.data)) {
    await patchCrmProbeSetting({ lookupPath: "lookup" });
    return rec.record("lookup_with_pit", true, "GET /contacts/lookup accepts the token and found the probe contact");
  }
  if (lookup.ok) {
    return rec.record(
      "lookup_with_pit",
      false,
      `GET /contacts/lookup answered 200 without the contact we had just created (keys: ${Object.keys(lookup.data).join(", ") || "none"}). An email lookup that cannot find a contact that exists would make every reconcile read it as deleted.`,
    );
  }
  if (lookup.error.code !== "auth") {
    return rec.record(
      "lookup_with_pit",
      false,
      `GET /contacts/lookup failed with ${lookup.error.status} ${lookup.error.code}: ${lookup.error.message}`,
    );
  }

  const duplicate = await crmFetch<Record<string, unknown>>(cfg, "/contacts/search/duplicate", {
    query: { locationId: cfg.locationId, email: PROBE_EMAIL },
    timeoutMs: PROBE_TIMEOUT_MS,
  });
  if (duplicate.ok && found(duplicate.data)) {
    const shape = Object.keys(duplicate.data).sort().join(",") || "empty";
    await patchCrmProbeSetting({ lookupPath: "duplicate", duplicateShape: shape });
    return rec.record(
      "lookup_with_pit",
      true,
      `the lookup endpoint refuses this token (${lookup.error.status}); GET /contacts/search/duplicate works and returned keys: ${shape}`,
    );
  }
  return rec.record(
    "lookup_with_pit",
    false,
    `neither endpoint can look up an email: lookup said ${lookup.error.status} ${lookup.error.message}, duplicate search ${
      duplicate.ok ? "answered without the contact" : `said ${duplicate.error.status} ${duplicate.error.message}`
    }. Two refusals is a credential problem, not an endpoint problem.`,
  );
}

/**
 * Check 5: an upsert with no `tags` field must leave the contact's tags alone.
 *
 * The documentation states only that a supplied array overwrites. Omission is
 * undocumented, and if omission also cleared them then every profile push
 * would wipe every tag the owner's own workflows had applied, silently, on
 * contacts we never meant to touch. UpsertContactInput has no tags member at
 * all, so this proves the one thing that rule depends on.
 */
async function checkTagsPreserved(cfg: CrmConfig, contactId: string, rec: Recorder): Promise<boolean> {
  const tagged = await addTags(cfg, contactId, [PROBE_TAG]);
  if (!tagged.ok) {
    return rec.record("tags_preserved_on_upsert", false, `could not add a tag: ${tagged.error.status} ${tagged.error.message}`);
  }
  if (!tagged.data.tags.includes(PROBE_TAG)) {
    return rec.record(
      "tags_preserved_on_upsert",
      false,
      `POST /contacts/{id}/tags answered without the tag it was asked to add (got: ${tagged.data.tags.join(", ") || "none"})`,
    );
  }

  const again = await upsertContact(cfg, { email: PROBE_EMAIL, firstName: "Tekmadev" });
  if (!again.ok) {
    return rec.record("tags_preserved_on_upsert", false, `the second upsert failed: ${again.error.message}`);
  }
  const back = await getContact(cfg, contactId);
  if (!back.ok) {
    return rec.record("tags_preserved_on_upsert", false, `could not read the contact back: ${back.error.message}`);
  }
  if (!back.data.tags.includes(PROBE_TAG)) {
    return rec.record(
      "tags_preserved_on_upsert",
      false,
      `an upsert with no tags field cleared the contact's tags (now: ${back.data.tags.join(", ") || "none"}). Every profile push would wipe the owner's own tags.`,
    );
  }
  return rec.record(
    "tags_preserved_on_upsert",
    true,
    `an upsert with no tags field left them alone (${back.data.tags.join(", ")})`,
  );
}

/**
 * Check 6: DELETE with a JSON body.
 *
 * Tag removal is the only call here that needs a body on a DELETE, and bodies
 * on DELETE are the thing intermediaries drop. If this is stripped anywhere
 * along the way, the request succeeds and removes nothing, so an unsubscribe
 * would leave tmd-newsletter in place and the person would stay in every
 * marketing audience in the account.
 */
async function checkDeleteTagsBody(cfg: CrmConfig, contactId: string, rec: Recorder): Promise<boolean> {
  const removed = await removeTags(cfg, contactId, [PROBE_TAG]);
  if (!removed.ok) {
    return rec.record("delete_tags_body", false, `the DELETE failed: ${removed.error.status} ${removed.error.message}`);
  }
  const back = await getContact(cfg, contactId);
  if (!back.ok) {
    return rec.record("delete_tags_body", false, `could not read the contact back: ${back.error.message}`);
  }
  if (back.data.tags.includes(PROBE_TAG)) {
    return rec.record(
      "delete_tags_body",
      false,
      `the DELETE answered successfully and the tag is still there (${back.data.tags.join(", ")}). The JSON body is being dropped, so no tag can ever be removed.`,
    );
  }
  return rec.record("delete_tags_body", true, "DELETE /contacts/{id}/tags carried its JSON body and removed the tag");
}

/**
 * Check 7: two upserts of one email with different phone numbers are one contact.
 *
 * Allow Duplicate Contact is a dashboard setting our code cannot read. With it
 * on, the second upsert creates a second contact, and from then on one person
 * has two consent records: suppressing one leaves the other mailable. There is
 * no API that reports the setting, so the only way to know is to try it.
 */
async function checkDedupe(cfg: CrmConfig, contactId: string, rec: Recorder): Promise<boolean> {
  const first = await upsertContact(cfg, { email: PROBE_EMAIL, phone: PROBE_PHONE_A });
  if (!first.ok) {
    return rec.record("dedupe_on_email", false, `the first upsert failed: ${first.error.message}`);
  }
  const second = await upsertContact(cfg, { email: PROBE_EMAIL, phone: PROBE_PHONE_B });
  if (!second.ok) {
    return rec.record("dedupe_on_email", false, `the second upsert failed: ${second.error.message}`);
  }
  if (second.data.isNew || second.data.contact.id !== contactId) {
    return rec.record(
      "dedupe_on_email",
      false,
      `the same email with a different phone produced ${second.data.isNew ? "a new contact" : "a different contact"} (${
        second.data.contact.id
      } against ${contactId}). Allow Duplicate Contact is on in the sub-account, so one person would end up with two consent records.`,
    );
  }
  return rec.record(
    "dedupe_on_email",
    true,
    `two upserts with different phone numbers returned the same contact and new=false, so matching is on the email`,
  );
}

/**
 * Check 8: the ten custom fields exist, and a value written survives a read.
 *
 * Fields go out as [{ id, fieldValue }] and come back as [{ id, value }].
 * A round-trip comparison written the obvious way concludes that every field
 * is empty, which looks exactly like a contact nobody has filled in, so the
 * asymmetry is proved here once rather than discovered later from a workflow
 * that never fires. The numeric field is included because a field the account
 * holds as text cannot be branched on as a number.
 */
async function checkCustomFields(cfg: CrmConfig, contactId: string, rec: Recorder): Promise<boolean> {
  const resolved = await resolveFieldIds(cfg, { create: true });
  if (!resolved.ok) {
    return rec.record("custom_fields", false, resolved.error);
  }
  const created = resolved.created.length ? `, created ${resolved.created.map((k) => CRM_FIELDS[k].key).join(", ")}` : "";

  const textId = resolved.ids.leadSource;
  const numberId = resolved.ids.monthlyLeak;
  const written = await upsertContact(cfg, {
    email: PROBE_EMAIL,
    customFields: { [textId]: "tekmadev-probe", [numberId]: 1234 },
  });
  if (!written.ok) {
    return rec.record("custom_fields", false, `writing two custom fields failed: ${written.error.message}`);
  }
  const back = await getContact(cfg, contactId);
  if (!back.ok) {
    return rec.record("custom_fields", false, `could not read the contact back: ${back.error.message}`);
  }
  const text = back.data.customFields[textId] ?? "";
  const number = back.data.customFields[numberId] ?? "";
  if (text !== "tekmadev-probe" || Number(number) !== 1234) {
    return rec.record(
      "custom_fields",
      false,
      `a custom field did not survive the round trip: ${CRM_FIELDS.leadSource.key} read back as "${text}" and ${CRM_FIELDS.monthlyLeak.key} as "${number}"`,
    );
  }
  return rec.record(
    "custom_fields",
    true,
    `all ten fields have ids${created}; write fieldValue and read value round-tripped for text and number`,
  );
}

/**
 * Suppress, then delete.
 *
 * In that order so that a refused delete still leaves a contact nothing can
 * mail. The outcome is a sentence rather than a boolean because it is
 * information for the owner, not a pass or a fail: a probe contact left behind
 * is untidy, never unsafe.
 */
async function cleanupProbeContact(cfg: CrmConfig, contactId: string): Promise<string> {
  const suppressed = await setEmailDnd(cfg, contactId, "active", "OPTED_OUT");
  const deleted = await crmFetch<Record<string, unknown>>(cfg, `/contacts/${encodeURIComponent(contactId)}`, {
    method: "DELETE",
    timeoutMs: PROBE_TIMEOUT_MS,
  });
  if (deleted.ok) return `${PROBE_EMAIL} was deleted after the run`;
  return `${PROBE_EMAIL} (${contactId}) could not be deleted: ${deleted.error.status} ${deleted.error.message}. It is ${
    suppressed.ok ? "suppressed, so nothing can mail it" : "NOT suppressed, so check it by hand"
  }.`;
}

/**
 * Run every check, store the result, and arm the integration only on a clean
 * sweep.
 *
 * Health on the way out:
 *  - every check passed: "ok", which is the only value crmGate() will run on.
 *  - anything refused our credentials: "auth_failed", the same state the
 *    worker sets, so the whole integration stops rather than hammering a
 *    rotated token through its seven-day dual-validity window.
 *  - anything else failed: back to "unverified". A probe that cannot prove the
 *    DND polarity must not leave an armed integration armed, and re-arming is
 *    one button once the account is fixed.
 */
export async function probeCrm(): Promise<CrmProbeResult> {
  const at = new Date().toISOString();
  const cfg = crmConfig();
  if (!cfg) {
    const checks = settle([], "GHL_PIT_TOKEN and GHL_LOCATION_ID are not both set");
    await patchCrmProbeSetting({ checks, at, ok: false });
    return { ok: false, checks, error: "The CRM is not connected. GHL_PIT_TOKEN and GHL_LOCATION_ID both have to be set." };
  }

  const rec = recorder();
  const { contact, authFailed } = await checkAuth(cfg, rec);
  let cleanup: string | null = null;

  if (contact) {
    await checkPolarity(cfg, contact.id, rec);
    await checkLegacyRejected(cfg, contact.id, rec);
    await checkLookup(cfg, contact.id, rec);
    await checkTagsPreserved(cfg, contact.id, rec);
    await checkDeleteTagsBody(cfg, contact.id, rec);
    await checkDedupe(cfg, contact.id, rec);
    await checkCustomFields(cfg, contact.id, rec);
    cleanup = await cleanupProbeContact(cfg, contact.id);
  }

  const checks = settle(rec.checks, "the probe contact could not be created, so nothing else could be demonstrated");
  const failed = checks.filter((c) => !c.ok);
  const ok = failed.length === 0;

  await patchCrmProbeSetting({ checks, at, ok, probeContact: cleanup }, "probe");
  await setCrmSync({ health: ok ? "ok" : authFailed ? "auth_failed" : "unverified" }, "probe");

  if (ok) return { ok: true, checks, at };
  return {
    ok: false,
    checks,
    error: `${failed.length} of ${CHECK_NAMES.length} checks failed: ${failed.map((c) => c.name).join(", ")}`,
  };
}
