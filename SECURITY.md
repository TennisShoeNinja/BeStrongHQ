# Security Policy

## Reporting a Vulnerability

If you discover a security issue in BeStrongHQ, **please do not open a public
issue.** Instead, report it privately through GitHub:

1. Go to the [Security tab](https://github.com/TennisShoeNinja/BeStrongHQ/security)
2. Click **"Report a vulnerability"**

This opens a private advisory only the maintainer can see. You'll get an
acknowledgement within a few business days.

## Supported Versions

Only the `main` branch receives security fixes. Production deployments should
track `main`.

## Scope

In scope:
- The web application code under `web/`
- The Python backend under `bestrong/`
- Authentication, OAuth, file upload, and CSV import paths
- Dependencies pulled in by `package.json` and `pyproject.toml`

Out of scope:
- Third-party services we integrate with (Google OAuth, Drive, Calendar) —
  please report those to the respective vendors
- Findings against your own self-hosted deployment that depend on
  misconfiguration outside the project's defaults
