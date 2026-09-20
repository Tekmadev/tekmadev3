import Image from "next/image";
import { business, type FounderProfile } from "@/config/site";

/**
 * The founder, as a face, a name and the profiles that prove the person is
 * real. Shown under every guide and on the About page. The links carry
 * rel="me", the convention search engines read as "this profile is the same
 * person", and the same URLs are listed as sameAs in the Person schema.
 *
 * The two brand marks are drawn here on purpose: the icon library is dropping
 * brand icons, and an upgrade should not quietly remove these.
 */

const MARKS: Record<FounderProfile["network"], React.ReactNode> = {
  linkedin: (
    <>
      <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z" />
      <rect width="4" height="12" x="2" y="9" />
      <circle cx="4" cy="4" r="2" />
    </>
  ),
  instagram: (
    <>
      <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
    </>
  ),
};

export function FounderCard({ size = "sm" }: { size?: "sm" | "lg" }) {
  const founder = business.privacyOfficer;
  const px = size === "lg" ? 112 : 72;

  return (
    <div className="flex items-center gap-4 sm:gap-5">
      <Image
        src={founder.photo}
        alt={`${founder.name}, founder of Tekmadev`}
        width={px}
        height={px}
        className={`shrink-0 rounded-full object-cover ${size === "lg" ? "h-28 w-28" : "h-[72px] w-[72px]"}`}
      />
      <div className="min-w-0">
        <p className="text-base font-medium text-ink">{founder.name}</p>
        <p className="text-sm text-ink-4">Founder of Tekmadev</p>
        <ul className="mt-2.5 flex items-center gap-2">
          {founder.profiles.map((p) => (
            <li key={p.network}>
              <a
                href={p.url}
                target="_blank"
                rel="me noopener noreferrer"
                aria-label={`${founder.name} on ${p.label}`}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-line-strong text-ink-3 transition-colors hover:border-gold hover:text-gold"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  {MARKS[p.network]}
                </svg>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
