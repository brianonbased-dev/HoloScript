# Security Policy

## Supported Versions

We actively support the following versions of HoloScript with security updates:

| Version | Supported          |
| ------- | ------------------ |
| 3.x.x   | :white_check_mark: |
| 2.x.x   | :x:                |
| 1.x.x   | :x:                |

## Security Scanning

HoloScript uses multiple security scanning tools to ensure code safety:

### 🔒 Active Security Measures

1. **Snyk Security Scanning**
   - Continuous vulnerability monitoring
   - Daily automated scans
   - Severity threshold: Medium+
   - License compliance checking
   - [View Dashboard](https://snyk.io/test/github/brianonbased-dev/HoloScript)

2. **CodeQL Analysis**
   - Static code analysis
   - Security and quality queries
   - JavaScript/TypeScript scanning
   - Automated on every PR

3. **Dependency Review**
   - PR-based dependency analysis
   - License violation detection
   - Known vulnerability blocking

4. **NPM Audit**
   - Package vulnerability scanning
   - Automated audit reports
   - Moderate+ severity threshold

5. **Codecov Coverage**
   - 80%+ test coverage requirement
   - Prevents untested code deployment
   - Security test validation

### 🛡️ Runtime Security

1. **VM-based Sandbox** (`@holoscript/security-sandbox`)
   - Isolated code execution
   - AI-generated code validation
   - Resource limits enforcement
   - Complete audit logging

2. **Parser Validation**
   - Syntax validation before execution
   - Schema compliance checking
   - Malicious pattern detection

## Reporting a Vulnerability

We take security vulnerabilities seriously. If you discover a security issue, please follow these steps:

### 1. **DO NOT** Open a Public Issue

Security vulnerabilities should **never** be reported through public GitHub issues.

### 2. Report Privately

Please report security vulnerabilities using one of these methods:

- **Preferred**: Use GitHub's [Security Advisories](https://github.com/brianonbased-dev/HoloScript/security/advisories/new)
- **Email**: security@brianonbased.dev
- **Encrypted**: Use our [PGP key](https://keys.openpgp.org/search?q=security@brianonbased.dev)

### 3. Include Details

Please include the following information:

- **Description**: Clear description of the vulnerability
- **Impact**: Potential security impact and affected versions
- **Reproduction**: Step-by-step reproduction instructions
- **PoC**: Proof of concept (if applicable)
- **Fix**: Suggested fix (if you have one)
- **Disclosure**: Your preferred disclosure timeline

### 4. Response Timeline

- **Initial Response**: Within 48 hours
- **Triage**: Within 1 week
- **Fix Timeline**: Depends on severity
  - Critical: 24-48 hours
  - High: 1 week
  - Medium: 2 weeks
  - Low: 1 month
- **Public Disclosure**: After fix is released and deployed

## Security Best Practices

### For Users

1. **Keep Dependencies Updated**

   ```bash
   pnpm update --latest
   pnpm audit
   ```

2. **Use Security Sandbox for AI Code**

   ```typescript
   import { HoloScriptSandbox } from '@holoscript/security-sandbox';

   const sandbox = new HoloScriptSandbox({
     timeout: 3000,
     enableLogging: true,
   });

   const result = await sandbox.executeHoloScript(aiGeneratedCode, {
     source: 'ai-generated',
   });
   ```

3. **Validate User Input**
   - Always validate .holo code before execution
   - Use `parseHoloStrict()` for validation
   - Never trust user-provided code

4. **Enable Security Features**
   - Use HTTPS for all network requests
   - Enable CSP headers in web applications
   - Implement rate limiting for API endpoints

### For Contributors

1. **Security Review Checklist**
   - [ ] No hardcoded credentials
   - [ ] No eval() or new Function()
   - [ ] Input validation implemented
   - [ ] SQL injection prevention
   - [ ] XSS prevention
   - [ ] CSRF protection
   - [ ] Secure dependencies
   - [ ] Tests include security cases

2. **Pre-Commit Security Checks**

   ```bash
   pnpm audit
   pnpm test:coverage
   pnpm lint
   ```

3. **Code Review Requirements**
   - Security-sensitive PRs require 2+ approvals
   - Cryptography changes require security team review
   - Authentication/authorization changes need thorough testing

## Known Security Features

### ✅ Implemented Protections

- [x] VM-based code sandboxing
- [x] Parser-based validation
- [x] Dependency vulnerability scanning
- [x] Static code analysis (CodeQL)
- [x] 80%+ test coverage requirement
- [x] Security audit logging
- [x] Resource limit enforcement
- [x] Timeout protection
- [x] License compliance checking

### 🔄 Planned Enhancements

- [ ] Hardware security module (HSM) integration
- [ ] Signed package verification
- [ ] Runtime integrity monitoring
- [ ] Advanced threat detection
- [ ] Security training for contributors

## Security Contacts

- **Security Team**: security@brianonbased.dev
- **Project Lead**: brian@brianonbased.dev
- **PGP Fingerprint**: `XXXX XXXX XXXX XXXX XXXX XXXX XXXX XXXX XXXX XXXX`

## Acknowledgments

We appreciate security researchers who responsibly disclose vulnerabilities. Contributors will be:

- Credited in our security advisories (unless you prefer anonymity)
- Listed in our Hall of Fame
- Eligible for our bug bounty program (when available)

---

Last updated: 2026-02-16
