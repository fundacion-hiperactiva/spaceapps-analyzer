import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";
import type { Locale } from "./i18n.js";

export async function renderPdf(htmlPath: string, pdfPath: string, locale: Locale): Promise<void> {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await page.goto(pathToFileURL(path.resolve(htmlPath)).href, { waitUntil: "networkidle" });
    await page.emulateMedia({ media: "print" });
    await page.pdf({
      path: path.resolve(pdfPath), format: "A4", printBackground: true, displayHeaderFooter: true, preferCSSPageSize: true,
      margin: { top: "18mm", right: "13mm", bottom: "19mm", left: "13mm" },
      headerTemplate: `<div style="box-sizing:border-box;width:100%;padding:0 13mm;font:8px -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#666;display:flex;justify-content:space-between"><span>SPACEAPPS-ANALYZER</span><span>${locale === "es" ? "Auditoría basada en evidencia" : "Evidence-first audit"}</span></div>`,
      footerTemplate: `<div style="box-sizing:border-box;width:100%;padding:0 13mm;font:8px -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#666;display:flex;justify-content:space-between"><span>${locale === "es" ? "Informe generado" : "Generated report"}</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`,
    });
  } finally { await browser.close(); }
}
