import Image from "next/image";
import { business } from "@/config/site";

export default function PortalAuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-5 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-3">
          <Image src="/images/logo/TMD2_logo.svg" alt="" width={40} height={40} className="h-10 w-10" />
          <div className="leading-tight">
            <p className="font-display text-lg font-bold text-ink">{business.name}</p>
            <p className="text-[11px] font-medium uppercase tracking-wide text-gold-deep">Client portal</p>
          </div>
        </div>
        {children}
      </div>
    </main>
  );
}
