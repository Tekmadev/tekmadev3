/**
 * Edit lead (web admin): the form's values and the state its server action
 * returns. Kept out of the "use server" file, which may only export actions.
 * The fields are Add lead's (add-lead-state.ts), so are the length caps.
 */

import type { AddLeadValues } from "./add-lead-state";

export type EditLeadValues = AddLeadValues;

export type EditLeadState = {
  /** Bumped on every failed try, so the form remounts with the typed values. */
  attempt: number;
  message: string | null;
  fields: Record<string, string>;
  /** Set when the email is already another lead, to offer "Find it". */
  duplicateEmail: string | null;
  /** What was typed on the last failed try; null before one (the form shows the lead). */
  values: EditLeadValues | null;
};

export const INITIAL_EDIT_LEAD_STATE: EditLeadState = { attempt: 0, message: null, fields: {}, duplicateEmail: null, values: null };

/** Add lead's caps (readAddLeadValues): enough for the server's own "too long" copy, never an unbounded payload. */
const CAPS: Record<keyof EditLeadValues, number> = { name: 200, business: 300, email: 300, phone: 60, website: 400, need: 40, message: 6000 };

/** The detail fields under a name prefix: "" for what was typed, "was_" for what the form showed when it opened. */
function readValues(form: FormData, prefix: string): EditLeadValues {
  const text = (key: keyof EditLeadValues) => String(form.get(prefix + key) ?? "").trim().slice(0, CAPS[key]);
  return {
    name: text("name"),
    business: text("business"),
    email: text("email"),
    phone: text("phone"),
    website: text("website"),
    need: text("need"),
    message: text("message"),
  };
}

/** The Edit lead form: which lead, what was typed, and what the form showed (only the changes are sent). */
export function readEditLeadForm(form: FormData): { leadId: string; values: EditLeadValues; shown: EditLeadValues } {
  return { leadId: String(form.get("lead_id") ?? "").trim(), values: readValues(form, ""), shown: readValues(form, "was_") };
}
