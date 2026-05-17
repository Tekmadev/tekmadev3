import type { Metadata } from "next";
import { LegalLayout } from "@/components/LegalLayout";
import { LegalDocView } from "@/components/LegalDoc";
import { privacyPolicy } from "@/config/legal";
import { business } from "@/config/site";

export const metadata: Metadata = {
  title: privacyPolicy.title,
  description: privacyPolicy.subtitle,
  alternates: { canonical: `${business.url}/privacy` },
};

export default function PrivacyPage() {
  return (
    <LegalLayout>
      <LegalDocView doc={privacyPolicy} />
    </LegalLayout>
  );
}
