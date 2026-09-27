"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, RotateCcw, Trash2, Upload, Video } from "lucide-react";
import { cn } from "@/lib/utils";

// In-browser video recording and upload (brief §3.4). The parent (FormFlow) owns the upload so it can
// continue in the background while the client moves on to the next steps.

export type VideoUploadState = { status: "idle" | "uploading" | "done" | "error"; progress: number; error?: string };

type Phase = "choose" | "camera" | "countdown" | "recording" | "review";

const btn =
  "inline-flex h-11 items-center justify-center gap-2 rounded-xl px-4 font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--tc-primary)] disabled:opacity-60";
const primary = cn(btn, "bg-[var(--tc-primary)] text-white hover:opacity-90");
const secondary = cn(btn, "border border-[var(--tc-border)] hover:bg-[var(--tc-surface)]");

/** Best recording format this browser supports; MP4 first so the file plays everywhere (incl. iOS). */
function pickMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "";
  const candidates = ["video/mp4;codecs=avc1,mp4a", "video/mp4", "video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];
  return candidates.find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
}

/** Grab one frame as a JPEG for the thumbnail (seeks slightly in to avoid a black first frame). */
export function captureThumbnail(url: string, knownDuration: number | null): Promise<Blob | null> {
  return new Promise((resolve) => {
    const v = document.createElement("video");
    v.muted = true;
    v.playsInline = true;
    v.preload = "auto";
    v.src = url;
    const done = (b: Blob | null) => {
      v.removeAttribute("src");
      v.load();
      resolve(b);
    };
    const timer = setTimeout(() => done(null), 8000);
    v.onloadeddata = () => {
      const d = Number.isFinite(v.duration) && v.duration > 0 ? v.duration : (knownDuration ?? 1);
      v.currentTime = Math.min(1, d / 3);
    };
    v.onseeked = () => {
      clearTimeout(timer);
      const scale = Math.min(1, 640 / (v.videoWidth || 640));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round((v.videoWidth || 640) * scale);
      canvas.height = Math.round((v.videoHeight || 360) * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) return done(null);
      ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((b) => done(b), "image/jpeg", 0.8);
    };
    v.onerror = () => {
      clearTimeout(timer);
      done(null);
    };
  });
}

/** Duration from file metadata; null when the container doesn't say (common for WebM). */
function readDuration(url: string): Promise<number | null> {
  return new Promise((resolve) => {
    const v = document.createElement("video");
    v.preload = "metadata";
    v.src = url;
    const timer = setTimeout(() => resolve(null), 6000);
    v.onloadedmetadata = () => {
      clearTimeout(timer);
      resolve(Number.isFinite(v.duration) ? v.duration : null);
    };
    v.onerror = () => {
      clearTimeout(timer);
      resolve(null);
    };
  });
}

