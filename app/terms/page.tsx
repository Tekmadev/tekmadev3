import type { Metadata } from "next";
import { LegalLayout } from "@/components/LegalLayout";
import { LegalDocView } from "@/components/LegalDoc";
import { termsOfService } from "@/config/legal";
import { business } from "@/config/site";

export const metadata: Metadata = {
  title: termsOfService.title,
  description: termsOfService.subtitle,
  alternates: { canonical: `${business.url}/terms` },
};

export default function TermsPage() {
  return (
    <LegalLayout>
      <LegalDocView doc={termsOfService} />
    </LegalLayout>
  );
}
