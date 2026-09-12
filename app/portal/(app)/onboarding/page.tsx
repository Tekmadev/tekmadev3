import { requireClient } from "@/lib/portal-auth";
import { derivedStage, getActiveOnboarding, listTasks, stagesInRun, taskProgress } from "@/lib/onboarding-data";
import { isProductPlan } from "@/config/products";
import { StageTracker } from "@/components/portal/StageTracker";
import { TaskList } from "@/components/portal/TaskList";
import { EmptyState, Notice, PageHeader, Panel, fmtDate } from "@/components/portal/ui";
import { completeTaskAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const { client } = await requireClient();
  const onboarding = await getActiveOnboarding(client.id);
  const tasks = onboarding ? await listTasks(onboarding.id) : [];
  const progress = taskProgress(tasks);
  const stage = onboarding ? derivedStage(onboarding, tasks) : "complete";
  const oneTime = isProductPlan(client.plan_id);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Onboarding"
        subtitle={
          onboarding?.target_live_date
            ? `Target go-live ${fmtDate(onboarding.target_live_date)}. ${oneTime ? "Live in 14 days once we have your content." : "We install in 14 days."}`
            : "Everything from payment to live."
        }
      />

      {!onboarding ? (
        <EmptyState title="No onboarding in progress" body={oneTime ? "Your website is live. If you add a growth plan, a new checklist appears here." : "Your system is live. If you upgrade your plan, a new checklist appears here."} />
      ) : (
        <>
          {onboarding.blocked && (
            <Notice kind="err">
              We are blocked: {onboarding.blocked_reason || "waiting on something from you"}. Check the items marked for you below.
            </Notice>
          )}
          <Panel>
            <StageTracker current={stage} percent={progress.percent} stages={stagesInRun(tasks)} />
          </Panel>
          <Panel title="Checklist" description="Items marked You are yours. The rest is on us, shown so you always know where things stand.">
            <TaskList tasks={tasks} completeAction={completeTaskAction} />
          </Panel>
        </>
      )}
    </div>
  );
}
