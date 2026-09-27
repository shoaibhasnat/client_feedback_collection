"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { Check, Copy } from "lucide-react";
import { Button, buttonClass } from "@/components/ui";
import { cn } from "@/lib/utils";

export function SubmitButton({
  children,
  pendingText = "Saving…",
  variant,
  size,
  className,
}: {
  children: React.ReactNode;
  pendingText?: string;
  variant?: "primary" | "secondary" | "ghost" | "danger" | "outline";
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} variant={variant} size={size} className={className}>
      {pending ? pendingText : children}
    </Button>
  );
}

export function CopyButton({
  text,
  label = "Copy",
  className,
  variant = "outline",
  size = "sm",
}: {
  text: string;
  label?: string;
  className?: string;
  variant?: "primary" | "secondary" | "ghost" | "outline";
  size?: "sm" | "md";
}) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={cn(buttonClass(variant, size), className)}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
        } catch {
          const el = document.createElement("textarea");
          el.value = text;
          document.body.appendChild(el);
          el.select();
          document.execCommand("copy");
          el.remove();
        }
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      }}
    >
      {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
      <span aria-live="polite">{copied ? "Copied" : label}</span>
    </button>
  );
}

/** Submit button that asks for confirmation first (for destructive actions). */
export function ConfirmSubmit({
  children,
  message,
  variant = "danger",
  size = "sm",
}: {
  children: React.ReactNode;
  message: string;
  variant?: "primary" | "secondary" | "ghost" | "danger" | "outline";
  size?: "sm" | "md";
}) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant={variant}
      size={size}
      disabled={pending}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </Button>
  );
}
