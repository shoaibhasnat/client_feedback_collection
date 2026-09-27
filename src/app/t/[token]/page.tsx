import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadFormBranding, loadRequestByToken, signFormImages } from "@/lib/public-form";
import { buildSteps, estimateMinutes, initialValues, sanitizeValues } from "@/lib/form/steps";
import type { FormValues } from "@/lib/form/types";
import { clientIp } from "@/lib/crypto";
import { rateLimit } from "@/lib/rate-limit";
import { FormFlow } from "./form-flow";

export const metadata: Metadata = {
  title: "Share your feedback",
  robots: { index: false, follow: false },
};

const CLOSED: Record<string, { title: string; text: string }> = {
  invalid: { title: "Link not found", text: "This link isn't valid. Check you copied the whole link." },
  unavailable: { title: "Temporarily unavailable", text: "This form is temporarily unavailable. Please try again later." },
  revoked: { title: "Link no longer active", text: "This feedback link has been closed." },
  expired: { title: "Link expired", text: "This feedback link has expired." },
  submitted: { title: "Already submitted, thank you", text: "Your feedback has been received. Thank you for taking the time!" },
  limited: { title: "Too many requests", text: "Please wait a minute and reload the page." },
};

function ClosedScreen({ kind }: { kind: keyof typeof CLOSED }) {
  const c = CLOSED[kind];
  return (
    <main className="flex flex-1 items-center justify-center bg-white px-4 py-16">
      <div className="max-w-sm text-center">
        <h1 className="text-xl font-semibold text-slate-900">{c.title}</h1>
        <p className="mt-2 text-slate-600">{c.text}</p>
      </div>
    </main>
  );
}

export default async function TestimonialFormPage({ params }: PageProps<"/t/[token]">) {
  const { token } = await params;
  if (!rateLimit(`lookup:${await clientIp()}`, 60, 60_000)) return <ClosedScreen kind="limited" />;

  const loaded = await loadRequestByToken(token);
  if (loaded.state !== "ok") return <ClosedScreen kind={loaded.state} />;
  const request = loaded.request;
  const snapshot = request.template_snapshot;
  const admin = createAdminClient();

  // Log the first visit ("opened").
  if (!request.opened_at) {
    const now = new Date().toISOString();
    await admin
      .from("requests")
      .update({ opened_at: now, sent_at: request.sent_at ?? now, status: "opened" })
      .eq("id", request.id)
      .in("status", ["draft", "sent"]);
    await admin.from("activity_log").insert({
      workspace_id: request.workspace_id,
      client_id: request.client_id,
      entity_type: "request",
      entity_id: request.id,
      action: "opened",
    });
  }

  // Resume a saved draft if there is one.
  const { data: draft } = await admin
    .from("submissions")
    .select("id, rating, answers, about, contact, consent_level, progress_step")
    .eq("request_id", request.id)
    .maybeSingle();

  let values: FormValues = initialValues(snapshot);
  if (draft) {
    const saved = sanitizeValues(
      {
        rating: draft.rating,
        answers: { ...values.answers, ...(draft.answers as FormValues["answers"]) },
        about: { ...values.about, ...(draft.about as FormValues["about"]) },
        contact: { ...values.contact, ...(draft.contact as FormValues["contact"]) },
        consent_level: draft.consent_level,
      },
      snapshot,
    );
    values = saved;
  }
  const imagePaths = snapshot.items
    .filter((i) => i.type === "image" && i.section !== "question")
    .map((i) => values[i.section as "about" | "contact"][i.key])
    .filter((v): v is string => typeof v === "string" && v !== "");
  const imageUrls = await signFormImages(
    request.workspace_id,
    { submissionId: draft?.id ?? null, clientId: request.client_id },
    imagePaths,
  );

  const branding = await loadFormBranding(request.workspace_id, snapshot.owner.photo_url);
  const steps = buildSteps(snapshot);
  const startStep = draft ? Math.min(draft.progress_step, steps.length - 1) : 0;

  return (
    <FormFlow
      token={token}
      snapshot={{ ...snapshot, owner: { ...snapshot.owner, name: branding.ownerName ?? snapshot.owner.name } }}
      initialValues={values}
      initialStep={startStep}
      initialImageUrls={imageUrls}
      personalMessage={request.personal_message}
      ownerPhotoUrl={branding.ownerPhotoUrl}
      shareUrl={branding.shareUrl}
      theme={branding.theme}
      minutes={estimateMinutes(snapshot)}
    />
  );
}
