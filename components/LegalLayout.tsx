import type { ReactNode } from "react";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";

export function LegalLayout({ children }: { children: ReactNode }) {
  return (
    <main className="relative min-h-screen bg-bg text-ink">
      <Nav />
      {children}
      <Footer />
    </main>
  );
}
