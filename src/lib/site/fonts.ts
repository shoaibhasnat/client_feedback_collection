import {
  DM_Sans,
  Fraunces,
  Inter,
  Libre_Baskerville,
  Lora,
  Manrope,
  Merriweather,
  Montserrat,
  Nunito,
  Playfair_Display,
  Poppins,
  Source_Sans_3,
  Space_Grotesk,
  Work_Sans,
} from "next/font/google";
import type { FontName } from "@/lib/site/config";

// The curated fonts, self-hosted at build time by next/font: no render-blocking request to Google,
// no third-party call per visit, and a browser only downloads the families a site actually uses
// (preload is off because each site uses at most two of these).
// next/font reads these options at build time, so each call must use literal values.
const inter = Inter({ subsets: ["latin"], display: "swap", preload: false });
const dmSans = DM_Sans({ subsets: ["latin"], display: "swap", preload: false });
const manrope = Manrope({ subsets: ["latin"], display: "swap", preload: false });
const workSans = Work_Sans({ subsets: ["latin"], display: "swap", preload: false });
const poppins = Poppins({ subsets: ["latin"], display: "swap", preload: false, weight: ["400", "500", "600", "700"] });
const montserrat = Montserrat({ subsets: ["latin"], display: "swap", preload: false });
const nunito = Nunito({ subsets: ["latin"], display: "swap", preload: false });
const sourceSans = Source_Sans_3({ subsets: ["latin"], display: "swap", preload: false });
const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], display: "swap", preload: false });
const playfair = Playfair_Display({ subsets: ["latin"], display: "swap", preload: false });
const fraunces = Fraunces({ subsets: ["latin"], display: "swap", preload: false });
const lora = Lora({ subsets: ["latin"], display: "swap", preload: false });
const merriweather = Merriweather({ subsets: ["latin"], display: "swap", preload: false, weight: ["400", "700"] });
const baskerville = Libre_Baskerville({ subsets: ["latin"], display: "swap", preload: false, weight: ["400", "700"] });

const STACKS: Record<FontName, string> = {
  Inter: inter.style.fontFamily,
  "DM Sans": dmSans.style.fontFamily,
  Manrope: manrope.style.fontFamily,
  "Work Sans": workSans.style.fontFamily,
  Poppins: poppins.style.fontFamily,
  Montserrat: montserrat.style.fontFamily,
  Nunito: nunito.style.fontFamily,
  "Source Sans 3": sourceSans.style.fontFamily,
  "Space Grotesk": spaceGrotesk.style.fontFamily,
  "Playfair Display": playfair.style.fontFamily,
  Fraunces: fraunces.style.fontFamily,
  Lora: lora.style.fontFamily,
  Merriweather: merriweather.style.fontFamily,
  "Libre Baskerville": baskerville.style.fontFamily,
};

/** CSS font-family stack (self-hosted face + metric-matched fallback) for a curated font. */
export function fontStack(name: FontName): string {
  return STACKS[name] ?? STACKS.Inter;
}
