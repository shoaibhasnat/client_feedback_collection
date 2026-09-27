import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Button, Card, CardHeader, PageHeader } from "@/components/ui";
import { ConfirmSubmit } from "@/components/ui/client";
import { requireOwner } from "@/lib/auth";
import { CONSENT_HELP } from "@/lib/consent";
import { readClientField, type ClientRecord } from "@/lib/form/snapshot";
import type { ConsentLevel, TemplateSnapshot } from "@/lib/form/types";
import { signPaths } from "@/lib/uploads";
import { firstName, formatDate } from "@/lib/utils";
import { deleteTestimonialAction, dismissMergeAction, mergeIntoClientAction, saveFromSubmissionAction } from "../../actions";
import { ReviewWorkspace, type EditorValues, type RawAnswer } from "../../testimonial-editor";

export default async function ReviewSubmissionPage({ params }: PageProps<"/admin/testimonials/review/[submissionId]">) {
  const { submissionId } = await params;
  const { supabase, readOnly } = await requireOwner();

  const { data: sub } = await supabase
    .from("submissions")
    .select("*, requests(id, token, client_id, project_id, template_snapshot, clients(*), projects(name))")
    .eq("id", submissionId)
    .maybeSingle();
  if (!sub || !sub.submitted_at) notFound();

  const req = sub.requests as unknown as {
    id: string;
    client_id: string;
    template_snapshot: TemplateSnapshot;
    clients: ClientRecord & { id: string };
    projects: { name: string } | null;
  };
  const snapshot = req.template_snapshot;
  const client = req.clients;
  const about = sub.about as Record<string, unknown>;
  const contact = sub.contact as Record<string, unknown>;
  const consent = sub.consent_level as ConsentLevel | null;

  const { data: testimonial } = await supabase.from("testimonials").select("*").eq("submission_id", submissionId).maybeSingle();

  const itemsBySection = (section: string) => snapshot.items.filter((i) => i.section === section);
  const asText = (v: unknown) => (Array.isArray(v) ? v.join(", ") : v === null || v === undefined ? "" : String(v));

  const answers: RawAnswer[] = itemsBySection("question")
    .map((i) => ({ key: i.key, label: i.label, value: asText((sub.answers as Record<string, unknown>)[i.key]) }))
    .filter((a) => a.value);

  const photoItem = snapshot.items.find((i) => i.type === "image" && i.maps_to_client_field === "photo_url");
  const logoItem = snapshot.items.find((i) => i.type === "image" && i.maps_to_client_field === "logo_url");
  const photoPath = photoItem ? (about[photoItem.key] as string | null) : null;
  const logoPath = logoItem ? (about[logoItem.key] as string | null) : null;

  // Merge candidates: submitted About You / Contact values that differ from the client record.
  const mergeRows = snapshot.items
    .filter((i) => i.section !== "question" && i.maps_to_client_field)
    .map((i) => {
      const submitted = asText((i.section === "about" ? about : contact)[i.key]).trim();
      const current = readClientField(client, i.maps_to_client_field) ?? "";
      return { item: i, submitted, current };
    })
    .filter((r) => r.submitted && r.submitted !== r.current);

  const sign = await signPaths(supabase, [photoPath, logoPath, ...mergeRows.filter((r) => r.item.type === "image").flatMap((r) => [r.submitted, r.current])]);

  const fullName = asText(about.full_name) || client.name;
  const initial: EditorValues = testimonial
    ? {
        ...testimonial,
        use_photo: Boolean(testimonial.photo_url),
        use_logo: Boolean(testimonial.logo_url),
      }
    : {
        display_quote: "",
        headline: null,
        // Suggested defaults already respect the consent level.
        display_name: consent === "anonymous" ? null : consent === "partial" ? firstName(fullName) : fullName,
        display_role: asText(about.job_title) || (client.job_title as string | null) || null,
        display_company: consent === "anonymous" || consent === "partial" ? null : asText(about.company) || client.company,
        rating: sub.rating,
        date: sub.submitted_at.slice(0, 10),
        visibility: "hidden",
        featured: false,
        use_photo: consent === "full" && Boolean(photoPath),
        use_logo: consent === "full" && Boolean(logoPath),
      };

  return (
    <>
      <PageHeader
        title={`Submission from ${client.name}`}
        description={
          <>
            {req.projects?.name ?? "No project"} · submitted {formatDate(sub.submitted_at, true)} ·{" "}
            <Link href={`/admin/requests/${req.id}`} className="underline">
              request
            </Link>
          </>
        }
        back={{ href: "/admin/testimonials", label: "Testimonials" }}
        actions={
          <>
            {sub.rating && <Badge tone="amber">{"★".repeat(sub.rating)}</Badge>}
            <Badge tone={consent === "private" ? "red" : "blue"}>Consent: {consent ?? "—"}</Badge>
          </>
        }
      />

      <ReviewWorkspace
        answers={answers}
        initial={initial}
        action={saveFromSubmissionAction.bind(null, submissionId)}
        consentLevel={consent}
        consentHelp={consent ? CONSENT_HELP[consent] : null}
        photoUrl={sign(photoPath)}
        logoUrl={sign(logoPath)}
      >
        <Card id="merge">
          <CardHeader
            title="Update client profile?"
            description={
              sub.merge_status === "pending"
                ? "The client's answers are shown next to what you have on file. Nothing changes until you accept."
                : `Resolved: ${sub.merge_status} ${formatDate(sub.merge_resolved_at, true)}`
            }
          />
          {sub.merge_status === "pending" && mergeRows.length > 0 && !readOnly ? (
            <form action={mergeIntoClientAction.bind(null, submissionId)} className="p-5">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="w-8 pb-2">
                        <span className="sr-only">Accept</span>
                      </th>
                      <th className="pb-2">Field</th>
                      <th className="pb-2">On file</th>
                      <th className="pb-2">Client submitted</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {mergeRows.map((r) => (
                      <tr key={r.item.key}>
                        <td className="py-2">
                          <input type="checkbox" name="field" value={r.item.maps_to_client_field!} defaultChecked aria-label={`Accept ${r.item.label}`} className="size-4" />
                        </td>
                        <td className="py-2 font-medium text-slate-700">{r.item.label}</td>
                        <td className="py-2 text-slate-500">{r.item.type === "image" ? <Thumb url={sign(r.current)} /> : r.current || "—"}</td>
                        <td className="py-2 text-slate-900">{r.item.type === "image" ? <Thumb url={sign(r.submitted)} /> : r.submitted}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-4 flex gap-2">
                <Button size="sm">Accept selected</Button>
                <Button size="sm" variant="ghost" formAction={dismissMergeAction.bind(null, submissionId)}>
                  Keep what I have
                </Button>
              </div>
            </form>
          ) : (
            <p className="p-5 text-sm text-slate-500">
              {sub.merge_status === "pending" ? "Nothing new: the submitted details match the client record." : "Done."}
            </p>
          )}
        </Card>

        <Card>
          <CardHeader title="Private details" description="Never shown publicly." />
          <dl className="grid gap-3 p-5 text-sm sm:grid-cols-2">
            {[...itemsBySection("about"), ...itemsBySection("contact")]
              .filter((i) => i.type !== "image")
              .map((i) => (
                <div key={i.key}>
                  <dt className="text-xs uppercase tracking-wide text-slate-500">{i.label}</dt>
                  <dd className="mt-0.5 break-words text-slate-900">
                    {asText((i.section === "about" ? about : contact)[i.key]) || "—"}
                  </dd>
                </div>
              ))}
            <div className="sm:col-span-2">
              <dt className="text-xs uppercase tracking-wide text-slate-500">Consent text shown</dt>
              <dd className="mt-0.5 text-slate-700">
                “{sub.consent_text}” · {formatDate(sub.consent_at, true)}
              </dd>
            </div>
          </dl>
        </Card>

        {testimonial && !readOnly && (
          <form action={deleteTestimonialAction.bind(null, testimonial.id)}>
            <ConfirmSubmit variant="outline" message="Delete the showcase testimonial? The client's original submission is kept.">
              Delete showcase testimonial
            </ConfirmSubmit>
          </form>
        )}
      </ReviewWorkspace>
    </>
  );
}

function Thumb({ url }: { url: string | null }) {
  if (!url) return <>—</>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="" className="size-10 rounded-md border border-slate-200 object-cover" />;
}
