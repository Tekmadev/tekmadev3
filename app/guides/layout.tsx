import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";

export default function GuidesLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative min-h-screen bg-bg text-ink">
      <Nav />
      {children}
      <Footer />
    </main>
  );
}
