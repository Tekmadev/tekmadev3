import { requireClient } from "@/lib/portal-auth";
import { derivedStage, getActiveOnboarding, listTasks, taskProgress } from "@/lib/onboarding-data";
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

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Onboarding"
        subtitle={
          onboarding?.target_live_date ? `Target go-live ${fmtDate(onboarding.target_live_date)}. We install in 14 days.` : "Everything from payment to live."
        }
      />

      {!onboarding ? (
        <EmptyState title="No onboarding in progress" body="Your system is live. If you upgrade your plan, a new checklist appears here." />
      ) : (
        <>
          {onboarding.blocked && (
            <Notice kind="err">
              We are blocked: {onboarding.blocked_reason || "waiting on something from you"}. Check the items marked for you below.
            </Notice>
          )}
          <Panel>
            <StageTracker current={stage} percent={progress.percent} />
          </Panel>
          <Panel title="Checklist" description="Items marked You are yours. The rest is on us, shown so you always know where things stand.">
            <TaskList tasks={tasks} completeAction={completeTaskAction} />
          </Panel>
        </>
      )}
    </div>
  );
}
