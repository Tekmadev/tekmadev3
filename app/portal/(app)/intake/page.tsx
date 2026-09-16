import { requireClient } from "@/lib/portal-auth";
import { getLatestIntake } from "@/lib/onboarding-data";
import { intakeCompletion, type IntakeAnswers } from "@/lib/intake-schema";
import { IntakeForm } from "@/components/portal/IntakeForm";
import { Badge, PageHeader, ProgressBar, fmtDateTime } from "@/components/portal/ui";
import { saveIntakeAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function IntakePage() {
  const { client } = await requireClient();
  const intake = await getLatestIntake(client.id);
  const answers = (intake?.answers ?? {}) as IntakeAnswers;
  const completion = intakeCompletion(answers);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Your business"
        subtitle="Everything we need to build your website, train your receptionist, and define a qualified booked appointment. Save a draft anytime."
      >
        {intake?.status === "submitted" && <Badge tone="gold">Submitted {fmtDateTime(intake.submitted_at)}</Badge>}
        {intake?.status === "reviewed" && <Badge tone="ok">Reviewed by Tekmadev</Badge>}
      </PageHeader>

      <div className="rounded-2xl border border-line-strong bg-surface p-4 sm:p-5">
        <div className="flex items-center justify-between text-sm">
          <span className="text-ink-3">
            {completion.answered} of {completion.total} answered
          </span>
          <span className="text-ink-4">
            {completion.requiredTotal - completion.missingRequired.length}/{completion.requiredTotal} required
          </span>
        </div>
        <div className="mt-2">
          <ProgressBar percent={Math.round((completion.answered / completion.total) * 100)} />
        </div>
      </div>

      <IntakeForm answers={answers} action={saveIntakeAction} />
    </div>
  );
}
