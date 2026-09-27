import Script from "next/script";
import { validAnalytics, type SeoConfig } from "@/lib/site/config";

/**
 * Analytics from a fixed allowlist of providers. Owners supply only an identifier that must match the
 * provider's format — never raw HTML/JS — because every workspace shares one origin (brief §6, §10.6).
 */
export function SiteAnalytics({ seo }: { seo: SeoConfig }) {
  const a = validAnalytics(seo.analytics);
  if (!a) return null;
  if (a.provider === "plausible") {
    return <Script src="https://plausible.io/js/script.js" data-domain={a.id} strategy="afterInteractive" />;
  }
  const id = JSON.stringify(a.id); // matches /^G-[A-Z0-9]+$/, so safe to embed
  return (
    <>
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${a.id}`} strategy="afterInteractive" />
      <Script id="ga-init" strategy="afterInteractive">
        {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config',${id});`}
      </Script>
    </>
  );
}
