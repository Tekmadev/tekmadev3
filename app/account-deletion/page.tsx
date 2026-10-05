import type { Metadata } from "next";
import { LegalLayout } from "@/components/LegalLayout";
import { LegalDocView } from "@/components/LegalDoc";
import { accountDeletion } from "@/config/legal";
import { business } from "@/config/site";
import { socialMeta } from "@/lib/seo";

export const metadata: Metadata = {
  title: accountDeletion.title,
  description: accountDeletion.subtitle,
  alternates: { canonical: `${business.url}/account-deletion` },
  ...socialMeta({ title: accountDeletion.title, description: accountDeletion.subtitle, url: `${business.url}/account-deletion` }),
};

export default function AccountDeletionPage() {
  return (
    <LegalLayout>
      <LegalDocView doc={accountDeletion} />
    </LegalLayout>
  );
}
