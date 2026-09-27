"use client";

import { useActionState, useEffect, useRef } from "react";
import { Input } from "@/components/ui";
import { SubmitButton } from "@/components/ui/client";
import { uploadAttachmentAction, type FormState } from "../actions";

export function AttachmentForm({ projectId }: { projectId: string }) {
  const [state, action] = useActionState<FormState, FormData>(uploadAttachmentAction.bind(null, projectId), {});
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state]);
  return (
    <form ref={ref} action={action} className="space-y-2">
      <Input name="file" type="file" accept="image/*,application/pdf" aria-label="Attachment" className="h-auto py-1.5" required />
      {state.error && <p className="text-xs text-red-600">{state.error}</p>}
      <SubmitButton size="sm" variant="outline" pendingText="Uploading…">
        Upload
      </SubmitButton>
    </form>
  );
}
