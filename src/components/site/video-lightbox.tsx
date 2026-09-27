"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Card thumbnail with a play button. The video itself only loads when opened, inside a native
 * modal <dialog> (focus is trapped and Escape closes it); closing unmounts the player.
 */
export function VideoLightbox({ video, thumb, label }: { video: string; thumb: string | null; label: string }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group relative block aspect-video w-full overflow-hidden rounded-[calc(var(--site-radius)*0.75)] bg-[var(--site-text)]/80"
        aria-label={`Play video: ${label}`}
      >
        {thumb && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumb} alt="" loading="lazy" decoding="async" className="absolute inset-0 size-full object-cover" />
        )}
        <span className="absolute inset-0 bg-black/15 transition-colors group-hover:bg-black/30" aria-hidden />
        <span
          className="absolute left-1/2 top-1/2 flex size-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white/95 shadow-lg transition-transform group-hover:scale-105"
          aria-hidden
        >
          <svg viewBox="0 0 24 24" className="ml-1 size-6 fill-[var(--site-primary)]">
            <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z" />
          </svg>
        </span>
      </button>
      <dialog
        ref={dialogRef}
        onClose={() => setOpen(false)}
        onClick={(e) => {
          if (e.target === dialogRef.current) setOpen(false);
        }}
        aria-label={label}
        className="m-auto w-[min(960px,calc(100vw-2rem))] overflow-visible bg-transparent p-0 backdrop:bg-black/80"
      >
        {open && (
          <div className="relative">
            <video src={video} poster={thumb ?? undefined} controls autoPlay playsInline className="max-h-[80vh] w-full rounded-lg bg-black" />
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="absolute -top-11 right-0 flex h-9 items-center rounded-full bg-white/90 px-4 text-sm font-medium text-slate-900"
            >
              Close
            </button>
          </div>
        )}
      </dialog>
    </>
  );
}
