# spaceapps-analyzer

Evidence-first CLI for auditing public NASA Space Apps Challenge local events. It captures pages and evidence, checks public project links, analyzes public repository and video-caption content, compares projects with their selected challenge, and generates separate English and Spanish reports in Markdown, single-page HTML, PDF, and JSON.

The automated result is an auditable signal, not a judging decision. The tool does not log in, bypass access controls, or execute participant code.

## Documentation

- [English documentation](README.en.md)
- [Documentación en español](README.es.md)

## Quick start

```bash
git clone https://github.com/hiperactiva-org/spaceapps-analyzer.git
cd spaceapps-analyzer
pnpm install
pnpm exec playwright install chromium
pnpm dev -- audit \
  'https://www.spaceappschallenge.org/2026/local-events/cordoba/?tab=teams' \
  --output audit-output/cordoba-2026
```

## Contributing

Report bugs and request features through [GitHub Issues](https://github.com/hiperactiva-org/spaceapps-analyzer/issues/new/choose). Development follows GitFlow: create `feature/*` or `fix/*` from `develop`, open a pull request into `develop`, validate through `testing`, and promote releases to `main`.

See the language-specific documentation for installation, Codex workflows, audit options, limitations, and contribution instructions.

## License

[MIT](LICENSE)
