import type { Metadata } from "next";
import { loadApproval } from "@/lib/approval-token";
import { loadFormBranding } from "@/lib/public-form";
import { clientIp } from "@/lib/crypto";
import { rateLimit } from "@/lib/rate-limit";
import { RespondForm } from "./respond-form";

export const metadata: Metadata = {
  title: "Approve your testimonial",
  robots: { index: false, follow: false },
};

const CLOSED = {
  invalid: { title: "Link not found", text: "This link isn't valid or has been replaced by a newer one." },
  unavailable: { title: "Temporarily unavailable", text: "Please try again later." },
  expired: { title: "Link expired", text: "This approval link has expired. Ask for a new one if you still want to review the quote." },
  limited: { title: "Too many requests", text: "Please wait a minute and reload the page." },
};

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex flex-1 items-start justify-center bg-slate-50 px-4 py-12 sm:py-20">
      <div className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">{children}</div>
    </main>
  );
}

function Closed({ kind }: { kind: keyof typeof CLOSED }) {
  return (
    <Shell>
      <h1 className="text-xl font-semibold text-slate-900">{CLOSED[kind].title}</h1>
      <p className="mt-2 text-slate-600">{CLOSED[kind].text}</p>
    </Shell>
  );
}

/** Public page where a client approves the owner's edited wording of their testimonial. */
export default async function ApprovalPage({ params }: PageProps<"/a/[token]">) {
  const { token } = await params;
  if (!rateLimit(`approve-view:${await clientIp()}`, 60, 60_000)) return <Closed kind="limited" />;
  const loaded = await loadApproval(token);
  if (loaded.state !== "ok") return <Closed kind={loaded.state} />;

  const t = loaded.testimonial;
  const { theme, ownerName } = await loadFormBranding(t.workspace_id, null);
  const from = ownerName || loaded.workspaceName;
  const role = [t.display_role, t.display_company].filter(Boolean).join(", ");
  const byline = [t.display_name, role].filter(Boolean).join(" · ");

  return (
    <Shell>
      <p className="text-sm text-slate-500">{from}</p>
      <h1 className="mt-1 text-2xl font-semibold text-slate-900">Is this quote OK to publish?</h1>
      <p className="mt-2 text-slate-600">
        {from} shortened your feedback for their website. Please check the wording still says what you meant.
      </p>
      <figure className="my-6 rounded-xl border-l-4 bg-slate-50 p-5" style={{ borderColor: theme.primary }}>
        <blockquote className="whitespace-pre-wrap text-lg leading-relaxed text-slate-900">“{t.approval_quote}”</blockquote>
        {byline && <figcaption className="mt-3 text-sm text-slate-600">— {byline}</figcaption>}
      </figure>
      {t.approval_status === "pending" ? (
        <RespondForm token={token} primary={theme.primary} />
      ) : (
        <p role="status" className="rounded-lg bg-slate-100 p-4 text-slate-700">
          {t.approval_status === "approved" ? "You approved this quote. Thank you!" : "Thanks, your response has been recorded."}
        </p>
      )}
    </Shell>
  );
}
