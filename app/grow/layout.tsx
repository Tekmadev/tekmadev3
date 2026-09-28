import Image from "next/image";
import { Phone } from "lucide-react";
import { business } from "@/config/site";
import { ThemeToggle } from "@/components/ThemeToggle";
import { CookieSettingsButton } from "@/components/CookieSettingsButton";
import { CanadianBadge } from "@/components/CanadianBadge";

/**
 * /grow and its welcome page are where ads send people, so the chrome is
 * slimmer than the site's: no menu to wander off into, one phone number, and
 * the legal links and cookie settings the consent banner promises.
 */
export default function GrowLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative min-h-screen bg-bg text-ink">
      <header className="relative z-10">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-5 py-5 sm:px-8 lg:px-10">
          <a href="/" className="flex items-center gap-2.5" aria-label={`${business.name} home`}>
            <Image src="/images/logo/TMD2_logo.svg" alt="" width={32} height={32} className="h-8 w-8" priority />
            <span className="font-display text-lg font-bold tracking-tight text-ink">{business.name}</span>
          </a>
          <div className="flex items-center gap-2">
            <a
              href={`tel:${business.phone.tel}`}
              className="inline-flex items-center gap-2 rounded-full border border-line-strong px-3.5 py-2 text-sm text-ink-2 transition-colors hover:border-gold hover:text-gold"
            >
              <Phone className="h-3.5 w-3.5" aria-hidden />
              <span className="hidden sm:inline">{business.phone.display}</span>
              <span className="sm:hidden">Call</span>
            </a>
            <ThemeToggle />
          </div>
        </div>
      </header>

      {children}

      <footer className="border-t border-line">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-5 py-8 text-xs text-ink-4 sm:flex-row sm:items-center sm:justify-between sm:px-8 lg:px-10">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <span>
              © {new Date().getFullYear()} {business.legalName}
            </span>
            <CanadianBadge variant="inline" />
          </div>
          <nav className="flex flex-wrap items-center gap-x-5 gap-y-2" aria-label="Legal">
            <a href="/privacy" className="hover:text-gold">
              Privacy
            </a>
            <a href="/terms" className="hover:text-gold">
              Terms
            </a>
            <CookieSettingsButton className="underline decoration-line-strong underline-offset-4 transition-colors hover:text-gold" />
          </nav>
        </div>
      </footer>
    </main>
  );
}
