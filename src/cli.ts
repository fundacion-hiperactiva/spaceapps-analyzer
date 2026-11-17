#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";
import { Command, Option } from "commander";
import { z } from "zod";
import { auditEvent, TOOL_VERSION } from "./auditor.js";
import { renderHtml } from "./html.js";
import type { Locale } from "./i18n.js";
import { renderPdf } from "./pdf.js";
import { renderMarkdown } from "./report.js";
import type { AuditOptions, EventAudit } from "./types.js";
import { validatePublicHttpUrl, writeUtf8 } from "./utils.js";

const program = new Command();

program
  .name("spaceapps-analyzer")
  .description("Capture and audit a NASA Space Apps Challenge local event")
  .version(TOOL_VERSION);

program
  .command("audit")
  .description("Crawl a local event, capture evidence, verify public links, and write an audit")
  .argument("<local-event-url>", "NASA Space Apps local-event URL")
  .option("-o, --output <directory>", "artifact directory", "audit-output")
  .option("-c, --concurrency <number>", "parallel team pages", parsePositiveInteger, 3)
  .option("--timeout <milliseconds>", "navigation timeout", parsePositiveInteger, 30_000)
  .option("--max-teams <number>", "limit teams (useful for a smoke run)", parsePositiveInteger)
  .option("--roster-url <url>", "public organizer roster with completion/withdrawal statuses")
  .option("--supplemental-source <url>", "additional public organizer source (repeatable)", collectValue, [])
  .option("--no-external-checks", "skip public-access checks for project links")
  .option("--no-content-extraction", "skip public repository and video transcript extraction")
  .option("--no-pdf", "skip PDF rendering")
  .option("--headed", "show the Chromium browser", false)
  .addOption(new Option("--fail-on <level>", "exit non-zero at this result level").choices(["never", "fail", "warn"]).default("never"))
  .action(async (localEventUrl: string, flags: Record<string, unknown>) => {
    const outputDir = path.resolve(String(flags.output));
    const options: AuditOptions = {
      outputDir,
      timeoutMs: Number(flags.timeout),
      concurrency: Number(flags.concurrency),
      checkExternalLinks: flags.externalChecks !== false,
      extractContent: flags.contentExtraction !== false,
      headed: flags.headed === true,
    };
    if (flags.maxTeams !== undefined) options.maxTeams = Number(flags.maxTeams);
    if (flags.rosterUrl !== undefined) options.rosterUrl = String(flags.rosterUrl);
    if (Array.isArray(flags.supplementalSource) && flags.supplementalSource.length) options.supplementalSources = flags.supplementalSource.map(String);
    process.stderr.write(`Auditing ${localEventUrl}\nEvidence: ${outputDir}\n`);
    const audit = await auditEvent(localEventUrl, options);
    const includePdf = flags.pdf !== false;
    await writeOutputs(audit, outputDir, includePdf);
    printSummary(audit, outputDir, includePdf);
    process.exitCode = exitCode(audit, String(flags.failOn));
  });

program
  .command("report")
  .description("Regenerate Markdown, single-page HTML, and PDF reports from audit.json")
  .argument("<audit-json>", "path to audit.json")
  .option("-o, --output <directory>", "report destination directory")
  .option("--no-pdf", "skip PDF rendering")
  .action(async (auditJson: string, flags: { output?: string; pdf?: boolean }) => {
    const inputPath = path.resolve(auditJson);
    const audit = JSON.parse(await readFile(inputPath, "utf8")) as EventAudit;
    const outputDir = path.resolve(flags.output ?? path.dirname(inputPath));
    const includePdf = flags.pdf !== false;
    await writeOutputs(audit, outputDir, includePdf, false);
    process.stdout.write(["report.en.html", "report.es.html", ...(includePdf ? ["report.en.pdf", "report.es.pdf"] : [])].map((name) => path.join(outputDir, name)).join("\n") + "\n");
  });

program
  .command("validate-url")
  .description("Validate a local-event URL without opening a browser")
  .argument("<url>")
  .action((value: string) => {
    const url = validatePublicHttpUrl(value);
    const schema = z.string().regex(/\/\d{4}\/local-events\/[^/]+\/?$/i);
    schema.parse(url.pathname);
    process.stdout.write(`${url.href}\n`);
  });

program.parseAsync().catch((cause: unknown) => {
  const message = cause instanceof Error ? cause.message : String(cause);
  process.stderr.write(`spaceapps-analyzer: ${message}\n`);
  process.exitCode = 1;
});

async function writeOutputs(audit: EventAudit, outputDir: string, includePdf: boolean, includeJson = true): Promise<void> {
  const locales: Locale[] = ["en", "es"];
  await Promise.all([
    includeJson ? writeUtf8(path.join(outputDir, "audit.json"), `${JSON.stringify(audit, null, 2)}\n`) : Promise.resolve(),
    ...locales.flatMap((locale) => [
      writeUtf8(path.join(outputDir, `report.${locale}.md`), renderMarkdown(audit, locale)),
      writeUtf8(path.join(outputDir, `report.${locale}.html`), renderHtml(audit, locale)),
    ]),
  ]);
  if (includePdf) {
    for (const locale of locales) await renderPdf(path.join(outputDir, `report.${locale}.html`), path.join(outputDir, `report.${locale}.pdf`), locale);
  }
}

function printSummary(audit: EventAudit, outputDir: string, includePdf: boolean): void {
  process.stdout.write([
    `Event: ${audit.event.name}`,
    `Registered: ${audit.roster?.registered ?? audit.summary.totalTeams} | Audited: ${audit.summary.totalTeams}`,
    `Pass: ${audit.summary.pass} | Warn: ${audit.summary.warn} | Fail: ${audit.summary.fail}`,
    `English: ${path.join(outputDir, "report.en.html")}${includePdf ? ` | ${path.join(outputDir, "report.en.pdf")}` : ""}`,
    `Español: ${path.join(outputDir, "report.es.html")}${includePdf ? ` | ${path.join(outputDir, "report.es.pdf")}` : ""}`,
    `JSON: ${path.join(outputDir, "audit.json")}`,
    "",
  ].join("\n"));
}

function parsePositiveInteger(value: string): number {
  const number = Number.parseInt(value, 10);
  if (!Number.isInteger(number) || number <= 0) throw new Error(`Expected a positive integer, received: ${value}`);
  return number;
}

function collectValue(value: string, previous: string[]): string[] { return [...previous, value]; }

function exitCode(audit: EventAudit, failOn: string): number {
  if (failOn === "never") return 0;
  if (failOn === "warn") return audit.summary.warn + audit.summary.fail + audit.summary.unknown > 0 ? 2 : 0;
  return audit.summary.fail > 0 ? 2 : 0;
}
