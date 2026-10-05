/**
 * Add lead (web admin): the form's values and the state its server action
 * returns. Kept out of the "use server" file, which may only export actions.
 */

export type AddLeadValues = {
  name: string;
  business: string;
  email: string;
  phone: string;
  website: string;
  need: string;
  message: string;
};

export type AddLeadState = {
  /** Bumped on every failed try, so the form remounts with the typed values. */
  attempt: number;
  message: string | null;
  fields: Record<string, string>;
  /** Set when the email is already a lead, to offer "Find it". */
  duplicateEmail: string | null;
  values: AddLeadValues;
};

export const EMPTY_ADD_LEAD: AddLeadValues = { name: "", business: "", email: "", phone: "", website: "", need: "", message: "" };

export const INITIAL_ADD_LEAD_STATE: AddLeadState = {
  attempt: 0,
  message: null,
  fields: {},
  duplicateEmail: null,
  values: EMPTY_ADD_LEAD,
};

/** The form's text values (each trimmed and capped; the shared rules check them properly). */
export function readAddLeadValues(form: FormData): AddLeadValues {
  const text = (key: keyof AddLeadValues, max: number) => String(form.get(key) ?? "").trim().slice(0, max);
  return {
    name: text("name", 200),
    business: text("business", 300),
    email: text("email", 300),
    phone: text("phone", 60),
    website: text("website", 400),
    need: text("need", 40),
    message: text("message", 6000),
  };
}
