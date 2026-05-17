import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { Hero } from "@/components/sections/Hero";
import { WhatItIs } from "@/components/sections/WhatItIs";
import { TheSystem } from "@/components/sections/TheSystem";
import { Proof } from "@/components/sections/Proof";
import { Pricing } from "@/components/sections/Pricing";
import { FAQ } from "@/components/sections/FAQ";
import { FinalCTA } from "@/components/sections/FinalCTA";
import { JsonLd } from "@/components/JsonLd";
import { faqJsonLd, howToJsonLd, offerJsonLd, serviceJsonLd } from "@/lib/seo";

export default function Home() {
  return (
    <main className="relative min-h-screen bg-bg text-ink">
      <JsonLd data={serviceJsonLd} />
      <JsonLd data={offerJsonLd} />
      <JsonLd data={faqJsonLd} />
      <JsonLd data={howToJsonLd} />

      <Nav />
      <Hero />
      <WhatItIs />
      <TheSystem />
      <Proof />
      <Pricing />
      <FAQ />
      <FinalCTA />
      <Footer />
    </main>
  );
}
