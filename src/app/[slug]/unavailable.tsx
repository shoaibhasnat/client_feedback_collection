/** Neutral message for suspended workspaces (brief §10.5). Reveals nothing about the workspace. */
export function SiteUnavailable() {
  return (
    <main className="flex flex-1 items-center justify-center bg-white px-4 py-24">
      <div className="max-w-sm text-center">
        <h1 className="text-xl font-semibold text-slate-900">Temporarily unavailable</h1>
        <p className="mt-2 text-slate-600">This page is temporarily unavailable. Please check back later.</p>
      </div>
    </main>
  );
}
