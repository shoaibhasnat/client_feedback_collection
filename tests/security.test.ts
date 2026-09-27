import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { safeRelativePath } from "@/lib/utils";

function findPages(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...findPages(full));
    else if (entry.name === "page.tsx") out.push(full);
  }
  return out;
}

describe("safeRelativePath (open-redirect guard)", () => {
  const bs = String.fromCharCode(92); // backslash
  const tab = String.fromCharCode(9);
  const nl = String.fromCharCode(10);

  it("allows genuine same-site paths", () => {
    for (const p of ["/admin", "/superadmin", "/admin/clients?x=1", "/a/b/c#h"]) {
      expect(safeRelativePath(p)).toBe(p);
    }
  });

  it("rejects protocol-relative and backslash tricks that resolve to another host", () => {
    const attacks = [
      "//evil.test",
      "/" + bs + "evil.test",
      "/" + bs + bs + "evil.test",
      bs + bs + "evil.test",
      "https://evil.test",
      "http:/evil.test",
      "/" + tab + "/evil.test",
      "/x" + nl + "//evil.test",
      "",
      "/",
      "admin",
      null,
      undefined,
    ];
    for (const a of attacks) {
      const out = safeRelativePath(a as string | null | undefined);
      // Either rejected outright, or (when non-null) still resolves to our own origin.
      if (out !== null) {
        expect(new URL(out, "http://localhost:3000").origin).toBe("http://localhost:3000");
      }
    }
  });

  it("never yields an off-site absolute URL for any rejected value", () => {
    for (const a of ["//evil.test", "/" + bs + "evil.test", "/" + bs + bs + "e"]) {
      expect(safeRelativePath(a)).toBeNull();
    }
  });
});

describe("super admin pages self-guard (defense in depth)", () => {
  // Every /superadmin page fetches with the service-role key, so each one must call
  // requireSuperAdmin() itself — a layout check alone leaks the RSC payload to owners.
  const dir = path.resolve(__dirname, "../src/app/superadmin");
  const pages = findPages(dir);

  it("finds the super admin pages", () => {
    expect(pages.length).toBeGreaterThanOrEqual(6);
  });

  it.each(pages.map((p) => [path.relative(dir, p), p] as const))("%s calls requireSuperAdmin()", (_name, file) => {
    expect(readFileSync(file, "utf8")).toContain("requireSuperAdmin()");
  });
});
