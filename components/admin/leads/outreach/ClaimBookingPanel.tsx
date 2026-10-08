"use client";

import { btnGhost, btnPrimary } from "@/components/portal/ui";
import { cn } from "@/lib/cn";
import type { Lead } from "@/lib/leads-ui";
import { claimLeadBookingAction } from "@/app/admin/(dashboard)/leads/actions";
import { ActionAlert } from "./ActionAlert";
import { footerCls } from "./editor-parts";
import { useEditorSave } from "./use-lead-action";

/**
 * "I booked this call" (the app's "Booked by" sheet, in place): on a lead that
 * shows booked with nobody holding the booking credit, it records the signed-in
 * person as the booker. The first person to book a lead keeps the credit, so
 * when someone else got there first the server says who (`booked_by_other`):
 * the card closes this panel, shows that as an error and the page refreshes.
 */
export function ClaimBookingPanel({
  lead,
  onSaved,
  onCancel,
  onRefused,
}: {
  lead: Lead;
  onSaved: (message: string) => void;
  onCancel: () => void;
  /** Someone else has the credit: close the panel and show the server's message. */
  onRefused: (message: string) => void;
}) {
  const { pending, pressed, failure, save, label } = useEditorSave(onSaved);

  const claim = async (button: "save" | "retry") => {
    const result = await save(button, () => claimLeadBookingAction({ leadId: lead.id }));
    if (!result.ok && result.code === "booked_by_other") onRefused(result.message);
  };

  return (
    <div className="flex flex-col gap-3">
      <ActionAlert failure={failure} onRetry={() => void claim("retry")} pending={pending} retrying={pressed === "retry"} />
      <p className="text-sm text-ink">Nobody has the booking credit for this call yet.</p>
      <p className="text-xs text-ink-3">If you booked it by phone, DM or email, record it here. The first person to book a lead keeps the credit.</p>
      <div className={cn(footerCls, "mt-1")}>
        <button type="button" className={cn(btnPrimary, "w-full sm:w-auto")} disabled={pending} onClick={() => void claim("save")}>
          {label("save", "I booked this call", "Saving")}
        </button>
        <button type="button" className={btnGhost} disabled={pending} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
