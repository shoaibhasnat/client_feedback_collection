/**
 * Largest video the storage plan accepts, in MB. Supabase's free plan caps every upload at 50 MB;
 * on a paid plan set NEXT_PUBLIC_VIDEO_MAX_MB=100 (the brief's default) and raise the bucket limit.
 */
export const VIDEO_STORAGE_MAX_MB = Math.min(Math.max(Number(process.env.NEXT_PUBLIC_VIDEO_MAX_MB) || 50, 5), 100);

/**
 * Recording bitrate that keeps a full-length recording under the size limit (with 15% headroom),
 * capped at ~2 Mbps (a 90-second 720p clip ≈ 22 MB) and never below 400 kbps.
 */
export function recordingBitrate(maxMb: number, maxSeconds: number, audioBps = 96_000): number {
  const budget = (maxMb * 1024 * 1024 * 8 * 0.85) / Math.max(maxSeconds, 1) - audioBps;
  return Math.round(Math.min(2_000_000, Math.max(400_000, budget)));
}
