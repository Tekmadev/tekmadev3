import { requireOwner } from "@/lib/admin";
import { PageHeader, Notice } from "@/components/admin/ui";
import { LoaderSettingsForm } from "@/components/admin/LoaderSettingsForm";
import { getLoaderSettings } from "@/lib/site-settings";
import { saveLoaderAction } from "./actions";

export const dynamic = "force-dynamic";

const NOTICES: Record<string, { kind: "ok" | "err"; text: string }> = {
  saved: { kind: "ok", text: "Saved. Every page on the site now uses these settings." },
  reset: { kind: "ok", text: "Back to the original settings, live on every page." },
  db: { kind: "err", text: "Could not save. Nothing changed on the site. Try again." },
};

export default async function LoaderPage({ searchParams }: { searchParams: Promise<{ ok?: string; e?: string }> }) {
  await requireOwner();
  const [{ ok, e }, settings] = await Promise.all([searchParams, getLoaderSettings()]);
  const notice = ok ? NOTICES[ok] : e ? NOTICES[e] : null;

  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <PageHeader
        title="Loader"
        subtitle="The black hole logo that shows while a page loads and inside every button that is working."
      />
      {notice && <Notice kind={notice.kind}>{notice.text}</Notice>}
      <LoaderSettingsForm initial={settings} action={saveLoaderAction} />
    </div>
  );
}
