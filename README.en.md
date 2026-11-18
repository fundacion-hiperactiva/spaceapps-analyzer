# spaceapps-analyzer — English guide

`spaceapps-analyzer` is an evidence-first CLI for auditing a public [NASA Space Apps Challenge](https://www.spaceappschallenge.org/) local event.

It discovers teams, captures relevant pages as PNG/HTML/text, checks project links in a fresh browser context, reads public GitHub/GitLab repositories and YouTube captions, compares the combined evidence with the selected challenge, and generates separate English and Spanish reports.

The tool never logs in, submits forms, bypasses access controls, or executes participant code. Automated findings support human review; they are not automatic judging or disqualification decisions.

## Requirements

- Node.js 22 or newer
- pnpm 10 or newer
- Chromium for Playwright
- Optional: [`yt-dlp`](https://github.com/yt-dlp/yt-dlp) as a second attempt at extracting public YouTube subtitle tracks

## Installation

```bash
git clone https://gitlab.com/fundacion-hiperactiva/spaceapps-analyzer.git
cd spaceapps-analyzer
pnpm install
pnpm exec playwright install chromium
pnpm build
```

For development, run the CLI through `pnpm dev --`. To install the current checkout globally:

```bash
pnpm link --global
spaceapps-analyzer --help
```

If `yt-dlp` is not on `PATH`, point to it explicitly:

```bash
export SPACEAPPS_YT_DLP=/absolute/path/to/yt-dlp
```

The analyzer downloads subtitle tracks only. It does not retain complete participant videos.

## Basic Cordoba audit

The local-event URL must use this public shape:

```text
https://www.spaceappschallenge.org/<year>/local-events/<event-slug>/
```

```bash
pnpm dev -- audit \
  'https://www.spaceappschallenge.org/2026/local-events/cordoba/?tab=teams' \
  --output audit-output/cordoba-2026
```

A short smoke run:

```bash
pnpm dev -- audit \
  'https://www.spaceappschallenge.org/2026/local-events/cordoba/?tab=teams' \
  --output audit-output/smoke \
  --max-teams 1 \
  --no-pdf
```

## Adding organizer context

Two options add public organizer context:

- `--roster-url <url>` captures and parses a supported public roster. It reconciles registered, completed, withdrawn, and no-show teams. Only completed teams are scored when the roster provides those statuses.
- `--supplemental-source <url>` records an additional public source in the audit and reports. It is repeatable. Recording the URL does **not** mean the CLI automatically interpreted or validated every statement in that document.

Full Cordoba example:

```bash
pnpm dev -- audit \
  'https://www.spaceappschallenge.org/2026/local-events/cordoba/?tab=teams' \
  --roster-url 'https://spaceappscordoba.hiperactiva.org/es/equipos' \
  --supplemental-source 'https://docs.google.com/document/d/10GJDajTPH1PiBhyIrK784eJwPcbD7VqcopMhYLjjOsY/edit?usp=sharing' \
  --output audit-output/cordoba-2026
```

Those organizer sources were public when the Cordoba audit was prepared. Public availability can change. Do not pass private documents, credentials, session URLs, or sources you are not authorized to review.

## Using it from Codex

Codex can run the CLI, inspect its evidence, and use additional public URLs as review context. A useful request is:

```text
Run spaceapps-analyzer for this local event:
https://www.spaceappschallenge.org/2026/local-events/cordoba/?tab=teams

Use this public organizer roster to identify completed and withdrawn teams:
https://spaceappscordoba.hiperactiva.org/es/equipos

Preserve this public Google Doc as a supplemental source:
https://docs.google.com/document/d/10GJDajTPH1PiBhyIrK784eJwPcbD7VqcopMhYLjjOsY/edit?usp=sharing

Generate separate English and Spanish HTML and PDF reports. Review unknown,
rate-limited, and anti-bot results manually before treating them as findings.
```

When working with Codex:

1. State which URL is the NASA local event, the organizer roster, or supplemental context.
2. Confirm that every source is publicly accessible and in scope.
3. Ask Codex to distinguish captured CLI evidence from contextual information it reviewed separately.
4. Keep secrets, private Drive links, cookies, and access tokens out of prompts and tickets.
5. Review `warn` and `unknown` results manually, especially anti-bot pages, rate limits, and videos without public captions.

## Audit options

```text
--output <directory>      Artifact directory (default: audit-output)
--concurrency <n>         Team pages processed in parallel (default: 3)
--timeout <ms>            Navigation timeout (default: 30000)
--max-teams <n>           Limit discovered teams
--roster-url <url>        Public organizer roster with team statuses
--supplemental-source     Additional public source; repeatable
--no-external-checks      Skip public project-link checks
--no-content-extraction   Skip repository and video-caption extraction
--no-pdf                  Skip PDF rendering
--headed                  Show Chromium while crawling
--fail-on never|fail|warn CI exit policy (default: never)
```

Run `pnpm dev -- audit --help` for the authoritative current list.

## Output

```text
audit-output/<event>/
├── audit.json                 # complete machine-readable result
├── report.en.{md,html,pdf}    # English reports
├── report.es.{md,html,pdf}    # Spanish reports
├── event/                     # event and roster captures
└── teams/
    └── <team-slug>/
        ├── about.{png,html,txt}
        ├── project.{png,html,txt}
        ├── members.{png,html,txt}
        ├── challenge.{png,html,txt}
        ├── content/           # extracted repository text and captions
        └── external/          # clean-context accessibility evidence
```

Paths in `audit.json` are relative to the output directory, so the artifact tree can be archived as one unit. `audit-output/` is intentionally ignored by Git because captures may be large and are time-specific.

## What is checked

For each audited team, the CLI checks:

1. A project submission exists.
2. Summary and project details contain substantive content.
3. Demonstration and project/prototype links are documented.
4. NASA data or resources are documented.
5. External evidence loads publicly without an obvious login or access-approval wall.
6. The selected challenge can be resolved.
7. Public repository text can be collected without executing code.
8. Public YouTube captions can be collected when exposed by the provider.
9. Submission, repository, and transcript evidence cover concepts from the challenge brief.
10. Substantive project-page fields follow the official English-language submission requirement.

Statuses:

- `pass`: the automated check succeeded.
- `warn`: evidence is partial or ambiguous; manual review is recommended.
- `fail`: an objective requirement is absent or inaccessible.
- `unknown`: insufficient public evidence was available.

Challenge coverage combines normalized concepts and vector similarity. Language detection uses explainable English/Spanish markers. Neither mechanism can establish scientific quality, originality, factual correctness, ethics, or whether a prototype genuinely solves the challenge.

## Regenerating reports

Reports can be rebuilt from an existing audit without crawling again:

```bash
pnpm dev -- report audit-output/cordoba-2026/audit.json
```

## Reporting bugs and requesting features

Open a [GitLab issue](https://gitlab.com/fundacion-hiperactiva/spaceapps-analyzer/-/issues/new) before starting significant work.

For a bug, include:

- a concise title;
- the affected event/team URL;
- analyzer version or commit;
- expected and actual result;
- reproduction command;
- relevant status, reason, or evidence path;
- whether the result changes in a normal browser;
- screenshots or logs with secrets and private information removed.

For a feature request, include the problem, proposed behavior, example public URLs, expected report impact, and acceptance criteria. Never attach private participant material to a public ticket.

## GitFlow contribution workflow

Long-lived branches:

- `main`: public, release-ready code.
- `testing`: release candidate and integration validation.
- `develop`: active integration branch.

Work branches must start from an updated `develop`:

```bash
git switch develop
git pull --ff-only origin develop
git switch -c feature/<issue-id>-short-description
# or: git switch -c fix/<issue-id>-short-description
```

Before opening a merge request:

```bash
pnpm check
git diff --check
git push -u origin feature/<issue-id>-short-description
```

Open the merge request against `develop` and link the issue. Do not commit directly to `develop`, `testing`, or `main`.

Promotion path:

```text
feature/* or fix/* → develop → testing → main
```

- Merge focused feature/fix branches into `develop` after review and CI.
- Promote `develop` to `testing` for release-candidate validation, including representative live audits when appropriate.
- Promote `testing` to `main` only after validation succeeds.
- Use merge requests for every promotion so review and CI history remain visible.

## Development and CI

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm check
```

GitLab CI and GitHub Actions run type checking, unit tests, and a production build. Live crawling is excluded from default CI because third-party availability must not make code validation flaky.

## Responsible use

Only crawl public event URLs you are authorized to review. Respect terms, rate limits, and participant privacy. Preserve timestamps and evidence paths, and manually review ambiguous results before publication. Reports should never be used as automatic disqualification decisions.

## License

[MIT](LICENSE)
