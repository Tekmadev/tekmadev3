import Image from "next/image";
import { Phone, Mail } from "lucide-react";
import { business, footerColumns, footerCopy } from "@/config/site";

export function Footer() {
  return (
    <footer className="relative border-t border-line bg-bg">
      <div className="mx-auto w-full max-w-6xl px-5 py-20 sm:px-8 lg:px-10">
        <div className="grid grid-cols-1 gap-12 md:grid-cols-12">
          <div className="md:col-span-5">
            <a href="/#top" className="flex items-center gap-3" aria-label={business.name}>
              <Image
                src="/images/logo/TMD2_logo.svg"
                alt={`${business.name} mark`}
                width={56}
                height={56}
                className="h-14 w-14"
              />
              <span className="font-display text-3xl font-bold tracking-tight text-ink">
                {business.name}
              </span>
            </a>
            <p className="mt-7 max-w-md text-base leading-relaxed text-ink-3">
              {footerCopy.tagline}
            </p>

            <div className="mt-7 flex flex-col gap-2.5">
              <a
                href={`tel:${business.phone.tel}`}
                className="group inline-flex items-center gap-2.5 text-sm text-ink-2 transition-colors hover:text-gold"
              >
                <Phone className="h-3.5 w-3.5 text-gold" />
                {business.phone.display}
              </a>
              <a
                href={`mailto:${business.email}`}
                className="group inline-flex items-center gap-2.5 text-sm text-ink-2 transition-colors hover:text-gold"
              >
                <Mail className="h-3.5 w-3.5 text-gold" />
                {business.email}
              </a>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-10 md:col-span-7 md:grid-cols-3">
            {footerColumns.map((col) => (
              <FooterCol key={col.label} label={col.label} items={col.items} />
            ))}
          </div>
        </div>

        <div className="mt-16 flex flex-col gap-3 border-t border-line pt-6 text-xs text-ink-4 md:flex-row md:items-center md:justify-between">
          <p>
            © {new Date().getFullYear()} {business.legalName}
          </p>
          <p className="font-mono uppercase tracking-[0.18em]">{footerCopy.signoff}</p>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({
  label,
  items,
}: {
  label: string;
  items: readonly { label: string; href: string }[];
}) {
  return (
    <div>
      <p className="eyebrow">{label}</p>
      <ul className="mt-4 space-y-2.5">
        {items.map((it) => (
          <li key={it.label}>
            <a
              href={it.href}
              className="text-sm text-ink-2 transition-colors duration-200 hover:text-gold"
            >
              {it.label}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
