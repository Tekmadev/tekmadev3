import { cn } from "@/lib/cn";
import { createCampaignAction } from "@/app/admin/(dashboard)/email/actions";

const inputClass =
  "rounded-xl border border-line-strong bg-bg px-3 py-2.5 text-ink outline-none focus:border-gold";
const labelClass = "flex flex-col gap-1.5 text-sm text-ink-2";

/**
 * Register a marketing campaign so its first-party opens and clicks (from the
 * tracking pixel + tracked CTA links embedded in the GHL email) roll up here.
 * The `key` must match the `c=` value used in the template's tracking URLs.
 */
export function CampaignForm() {
  return (
    <form action={createCampaignAction} className="flex flex-col gap-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className={labelClass}>
          Campaign key
          <input
            name="key"
            type="text"
            required
            placeholder="welcome"
            autoCapitalize="none"
            autoComplete="off"
            className={cn(inputClass, "lowercase placeholder:normal-case placeholder:text-ink-4")}
          />
        </label>
        <label className={labelClass}>
          Name
          <input
            name="name"
            type="text"
            required
            placeholder="Welcome email"
            className={cn(inputClass, "placeholder:text-ink-4")}
          />
        </label>
      </div>

      <label className={labelClass}>
        Subject line
        <input
          name="subject"
          type="text"
          placeholder="Welcome to the Growth Memo"
          className={cn(inputClass, "placeholder:text-ink-4")}
        />
      </label>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className={labelClass}>
          Template
          <input
            name="template"
            type="text"
            list="template-suggestions"
            placeholder="welcome"
            className={cn(inputClass, "placeholder:text-ink-4")}
          />
        </label>
        <label className={labelClass}>
          Note (optional)
          <input
            name="description"
            type="text"
            placeholder="Sent on new subscribe"
            className={cn(inputClass, "placeholder:text-ink-4")}
          />
        </label>
      </div>

      <datalist id="template-suggestions">
        <option value="welcome" />
        <option value="newsletter" />
        <option value="nurture-1" />
        <option value="nurture-2" />
        <option value="nurture-3" />
        <option value="promo" />
        <option value="reengage" />
      </datalist>

      <p className="-mt-1 text-xs text-ink-4">
        The key is the <strong className="text-ink-2">c=</strong> value in the template&apos;s tracking pixel
        and links. Keep it lowercase with dashes, e.g. <strong className="text-ink-2">welcome</strong> or
        <strong className="text-ink-2"> newsletter-2026-07</strong>.
      </p>

      <button
        type="submit"
        className="mt-1 self-start rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-bg transition-colors hover:bg-ink-2"
      >
        Add campaign
      </button>
    </form>
  );
}
