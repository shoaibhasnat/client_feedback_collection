"use client";

import { useActionState, useEffect, useRef } from "react";
import { Textarea } from "@/components/ui";
import { SubmitButton } from "@/components/ui/client";
import { addNoteAction, type FormState } from "../actions";

export function NoteForm({ clientId }: { clientId: string }) {
  const [state, action] = useActionState<FormState, FormData>(addNoteAction.bind(null, clientId), {});
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state]);
  return (
    <form ref={ref} action={action} className="space-y-2">
      <Textarea name="body" rows={3} aria-label="New note" placeholder="e.g. Has a second store launching in March" maxLength={5000} required />
      {state.error && <p className="text-xs text-red-600">{state.error}</p>}
      <SubmitButton size="sm" variant="outline" pendingText="Adding…">
        Add note
      </SubmitButton>
    </form>
  );
}
