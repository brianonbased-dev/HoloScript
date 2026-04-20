# Security Policy

## Supported Versions

We release patches for security vulnerabilities for the following versions:

| Version | Supported          |
| ------- | ------------------ |
| 3.x.x   | :white_check_mark: |
| 2.x.x   | :x: (EOL)          |
| < 2.0   | :x:                |

## Reporting a Vulnerability

If you discover a security vulnerability within HoloScript, please use one of the following methods:

### GitHub Security Advisories (Recommended)

Use GitHub's private vulnerability reporting feature:

1. Go to the [Security tab](https://github.com/brianonbased-dev/HoloScript/security)
2. Click "Report a vulnerability"
3. Fill out the security advisory form

### Email

For sensitive security issues, you may email: **security@holoscript.net**

### What to Include

Please include the following information:

- Type of vulnerability
- Full paths of source file(s) related to the vulnerability
- Location of the affected source code (tag/branch/commit)
- Step-by-step instructions to reproduce the issue
- Proof-of-concept or exploit code (if possible)
- Impact of the vulnerability

## Response Timeline

- **Acknowledgment**: Within 48 hours
- **Initial Assessment**: Within 5 business days
- **Status Updates**: Every 7 days until resolved
- **Fix & Disclosure**: Coordinated disclosure after patch is ready

## Security Best Practices

When contributing to HoloScript:

- Keep dependencies up to date
- Follow TypeScript strict mode guidelines
- Validate all external inputs
- Use parameterized queries for database operations
- Implement proper authentication and authorization checks

## Operational review checklists

- [Sandbox, secrets, and untrusted input](./sandbox-keys-input-validation-review.md) — periodic pass for guest isolation, logging hygiene, and input boundaries (Paper #4 / SEC-01 alignment).

Thank you for helping keep HoloScript and its users safe!
