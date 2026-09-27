"use client";

import { useActionState, useState } from "react";
import { respondToApproval, type RespondState } from "./actions";

/** Approve, or open a box to suggest changes. The button colour comes from the owner's theme. */
export function RespondForm({ token, primary }: { token: string; primary: string }) {
  const [state, action, pending] = useActionState<RespondState, FormData>(respondToApproval.bind(null, token), {});
  const [suggest, setSuggest] = useState(false);

  if (state.done) {
    return (
      <p role="status" className="rounded-lg bg-emerald-50 p-4 text-emerald-900">
        {state.done === "approved"
          ? "Thank you! Your approval has been recorded."
          : "Thank you! Your suggestions have been sent. You may get an updated version to check."}
      </p>
    );
  }

  const primaryButton = "h-11 rounded-lg px-5 font-medium text-white disabled:opacity-60";
  return (
    <div className="space-y-4">
      {state.error && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">
          {state.error}
        </p>
      )}
      {!suggest ? (
        <div className="flex flex-wrap gap-3">
          <form action={action}>
            <input type="hidden" name="decision" value="approve" />
            <button type="submit" disabled={pending} className={primaryButton} style={{ backgroundColor: primary }}>
              {pending ? "Sending…" : "Approve"}
            </button>
          </form>
          <button type="button" onClick={() => setSuggest(true)} className="h-11 rounded-lg border border-slate-300 px-5 font-medium text-slate-800">
            Suggest changes
          </button>
        </div>
      ) : (
        <form action={action} className="space-y-3">
          <input type="hidden" name="decision" value="changes" />
          <label htmlFor="comment" className="block text-sm font-medium text-slate-800">
            What would you like changed?
          </label>
          <textarea
            id="comment"
            name="comment"
            required
            minLength={3}
            maxLength={2000}
            rows={5}
            autoFocus
            className="w-full rounded-lg border border-slate-300 p-3 text-slate-900 focus:border-slate-500 focus:outline-none"
          />
          <div className="flex flex-wrap gap-3">
            <button type="submit" disabled={pending} className={primaryButton} style={{ backgroundColor: primary }}>
              {pending ? "Sending…" : "Send suggestions"}
            </button>
            <button type="button" onClick={() => setSuggest(false)} className="h-11 rounded-lg px-4 font-medium text-slate-600">
              Back
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
