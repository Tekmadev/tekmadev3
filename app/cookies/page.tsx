import type { Metadata } from "next";
import { LegalLayout } from "@/components/LegalLayout";
import { LegalDocView } from "@/components/LegalDoc";
import { cookiePolicy } from "@/config/legal";
import { business } from "@/config/site";
import { socialMeta } from "@/lib/seo";

export const metadata: Metadata = {
  title: cookiePolicy.title,
  description: cookiePolicy.subtitle,
  alternates: { canonical: `${business.url}/cookies` },
  ...socialMeta({ title: cookiePolicy.title, description: cookiePolicy.subtitle, url: `${business.url}/cookies` }),
};

export default function CookiesPage() {
  return (
    <LegalLayout>
      <LegalDocView doc={cookiePolicy} />
    </LegalLayout>
  );
}
