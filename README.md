# spaceapps-analyzer

Evidence-first CLI for auditing a public [NASA Space Apps Challenge](https://www.spaceappschallenge.org/) local event. It discovers the event's teams, captures every relevant NASA page as PNG/HTML/text, checks the documented project links from a fresh browser context, extracts text from public GitHub/GitLab repositories and YouTube captions, compares the combined evidence with the selected challenge, and produces JSON plus Markdown, single-page HTML, and PDF reports.

The tool never logs in, submits forms, bypasses access controls, executes participant code, or treats an automated similarity signal as a judging decision.

## Requirements

- Node.js 22+
- pnpm 10+
- Chromium for Playwright

## Install

```bash
pnpm install
pnpm exec playwright install chromium
pnpm build
pnpm link --global
```

For local development, `pnpm dev -- ...` avoids the global link.

## Audit Santa Rosa de Calamuchita

```bash
pnpm dev -- audit \
  https://www.spaceappschallenge.org/2026/local-events/santa-rosa-de-calamuchita/ \
  --output audit-output/santa-rosa-2026
```

A short smoke run:

```bash
pnpm dev -- audit \
  https://www.spaceappschallenge.org/2026/local-events/santa-rosa-de-calamuchita/ \
  --output audit-output/smoke \
  --max-teams 1 \
  --no-external-checks
```

Useful options:

```text
--concurrency <n>       Team pages processed in parallel (default: 3)
--timeout <ms>          Navigation timeout (default: 30000)
--max-teams <n>         Limit discovered teams
--roster-url <url>      Public organizer roster with completion/withdrawal statuses
--supplemental-source   Additional public organizer source (repeatable)
--no-external-checks    Skip public project-link checks
--no-content-extraction Skip repository and video-caption extraction
--no-pdf                Skip PDF rendering
--headed                Show Chromium while crawling
--fail-on fail|warn     CI exit policy (default: never)
```

The URL must follow the public local-event shape:

```text
https://www.spaceappschallenge.org/<year>/local-events/<event-slug>/
```

## Output

```text
audit-output/santa-rosa-2026/
├── audit.json                 # machine-readable complete result
├── report.en.{md,html,pdf}    # English reports
├── report.es.{md,html,pdf}    # informes en español
├── event/                     # event page and each event tab
│   ├── details.{png,html,txt}
│   └── teams.{png,html,txt}
└── teams/
    └── <team-slug>/
        ├── about.{png,html,txt}
        ├── project.{png,html,txt}
        ├── members.{png,html,txt}
        ├── challenge.{png,html,txt}
        ├── content/           # repository text/manifest and video transcript
        └── external/          # fresh-context accessibility evidence
```

Paths stored in `audit.json` are relative to the output directory, so the artifact tree can be archived or published as a unit.

## What is checked

For each team:

1. A submitted project section exists.
2. Summary and project details contain substantive content.
3. Demonstration and project/prototype links are documented.
4. NASA data/references are documented.
5. External evidence loads publicly in a clean context without an obvious login or access-approval wall.
6. The selected challenge can be resolved.
7. Public repository source and documentation are collected as text without executing code.
8. Public YouTube captions are collected when the provider exposes them.
9. The NASA form, repository, and transcript evidence cover concepts from the public challenge brief.

Results use four states:

- `pass`: objective check succeeded.
- `warn`: partial or ambiguous evidence; manual review recommended.
- `fail`: an objective requirement is absent or inaccessible.
- `unknown`: not enough public evidence was available.

Challenge coverage is intentionally deterministic and auditable. It combines normalized concept coverage with vector similarity over text fragments, and records which sources contributed. It cannot determine scientific quality, novelty, correctness, ethics, or whether a working prototype truly solves the challenge. Missing video captions are reported as `unknown`, not as a project failure.

When `--roster-url` is supplied, the report reconciles the official NASA team list with the organizer's public status roster. Teams marked as withdrawn or as not presenting remain visible in the roster section but are excluded from compliance scoring.

## Regenerate a report

```bash
pnpm dev -- report audit-output/santa-rosa-2026/audit.json
```

## Development

```bash
pnpm check
```

## CI

Both GitHub Actions and GitLab CI run type checking, unit tests, and a production build. Live crawling is not part of the default CI pipeline because third-party network availability should not make code validation flaky.

## Responsible use

Only crawl public event URLs you are authorized to review. Respect the target site's terms, rate limits, and participant privacy. Reports should be treated as audit evidence requiring human review, not as automatic disqualification decisions.
