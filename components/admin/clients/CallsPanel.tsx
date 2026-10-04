import type { Client } from "@/lib/clients-data";
import { countsTowardGuarantee, guaranteeSummary, type BookedCall } from "@/lib/onboarding-data";
import { Badge, Field, ProgressBar, inputCls, selectCls, fmtDateTime, humanize, type Tone } from "@/components/portal/ui";
import { SubmitButton } from "@/components/portal/SubmitButton";
import { addBookedCallAction, updateBookedCallAction } from "@/app/admin/(dashboard)/clients/actions";

const STATUSES = ["booked", "confirmed", "showed", "no_show", "cancelled", "rescheduled"];
const SOURCES = ["receptionist", "web_form", "calendar", "missed_call_textback", "ads", "chat", "manual", "import", "other"];
const DQ = ["spam", "duplicate", "out_of_area", "wrong_service", "fake", "other"];
const TONE: Record<string, Tone> = { booked: "gold", confirmed: "gold", showed: "ok", no_show: "warn", cancelled: "muted", rescheduled: "neutral" };

/**
 * Booked calls and the guarantee. `canLog` (clients.calls.log) adds a call by
 * hand; `canReview` (clients.calls.review) edits, qualifies and disqualifies
 * calls toward the guarantee. The actions check them again.
 */