export function VideoStep({
  headingRef,
  title,
  prompts,
  maxSeconds,
  maxMb,
  required,
  preview,
  current,
  upload,
  onVideo,
  onRemove,
  error,
}: {
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  title: string;
  prompts: string[];
  maxSeconds: number;
  maxMb: number;
  required: boolean;
  preview?: boolean;
  current: { url: string | null; hasVideo: boolean };
  upload: VideoUploadState;
  onVideo: (blob: Blob, type: string, duration: number | null, thumbnail: Blob | null) => void;
  onRemove: () => void;
  error?: string;
}) {
  const [phase, setPhase] = useState<Phase>("choose");
  const [countdown, setCountdown] = useState(3);
  const [elapsed, setElapsed] = useState(0);
  const [problem, setProblem] = useState<string | null>(null);
  const [recorded, setRecorded] = useState<{ blob: Blob; url: string; type: string; duration: number } | null>(null);
  const liveRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (timerRef.current) clearInterval(timerRef.current);
  };
  // Always release the camera when the step unmounts.
  useEffect(() => stopCamera, []);
  useEffect(() => () => {
    if (recorded) URL.revokeObjectURL(recorded.url);
  }, [recorded]);

  const openCamera = async () => {
    setProblem(null);
    if (!navigator.mediaDevices?.getUserMedia || !pickMimeType()) {
      setProblem("This browser can't record video. You can upload a video file instead.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: true,
      });
      streamRef.current = stream;
      setPhase("camera");
      requestAnimationFrame(() => {
        if (liveRef.current) {
          liveRef.current.srcObject = stream;
          void liveRef.current.play().catch(() => {});
        }
      });
    } catch (e) {
      const name = (e as DOMException)?.name;
      setProblem(
        name === "NotAllowedError"
          ? "Camera access was blocked. Allow it in your browser settings, or upload a video instead."
          : "We couldn't open your camera. You can upload a video instead.",
      );
    }
  };

  const startRecording = () => {
    const stream = streamRef.current;
    if (!stream) return;
    setPhase("countdown");
    setCountdown(3);
    let n = 3;
    const tick = setInterval(() => {
      n -= 1;
      setCountdown(n);
      if (n <= 0) {
        clearInterval(tick);
        begin(stream);
      }
    }, 1000);
  };

  const begin = (stream: MediaStream) => {
    const mimeType = pickMimeType();
    // ~2 Mbps keeps a 90-second 720p clip around 25 MB (brief §10.7).
    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 2_000_000, audioBitsPerSecond: 96_000 });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data);
    };
    const started = Date.now();
    recorder.onstop = () => {
      const type = (recorder.mimeType || mimeType).split(";")[0];
      const blob = new Blob(chunks, { type });
      const duration = Math.round((Date.now() - started) / 1000);
      stopCamera();
      setRecorded({ blob, url: URL.createObjectURL(blob), type, duration });
      setPhase("review");
    };
    recorderRef.current = recorder;
    recorder.start(1000);
    setElapsed(0);
    setPhase("recording");
    timerRef.current = setInterval(() => {
      const secs = Math.floor((Date.now() - started) / 1000);
      setElapsed(secs);
      if (secs >= maxSeconds && recorder.state === "recording") recorder.stop();
    }, 250);
  };

  const stopRecording = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  };

  const useRecording = async () => {
    if (!recorded) return;
    const thumb = await captureThumbnail(recorded.url, recorded.duration);
    onVideo(recorded.blob, recorded.type, recorded.duration, thumb);
    setPhase("choose");
  };

  const chooseFile = async (file: File) => {
    setProblem(null);
    const type = file.type || (file.name.toLowerCase().endsWith(".mov") ? "video/quicktime" : "");
    if (!["video/mp4", "video/webm", "video/quicktime"].includes(type)) {
      setProblem("Choose an MP4, MOV or WebM video.");
      return;
    }
    if (file.size > maxMb * 1024 * 1024) {
      setProblem(`That video is larger than ${maxMb} MB.`);
      return;
    }
    const url = URL.createObjectURL(file);
    const duration = await readDuration(url);
    if (duration !== null && duration > maxSeconds + 2) {
      URL.revokeObjectURL(url);
      setProblem(`That video is ${Math.round(duration)} seconds; the limit is ${maxSeconds} seconds.`);
      return;
    }
    const thumb = await captureThumbnail(url, duration);
    URL.revokeObjectURL(url);
    onVideo(file, type, duration, thumb);
  };

  const remaining = Math.max(0, maxSeconds - elapsed);
  const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  return (
    <div>
      <h1 ref={headingRef} tabIndex={-1} className="text-2xl font-semibold leading-snug outline-none sm:text-3xl">
        {title}
        {!required && <span className="ml-2 align-middle text-base font-normal text-[var(--tc-muted)]">(optional)</span>}
      </h1>
      <p className="mt-2 text-sm text-[var(--tc-muted)]">Up to {maxSeconds} seconds. Just talk naturally — you can re-record as often as you like.</p>

      {preview ? (
        <div className="mt-6 flex aspect-video items-center justify-center rounded-xl border border-dashed border-[var(--tc-border)] bg-[var(--tc-surface)] text-sm text-[var(--tc-muted)]">
          <Video className="mr-2 size-5" aria-hidden /> Recording and upload are disabled in preview
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          {/* Uploaded / uploading video */}
          {phase === "choose" && (current.hasVideo || upload.status === "uploading") && (
            <div className="space-y-3 rounded-xl bg-[var(--tc-surface)] p-4">
              {upload.status === "uploading" ? (
                <div aria-live="polite">
                  <p className="text-sm font-medium">Uploading your video… {upload.progress}%</p>
                  <div className="mt-2 h-2 w-full rounded-full bg-[var(--tc-border)]" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={upload.progress} aria-label="Video upload">
                    <div className="h-full rounded-full bg-[var(--tc-primary)] transition-all" style={{ width: `${upload.progress}%` }} />
                  </div>
                  <p className="mt-2 text-xs text-[var(--tc-muted)]">You can carry on with the next questions while this finishes.</p>
                </div>
              ) : (
                <>
                  {current.url ? (
                    <video src={current.url} controls playsInline preload="metadata" className="aspect-video w-full rounded-lg bg-black" aria-label="Your video" />
                  ) : (
                    <p className="text-sm">Your video is saved.</p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className={secondary} onClick={openCamera}>
                      <RotateCcw className="size-4" aria-hidden /> Record a new one
                    </button>
                    <button type="button" className={secondary} onClick={onRemove}>
                      <Trash2 className="size-4" aria-hidden /> Remove
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {phase === "choose" && !current.hasVideo && upload.status !== "uploading" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <button type="button" className={cn(primary, "h-24 flex-col")} onClick={openCamera}>
                <Camera className="size-6" aria-hidden /> Record now
              </button>
              <button type="button" className={cn(secondary, "h-24 flex-col")} onClick={() => fileRef.current?.click()}>
                <Upload className="size-6" aria-hidden /> Upload a video
              </button>
            </div>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="video/mp4,video/webm,video/quicktime,.mov"
            className="sr-only"
            tabIndex={-1}
            aria-label="Upload a video"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void chooseFile(f);
            }}
          />

          {(phase === "camera" || phase === "countdown" || phase === "recording") && (
            <div className="space-y-3">
              <div className="relative overflow-hidden rounded-xl bg-black">
                <video ref={liveRef} autoPlay muted playsInline className="aspect-video w-full -scale-x-100 object-cover" aria-label="Camera preview" />
                {phase === "countdown" && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-7xl font-bold text-white" aria-live="assertive">
                    {countdown}
                  </div>
                )}
                {phase === "recording" && (
                  <div className="absolute left-3 top-3 flex items-center gap-2 rounded-full bg-black/60 px-3 py-1 text-sm font-medium text-white" aria-live="off">
                    <span className="size-2.5 animate-pulse rounded-full bg-red-500" aria-hidden /> {mmss(elapsed)} · {mmss(remaining)} left
                  </div>
                )}
              </div>
              {prompts.length > 0 && (
                <div className="rounded-xl bg-[var(--tc-surface)] p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--tc-muted)]">Some things you could mention</p>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                    {prompts.map((p) => (
                      <li key={p}>{p}</li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="flex gap-2">
                {phase === "camera" && (
                  <>
                    <button type="button" className={primary} onClick={startRecording}>
                      Start recording
                    </button>
                    <button
                      type="button"
                      className={secondary}
                      onClick={() => {
                        stopCamera();
                        setPhase("choose");
                      }}
                    >
                      Cancel
                    </button>
                  </>
                )}
                {phase === "recording" && (
                  <button type="button" className={cn(primary, "bg-red-600")} onClick={stopRecording}>
                    Stop
                  </button>
                )}
              </div>
            </div>
          )}

          {phase === "review" && recorded && (
            <div className="space-y-3">
              <video src={recorded.url} controls playsInline className="aspect-video w-full rounded-xl bg-black" aria-label="Your recording" />
              <p className="text-sm text-[var(--tc-muted)]">
                {mmss(recorded.duration)} · {(recorded.blob.size / 1024 / 1024).toFixed(1)} MB
              </p>
              <div className="flex flex-wrap gap-2">
                <button type="button" className={primary} onClick={useRecording}>
                  Use this video
                </button>
                <button
                  type="button"
                  className={secondary}
                  onClick={() => {
                    setRecorded(null);
                    void openCamera();
                  }}
                >
                  <RotateCcw className="size-4" aria-hidden /> Record again
                </button>
              </div>
            </div>
          )}

          {(problem || upload.status === "error" || error) && (
            <p role="alert" className={cn("text-sm font-medium text-red-700")}>
              {problem ?? upload.error ?? error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
