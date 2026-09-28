import { Field, inputCls } from "@/components/portal/ui";
import { SubmitButton } from "@/components/portal/SubmitButton";
import type { ClientCrmLocation } from "@/lib/crm/admin-data";
import { saveCrmLocationAction } from "@/app/admin/(dashboard)/clients/actions";

/**
 * Which GoHighLevel sub-account is this client's, and which of its calendars
 * count toward their guarantee. Owner only, rendered only for the owner.
 */
export function CrmLocationPanel({ clientId, location }: { clientId: string; location: ClientCrmLocation | null }) {
  return (
    <form action={saveCrmLocationAction} className="grid gap-4">
      <input type="hidden" name="client_id" value={clientId} />
      <p className="text-sm text-ink-3">
        Appointments booked in this client&apos;s GoHighLevel sub-account come in here for your review, and the ones you confirm count toward
        their guarantee. An appointment from a sub-account that is not mapped yet is never dropped: it waits, and applies as soon as you
        save the id here.
      </p>
      <Field label="Sub-account location id" help="GoHighLevel, the client's sub-account, Settings, Business Profile. Leave empty to unlink.">
        <input name="location_id" defaultValue={location?.locationId ?? ""} className={inputCls + " font-mono"} autoComplete="off" />
      </Field>
      <Field
        label="Calendars that count"
        help="The calendar ids of the calendars we built for this client, separated by commas or new lines. Leave empty and every appointment in the account counts, including ones the client books by hand."
      >
        <textarea
          name="calendar_ids"
          rows={3}
          defaultValue={location?.calendarIds.join("\n") ?? ""}
          className={inputCls + " font-mono"}
          autoComplete="off"
        />
      </Field>
      {location && location.heldAppointments > 0 && (
        <p className="text-sm text-ink-2">
          {location.heldAppointments} appointment{location.heldAppointments === 1 ? " is" : "s are"} waiting to be applied from this account.
          They land in Booked calls on the next sync, or press Sync now on the CRM page.
        </p>
      )}
      <div>
        <SubmitButton pendingLabel="Saving">Save CRM account</SubmitButton>
      </div>
    </form>
  );
}
