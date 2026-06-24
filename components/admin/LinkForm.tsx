import { cn } from "@/lib/cn";
import { business } from "@/config/site";
import { createLinkAction } from "@/app/admin/(dashboard)/links/actions";

const inputClass =
  "rounded-xl border border-line-strong bg-bg px-3 py-2.5 text-ink outline-none focus:border-gold";
const labelClass = "flex flex-col gap-1.5 text-sm text-ink-2";

export function LinkForm() {
  return (
    <form action={createLinkAction} className="flex flex-col gap-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className={labelClass}>
          Slug
          <div className={cn(inputClass, "flex items-center gap-1 px-3 py-0 focus-within:border-gold")}>
            <span className="shrink-0 text-sm text-ink-4">{business.domain}/</span>
            <input
              name="slug"
              type="text"
              required
              placeholder="qr-card"
              autoCapitalize="none"
              autoComplete="off"
              className="w-full bg-transparent py-2.5 text-ink outline-none lowercase placeholder:normal-case placeholder:text-ink-4"
            />
          </div>
        </label>
        <label className={labelClass}>
          Destination
          <input
            name="destination"
            type="text"
            defaultValue="/"
            placeholder="/  or  /start  or  https://..."
            className={cn(inputClass, "placeholder:text-ink-4")}
          />
        </label>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <label className={labelClass}>
          Source
          <input
            name="utm_source"
            type="text"
            placeholder="instagram"
            list="utm-source-suggestions"
            className={cn(inputClass, "lowercase placeholder:text-ink-4")}
          />
        </label>
        <label className={labelClass}>
          Medium
          <input
            name="utm_medium"
            type="text"
            placeholder="qr"
            list="utm-medium-suggestions"
            className={cn(inputClass, "lowercase placeholder:text-ink-4")}
          />
        </label>
        <label className={labelClass}>
          Campaign
          <input
            name="utm_campaign"
            type="text"
            placeholder="business_card"
            className={cn(inputClass, "lowercase placeholder:text-ink-4")}
          />
        </label>
      </div>

      <datalist id="utm-source-suggestions">
        <option value="instagram" />
        <option value="facebook" />
        <option value="linkedin" />
        <option value="business_card" />
        <option value="google" />
        <option value="youtube" />
        <option value="email" />
      </datalist>
      <datalist id="utm-medium-suggestions">
        <option value="social" />
        <option value="qr" />
        <option value="email" />
        <option value="cpc" />
        <option value="organic" />
        <option value="offline" />
      </datalist>

      <label className={labelClass}>
        Internal label (optional)
        <input
          name="label"
          type="text"
          placeholder="e.g. Business card QR"
          className={cn(inputClass, "placeholder:text-ink-4")}
        />
      </label>

      <p className="-mt-1 text-xs text-ink-4">
        Visitors who hit this link are forwarded to the destination tagged with these UTMs, so the visit, and any
        booking or sale that follows, is attributed to the source. Lowercase, no spaces.
      </p>

      <button
        type="submit"
        className="mt-1 self-start rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-bg transition-colors hover:bg-ink-2"
      >
        Create link
      </button>
    </form>
  );
}