export function CallsPanel({
  client,
  calls,
  canLog,
  canReview,
}: {
  client: Client;
  calls: BookedCall[];
  canLog: boolean;
  canReview: boolean;
}) {
  const g = guaranteeSummary(client, calls);
  const endsAtMs = g.endsAt ? new Date(g.endsAt).getTime() : null;

  return (
    <div className="flex flex-col gap-5">
      {g.eligible && (
        <div className="rounded-xl border border-line bg-bg-2 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="font-medium text-ink">
              {g.counted} / {g.target} counted
              <span className="ml-2 font-normal text-ink-4">
                {g.startedAt ? `${g.daysElapsed} days in, ${g.daysLeft} left, ${g.expectedByNow} expected by now` : "clock not started"}
              </span>
            </span>
            <Badge tone={g.status === "met" ? "ok" : g.startedAt ? (g.onTrack ? "ok" : "warn") : "neutral"}>
              {g.status === "met" ? "Met" : g.startedAt ? (g.onTrack ? "On pace" : "Behind pace") : humanize(g.status)}
            </Badge>
          </div>
          <div className="mt-2">
            <ProgressBar percent={g.percent} tone={g.onTrack ? "ok" : "gold"} />
          </div>
        </div>
      )}

      {canLog && (
        <details className="rounded-xl border border-line bg-bg-2 p-4">
          <summary className="cursor-pointer text-sm font-medium text-ink">Add a booked call</summary>
          <form action={addBookedCallAction} className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <input type="hidden" name="client_id" value={client.id} />
            <Field label="Contact name">
              <input name="contact_name" className={inputCls} />
            </Field>
            <Field label="Phone">
              <input name="contact_phone" className={inputCls} />
            </Field>
            <Field label="Email">
              <input name="contact_email" type="email" className={inputCls} />
            </Field>
            <Field label="Service requested">
              <input name="service_requested" className={inputCls} />
            </Field>
            <Field label="Booked at">
              <input name="booked_at" type="datetime-local" className={inputCls} />
            </Field>
            <Field label="Appointment for">
              <input name="booked_for" type="datetime-local" className={inputCls} />
            </Field>
            <Field label="Source">
              <select name="source" defaultValue="manual" className={selectCls}>
                {SOURCES.map((x) => (
                  <option key={x} value={x}>
                    {humanize(x)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Status">
              <select name="status" defaultValue="booked" className={selectCls}>
                {STATUSES.map((x) => (
                  <option key={x} value={x}>
                    {humanize(x)}
                  </option>
                ))}
              </select>
            </Field>
            <div className="sm:col-span-2 lg:col-span-3">
              <Field label="Notes">
                <input name="notes" className={inputCls} />
              </Field>
            </div>
            <Field label="External id" help="From the CRM, for dedupe.">
              <input name="external_id" className={inputCls} />
            </Field>
            <div className="sm:col-span-2 lg:col-span-4">
              <SubmitButton pendingLabel="Adding">Add call</SubmitButton>
            </div>
          </form>
        </details>
      )}

      {calls.some((c) => !c.reviewed_at) && (
        <p className="text-sm text-ink-2">
          {calls.filter((c) => !c.reviewed_at).length} appointment{calls.filter((c) => !c.reviewed_at).length === 1 ? "" : "s"} from the CRM
          waiting for {canReview ? "your" : "a manager's"} review. Nothing counts toward the guarantee until {canReview ? "you confirm" : "it is confirmed"}.
        </p>
      )}

      {calls.length === 0 ? (
        <p className="text-sm text-ink-4">No booked calls recorded.</p>
      ) : (
        <ul className="divide-y divide-line">
          {calls.map((c) => (
            <li key={c.id} className="py-3">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-medium text-ink">{c.contact_name || "Unknown"}</p>
                <Badge tone={TONE[c.status] ?? "neutral"}>{humanize(c.status)}</Badge>
                {!c.reviewed_at ? (
                  <Badge tone="warn">Needs review</Badge>
                ) : !c.qualified ? (
                  <Badge tone="muted">DQ: {humanize(c.disqualified_reason)}</Badge>
                ) : countsTowardGuarantee(client, c, endsAtMs) ? (
                  <Badge tone="ok">Counts</Badge>
                ) : (
                  <Badge tone="neutral">Outside window</Badge>
                )}
                <span className="text-xs text-ink-4">
                  {humanize(c.source)} · booked {fmtDateTime(c.booked_at)}
                  {c.booked_for ? ` · for ${fmtDateTime(c.booked_for)}` : ""}
                  {c.service_requested ? ` · ${c.service_requested}` : ""}
                </span>
              </div>
              <p className="text-xs text-ink-4">
                {[c.contact_phone, c.contact_email].filter(Boolean).join(" · ")}
                {c.notes ? ` · ${c.notes}` : ""}
              </p>
              {canReview && !c.reviewed_at && (
                <form action={updateBookedCallAction} className="mt-2">
                  <input type="hidden" name="client_id" value={client.id} />
                  <input type="hidden" name="call_id" value={c.id} />
                  <input type="hidden" name="external_id" value={c.external_id ?? ""} />
                  <input type="hidden" name="status" value={c.status} />
                  <input type="hidden" name="notes" value={c.notes ?? ""} />
                  {/* A reason already set means the sync found it on a calendar that
                      does not count, so the one click agrees with that instead. */}
                  {c.disqualified_reason ? (
                    <>
                      <input type="hidden" name="qualified" value="no" />
                      <input type="hidden" name="disqualified_reason" value={c.disqualified_reason} />
                      <SubmitButton variant="secondary" pendingLabel="Confirming">
                        Agree, it does not count
                      </SubmitButton>
                    </>
                  ) : (
                    <>
                      <input type="hidden" name="qualified" value="yes" />
                      <SubmitButton pendingLabel="Confirming">Real prospect, count it</SubmitButton>
                    </>
                  )}
                  <span className="ml-3 text-xs text-ink-4">Or decide with the full form below.</span>
                </form>
              )}
              {canReview && (
                <form action={updateBookedCallAction} className="mt-2 grid gap-2 sm:grid-cols-[10rem_8rem_10rem_1fr_auto]">
                  <input type="hidden" name="client_id" value={client.id} />
                  <input type="hidden" name="call_id" value={c.id} />
                  <input type="hidden" name="external_id" value={c.external_id ?? ""} />
                  <select name="status" defaultValue={c.status} className={selectCls + " py-2"}>
                    {STATUSES.map((x) => (
                      <option key={x} value={x}>
                        {humanize(x)}
                      </option>
                    ))}
                  </select>
                  <select name="qualified" defaultValue={c.qualified ? "yes" : "no"} className={selectCls + " py-2"}>
                    <option value="yes">Qualified</option>
                    <option value="no">Disqualify</option>
                  </select>
                  <select name="disqualified_reason" defaultValue={c.disqualified_reason ?? "other"} className={selectCls + " py-2"}>
                    {DQ.map((x) => (
                      <option key={x} value={x}>
                        {humanize(x)}
                      </option>
                    ))}
                  </select>
                  <input name="notes" defaultValue={c.notes ?? ""} placeholder="Notes" className={inputCls + " py-2"} />
                  <SubmitButton variant="secondary" pendingLabel="...">
                    Save
                  </SubmitButton>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
