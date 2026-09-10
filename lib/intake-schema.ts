/**
 * The client intake form, as data. Answers are stored as JSON keyed by field
 * key with `schema_version` so the form can change without losing old answers.
 * Bump INTAKE_SCHEMA_VERSION whenever a field's meaning changes.
 */
export const INTAKE_SCHEMA_VERSION = "1";

export type IntakeFieldType = "text" | "textarea" | "select" | "multiselect" | "tel" | "email" | "url" | "number";

export type IntakeField = {
  key: string;
  label: string;
  type: IntakeFieldType;
  required?: boolean;
  help?: string;
  placeholder?: string;
  options?: { value: string; label: string }[];
};

export type IntakeSection = {
  key: string;
  title: string;
  blurb: string;
  fields: IntakeField[];
};

export const INTAKE_SECTIONS: IntakeSection[] = [
  {
    key: "business",
    title: "Your business",
    blurb: "The basics we put on your website, your receptionist, and your listings.",
    fields: [
      { key: "business_name", label: "Business name", type: "text", required: true },
      { key: "legal_name", label: "Legal business name", type: "text", help: "As it appears on invoices. Leave blank if it is the same." },
      { key: "website_url", label: "Current website", type: "url", placeholder: "https://" },
      { key: "main_phone", label: "Main business phone", type: "tel", required: true },
      { key: "main_email", label: "Email customers should see", type: "email", required: true },
      { key: "address", label: "Business address", type: "textarea", help: "Street, city, province, postal code. Say 'no public address' if you work from home." },
      {
        key: "industry",
        label: "Industry",
        type: "select",
        required: true,
        options: [
          { value: "home_services", label: "Home services (landscaping, roofing, plumbing, HVAC, cleaning)" },
          { value: "auto", label: "Automotive (detailing, repair, tint, wraps)" },
          { value: "construction", label: "Construction and renovation" },
          { value: "health", label: "Health and wellness (clinic, dental, physio, med spa)" },
          { value: "professional", label: "Professional services (legal, accounting, consulting)" },
          { value: "real_estate", label: "Real estate and mortgage" },
          { value: "fitness", label: "Fitness and coaching" },
          { value: "other", label: "Other" },
        ],
      },
      { key: "years_in_business", label: "Years in business", type: "number" },
      { key: "team_size", label: "Team size", type: "number", help: "Including you." },
    ],
  },
  {
    key: "services",
    title: "What you sell",
    blurb: "We build the offer around the service that makes you the most money.",
    fields: [
      { key: "services", label: "Services you offer", type: "textarea", required: true, help: "One per line." },
      { key: "hero_service", label: "The one service you want more of", type: "text", required: true, help: "The job you would take every day if you could." },
      { key: "average_job_value", label: "Average job value (CAD)", type: "number", required: true },
      { key: "service_area", label: "Service area", type: "textarea", required: true, help: "Cities, regions, or a radius. This defines what counts as a qualified booked call." },
      { key: "hours", label: "Business hours", type: "textarea", help: "Example: Mon to Fri 8am to 6pm, Sat 9am to 2pm." },
      { key: "ideal_customer", label: "Your ideal customer", type: "textarea", required: true, help: "Who they are, what they need, what they are worried about." },
      { key: "differentiator", label: "Why customers choose you", type: "textarea", required: true, help: "Speed, quality, warranty, price, reviews. Be specific." },
      { key: "offer_or_promo", label: "Any offer or promotion we can lead with", type: "text", help: "Free estimate, 10% off first job, same-week booking, etc." },
    ],
  },
  {
    key: "leads",
    title: "How leads reach you today",
    blurb: "So we know what to fix first and what to keep.",
    fields: [
      {
        key: "lead_channels",
        label: "Where your leads come from now",
        type: "multiselect",
        options: [
          { value: "google_search", label: "Google search" },
          { value: "gbp", label: "Google Business Profile" },
          { value: "referrals", label: "Referrals and word of mouth" },
          { value: "facebook_instagram", label: "Facebook and Instagram" },
          { value: "paid_ads", label: "Paid ads" },
          { value: "homestars_yelp", label: "HomeStars, Yelp, or similar" },
          { value: "door_to_door", label: "Flyers or door to door" },
          { value: "other", label: "Other" },
        ],
      },
      { key: "monthly_leads", label: "Leads per month right now (estimate)", type: "number" },
      { key: "close_rate", label: "Roughly what percent of leads become customers", type: "number", help: "A guess is fine." },
      { key: "missed_calls", label: "How are missed calls handled today", type: "textarea", help: "Voicemail, call back later, nobody, an answering service." },
      { key: "booking_tool", label: "How do customers book or get a quote", type: "text", help: "Phone, text, a form, Calendly, Jobber, Housecall Pro, nothing yet." },
      { key: "crm", label: "CRM or software you already use", type: "text" },
      { key: "phone_system", label: "Phone setup", type: "text", help: "Cell phone, landline, VoIP provider. This matters for missed-call text-back." },
    ],
  },
  {
    key: "brand",
    title: "Brand and voice",
    blurb: "How your receptionist talks and how your website sounds.",
    fields: [
      {
        key: "tone",
        label: "Tone",
        type: "select",
        options: [
          { value: "friendly", label: "Friendly and warm" },
          { value: "professional", label: "Professional and polished" },
          { value: "direct", label: "Direct and no-nonsense" },
          { value: "premium", label: "Premium and calm" },
        ],
      },
      { key: "must_say", label: "Things we must always say", type: "textarea", help: "Licensed and insured, family-owned since 2015, warranty details." },
      { key: "never_say", label: "Things we must never say or promise", type: "textarea" },
      { key: "competitors", label: "Competitors you keep losing to (or want to beat)", type: "textarea" },
      { key: "review_profiles", label: "Where your reviews live", type: "textarea", help: "Links to Google, Facebook, HomeStars, etc." },
      { key: "social_profiles", label: "Social profiles", type: "textarea", help: "Links, one per line." },
    ],
  },
  {
    key: "goals",
    title: "Goals",
    blurb: "So we can measure the right thing.",
    fields: [
      { key: "goal_90_days", label: "What does a win look like in 90 days", type: "textarea", required: true },
      { key: "capacity", label: "How many new jobs per month can you actually handle", type: "number", required: true, help: "We will not book more than you can serve." },
      { key: "anything_else", label: "Anything else we should know", type: "textarea" },
    ],
  },
];

