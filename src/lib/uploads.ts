import "server-only";
import sharp from "sharp";
import type { SupabaseClient } from "@supabase/supabase-js";
import { randomToken } from "@/lib/crypto";

export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const BUCKET = "uploads";

export class UploadError extends Error {}

/**
 * Validate and re-encode an uploaded image on the server. Re-encoding drops all metadata,
 * including EXIF GPS location (brief section 8). `square` center-crops for headshots.
 */
export async function processImage(file: File, opts: { square?: boolean; maxSize?: number } = {}): Promise<Buffer> {
  if (!IMAGE_TYPES.includes(file.type)) throw new UploadError("Upload a JPG, PNG, WebP or GIF image.");
  if (file.size > MAX_IMAGE_BYTES) throw new UploadError("Images must be 8 MB or smaller.");

  const input = Buffer.from(await file.arrayBuffer());
  // limitInputPixels guards against decompression bombs (tiny files that decode to huge images).
  const meta = await sharp(input, { limitInputPixels: 50_000_000 }).metadata().catch(() => null);
  if (!meta?.format || !["jpeg", "png", "webp", "gif"].includes(meta.format)) {
    throw new UploadError("That file isn't a valid image.");
  }

  if ((meta.width ?? 0) * (meta.height ?? 0) > 50_000_000) {
    throw new UploadError("That image is too large (over 50 megapixels).");
  }

  const size = opts.maxSize ?? 800;
  const pipeline = sharp(input, { animated: false, limitInputPixels: 50_000_000 }).rotate();
  if (opts.square) pipeline.resize(size, size, { fit: "cover", position: "attention" });
  else pipeline.resize(size * 2, size * 2, { fit: "inside", withoutEnlargement: true });
  try {
    return await pipeline.webp({ quality: 82 }).toBuffer();
  } catch {
    throw new UploadError("That image couldn't be processed. Try a different file.");
  }
}

/** Store a processed image under {workspaceId}/{folder}/… and return its storage path. */
export async function storeImage(
  client: SupabaseClient,
  workspaceId: string,
  folder: string,
  file: File,
  opts: { square?: boolean; maxSize?: number } = {},
): Promise<string> {
  const data = await processImage(file, opts);
  const path = `${workspaceId}/${folder}/${randomToken(9)}.webp`;
  const { error } = await client.storage.from(BUCKET).upload(path, data, { contentType: "image/webp", upsert: false });
  if (error) throw new UploadError(`Upload failed: ${error.message}`);
  return path;
}

/** Short-lived signed URLs for private objects. Non-storage values (e.g. https URLs) pass through. */
export async function signPaths(client: SupabaseClient, paths: (string | null | undefined)[], expiresIn = 3600) {
  const storagePaths = [...new Set(paths.filter((p): p is string => !!p && !/^https?:\/\//.test(p)))];
  const map = new Map<string, string>();
  if (storagePaths.length) {
    const { data } = await client.storage.from(BUCKET).createSignedUrls(storagePaths, expiresIn);
    for (const item of data ?? []) if (item.path && item.signedUrl) map.set(item.path, item.signedUrl);
  }
  return (p: string | null | undefined) => (p ? (/^https?:\/\//.test(p) ? p : (map.get(p) ?? null)) : null);
}

export async function removeFolder(client: SupabaseClient, prefix: string) {
  const { data } = await client.storage.from(BUCKET).list(prefix, { limit: 1000 });
  const files = (data ?? []).filter((f) => f.id).map((f) => `${prefix}/${f.name}`);
  if (files.length) await client.storage.from(BUCKET).remove(files);
}
