import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireOwner } from "@/lib/admin";
import { marketingEmailTemplates } from "@/lib/email-templates.generated";
import { PageHeader } from "@/components/admin/ui";
import { EmailTemplateOrganizer } from "@/components/admin/EmailTemplateOrganizer";

export const dynamic = "force-dynamic";

export default async function EmailTemplatesPage() {
  await requireOwner();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Email templates"
        subtitle="Preview each marketing email and copy its GHL-ready HTML."
      >
        <Link
          href="/admin/email"
          className="inline-flex items-center gap-1.5 rounded-full border border-line-strong px-4 py-2 text-sm text-ink-2 transition-colors hover:border-gold/50 hover:text-gold"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Email
        </Link>
      </PageHeader>

      <EmailTemplateOrganizer templates={marketingEmailTemplates} />
    </div>
  );
}
