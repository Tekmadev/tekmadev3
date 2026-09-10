import { FileText, Trash2 } from "lucide-react";
import { requireClient } from "@/lib/portal-auth";
import { listAssets, signedAssetUrl } from "@/lib/onboarding-data";
import { AssetUploader } from "@/components/portal/AssetUploader";
import { PortalForm } from "@/components/portal/PortalForm";
import { Badge, EmptyState, PageHeader, Panel, fmtBytes, fmtDate, humanize } from "@/components/portal/ui";
import { deleteAssetAction, recordUploadAction, requestUploadAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function AssetsPage() {
  const { client } = await requireClient();
  const assets = await listAssets(client.id);
  const withUrls = await Promise.all(
    assets.map(async (a) => ({
      ...a,
      url: await signedAssetUrl(a.storage_path, 60 * 30),
      isImage: (a.mime_type || "").startsWith("image/"),
    })),
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Files" subtitle="Your logo, photos of your work and team, and any brand guide. The more we have, the better your site looks." />

      <Panel title="Upload">
        <AssetUploader requestUpload={requestUploadAction} recordUpload={recordUploadAction} />
      </Panel>

      <Panel title={`Uploaded (${assets.length})`}>
        {withUrls.length === 0 ? (
          <EmptyState title="No files yet" body="Start with your logo. Photos of real jobs beat stock every time." />
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {withUrls.map((a) => (
              <li key={a.id} className="flex flex-col overflow-hidden rounded-xl border border-line-strong bg-bg-2">
                <a href={a.url ?? "#"} target="_blank" rel="noopener" className="block aspect-square bg-bg-3">
                  {a.isImage && a.url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={a.url} alt={a.file_name} className="h-full w-full object-cover" loading="lazy" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-ink-4">
                      <FileText className="h-8 w-8" />
                    </div>
                  )}
                </a>
                <div className="flex flex-col gap-1 p-2.5">
                  <p className="truncate text-xs font-medium text-ink" title={a.file_name}>
                    {a.file_name}
                  </p>
                  <div className="flex items-center justify-between gap-2">
                    <Badge tone="muted">{humanize(a.kind)}</Badge>
                    <span className="text-[11px] text-ink-4">{fmtBytes(a.size_bytes)}</span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-ink-4">
                    <span>{fmtDate(a.created_at)}</span>
                    <PortalForm action={deleteAssetAction}>
                      <input type="hidden" name="asset_id" value={a.id} />
                      <button type="submit" aria-label={`Remove ${a.file_name}`} className="rounded p-1.5 text-ink-4 hover:text-signal">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </PortalForm>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