export const INTAKE_FIELDS: IntakeField[] = INTAKE_SECTIONS.flatMap((s) => s.fields);

export type IntakeAnswers = Record<string, string | string[] | number | null>;

export function intakeCompletion(answers: IntakeAnswers | null | undefined) {
  const a = answers ?? {};
  const required = INTAKE_FIELDS.filter((f) => f.required);
  const filled = (v: unknown) =>
    Array.isArray(v) ? v.length > 0 : v !== null && v !== undefined && String(v).trim() !== "";
  const missing = required.filter((f) => !filled(a[f.key])).map((f) => f.key);
  const answered = INTAKE_FIELDS.filter((f) => filled(a[f.key])).length;
  return { answered, total: INTAKE_FIELDS.length, requiredTotal: required.length, missingRequired: missing };
}

/** Parses a submitted form into typed answers, dropping unknown keys. */
export function parseIntakeForm(form: FormData): IntakeAnswers {
  const out: IntakeAnswers = {};
  for (const f of INTAKE_FIELDS) {
    if (f.type === "multiselect") {
      const vals = form.getAll(f.key).map(String).filter(Boolean);
      out[f.key] = vals;
    } else if (f.type === "number") {
      const raw = String(form.get(f.key) ?? "").trim();
      out[f.key] = raw === "" ? null : Number(raw.replace(/[^0-9.\-]/g, ""));
      if (Number.isNaN(out[f.key])) out[f.key] = null;
    } else {
      const raw = String(form.get(f.key) ?? "").trim();
      out[f.key] = raw === "" ? null : raw.slice(0, 4000);
    }
  }
  return out;
}
