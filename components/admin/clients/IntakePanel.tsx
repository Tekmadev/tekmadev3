import { INTAKE_SECTIONS } from "@/lib/intake-schema";
import type { ClientIntake } from "@/lib/onboarding-data";
import { Badge, Row, fmtDateTime } from "@/components/portal/ui";
import { SubmitButton } from "@/components/portal/SubmitButton";
import { markIntakeReviewedAction } from "@/app/admin/(dashboard)/clients/actions";

function show(v: unknown, options?: { value: string; label: string }[]): string {
  if (v == null || v === "") return "-";
  if (Array.isArray(v)) return v.map((x) => options?.find((o) => o.value === x)?.label ?? String(x)).join(", ") || "-";
  if (options) return options.find((o) => o.value === v)?.label ?? String(v);
  return String(v);
}

export function IntakePanel({ intake, clientId }: { intake: ClientIntake | null; clientId: string }) {
  if (!intake) return <p className="text-sm text-ink-4">The client has not started the intake yet.</p>;
  const a = intake.answers as Record<string, unknown>;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3 text-sm text-ink-3">
        <Badge tone={intake.status === "reviewed" ? "ok" : intake.status === "submitted" ? "gold" : "neutral"}>{intake.status}</Badge>
        <span>v{intake.version}</span>
        {intake.submitted_at && <span>Submitted {fmtDateTime(intake.submitted_at)}</span>}
        {intake.reviewed_at && <span>Reviewed {fmtDateTime(intake.reviewed_at)}</span>}
        {intake.status === "submitted" && (
          <form action={markIntakeReviewedAction} className="ml-auto">
            <input type="hidden" name="intake_id" value={intake.id} />
            <input type="hidden" name="client_id" value={clientId} />
            <SubmitButton variant="secondary" pendingLabel="Saving">
              Mark reviewed
            </SubmitButton>
          </form>
        )}
      </div>
      {INTAKE_SECTIONS.map((s) => (
        <div key={s.key}>
          <p className="text-sm font-semibold text-ink">{s.title}</p>
          <dl className="mt-1 divide-y divide-line">
            {s.fields.map((f) => (
              <Row key={f.key} label={f.label}>
                <span className="whitespace-pre-line">{show(a[f.key], f.options)}</span>
              </Row>
            ))}
          </dl>
        </div>
      ))}
    </div>
  );
}
