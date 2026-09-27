# Security policy

## Reporting a vulnerability

**Please don't open a public issue for security problems.**

Report them privately through GitHub: **Security → Report a vulnerability** on this repository
([private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability)).
Include:

- what an attacker can do, and what they need first (e.g. "any workspace owner", "anyone with a request link")
- steps to reproduce, or a proof of concept
- the commit or version you tested

We aim to acknowledge reports within 3 working days, and to agree a fix and disclosure timeline with you.
Please give us a reasonable time to release a fix before disclosing publicly.

## Scope

In particular, we want to hear about:

- **Cross-workspace access:** reading, writing or inferring another workspace's data or files.
- **Consent bypass:** publishing more than a client agreed to.
- **Script or HTML injection** on public pages, widgets or the client form. These share an origin with the dashboard.
- **Token weaknesses:** request, invite or approval links.
- **Privilege escalation**, e.g. an owner becoming super admin.

Out of scope:
- issues that need a compromised super admin account or server environment
- rate-limit tuning
- missing hardening headers without a concrete exploit
- vulnerabilities in dependencies without a path to exploit them in this app (these still help as regular issues)

## Security model

The model is documented in [docs/architecture.md](docs/architecture.md) (sections 3, 5 and 7). A full
review and its fixes are in [docs/security-review-2026-09.md](docs/security-review-2026-09.md).

## Supported versions

Only the latest release on `main` receives security fixes.
