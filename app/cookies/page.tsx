import type { Metadata } from "next";
import { LegalLayout } from "@/components/LegalLayout";
import { LegalDocView } from "@/components/LegalDoc";
import { cookiePolicy } from "@/config/legal";
import { business } from "@/config/site";

export const metadata: Metadata = {
  title: cookiePolicy.title,
  description: cookiePolicy.subtitle,
  alternates: { canonical: `${business.url}/cookies` },
};

export default function CookiesPage() {
  return (
    <LegalLayout>
      <LegalDocView doc={cookiePolicy} />
    </LegalLayout>
  );
}
