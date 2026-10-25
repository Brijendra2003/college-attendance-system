import type { Metadata } from "next";
import { Suspense } from "react";
import { blueprintSchema, muEngineeringBlueprint, type BlueprintDoc } from "@/shared/blueprint";
import { formatDateTime } from "@/shared/dates";
import { can, requirePermission } from "@/lib/auth/permissions";
import { db, unwrap } from "@/lib/db";
import { Badge, Card, CardHeader, PageHeader, PageSkeleton, Table, TD, TH, THead, TR } from "@/components/ui/primitives";
import { BlueprintEditor } from "@/features/blueprint/editor";

export const metadata: Metadata = { title: "Blueprint editor" };

export default function BlueprintPage() {
  return (
    <Suspense fallback={<PageSkeleton variant="detail" />}>
      <Blueprint />
    </Suspense>
  );
}

const TONE = { draft: "warn", active: "ok", superseded: "neutral" } as const;

async function Blueprint() {
  const user = await requirePermission("blueprint.manage");
  const s = await db();
  const versions = unwrap(await s.from("blueprint_versions").select("id, version, status, document, created_at, activated_at").order("version", { ascending: false })) as {
    id: string;
    version: number;
    status: keyof typeof TONE;
    document: unknown;
    created_at: string;
    activated_at: string | null;
  }[];
  const parse = (d: unknown): BlueprintDoc | null => {
    const r = blueprintSchema.safeParse(d);
    return r.success ? r.data : null;
  };
  const draft = versions.find((v) => v.status === "draft");
  const activeVersion = versions.find((v) => v.status === "active");
  const active = parse(activeVersion?.document);
  const initial = parse(draft?.document) ?? active ?? muEngineeringBlueprint();

  return (
    <>
      <PageHeader
        eyebrow="Academics"
        title="Blueprint editor"
        description="Branches, divisions and batches per year, the subject catalogue and the daily periods. Edit a draft, check validation and the diff, then activate: structure is upserted by stable codes and deactivated, never deleted."
      />
      <BlueprintEditor initial={initial} active={active} draftId={draft?.id ?? null} canActivate={can(user, "blueprint.activate")} />
      <Card className="mt-6">
        <CardHeader title="Version history" />
        <Table>
          <THead>
            <tr>
              <TH>Version</TH>
              <TH>Status</TH>
              <TH>Created</TH>
              <TH>Activated</TH>
              <TH className="text-right">Branches</TH>
              <TH className="text-right">Subjects</TH>
            </tr>
          </THead>
          <tbody>
            {versions.map((v) => {
              const doc = parse(v.document);
              return (
                <TR key={v.id}>
                  <TD className="font-semibold">v{v.version}</TD>
                  <TD>
                    <Badge tone={TONE[v.status]}>{v.status}</Badge>
                  </TD>
                  <TD className="text-muted">{formatDateTime(v.created_at)}</TD>
                  <TD className="text-muted">{v.activated_at ? formatDateTime(v.activated_at) : "—"}</TD>
                  <TD className="text-right tabular-nums">{doc?.departments.filter((d) => d.active).length ?? "—"}</TD>
                  <TD className="text-right tabular-nums">{doc?.subjects.length ?? "—"}</TD>
                </TR>
              );
            })}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
