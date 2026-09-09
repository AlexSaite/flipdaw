# FlipDAW Security Policy

## Supply Chain Security

FlipDAW is a local-only application with zero telemetry. However, we still face supply chain risks from npm dependencies and AI agent tooling.

### Known Threats (June-September 2026)

| Campaign | Attack Vector | Risk Level |
|----------|--------------|------------|
| **ChainDrop** | Malicious npm packages with preinstall hooks | CRITICAL |
| **Miasma/Phantom Gyp** | binding.gyp bypasses --ignore-scripts | CRITICAL |
| **IronWorm** | Rust binaries targeting AI API keys | CRITICAL |
| **TrapDoor** | Zero-width Unicode in .cursorrules/CLAUDE.md | HIGH |
| **Mini Shai-Hulud** | Claude Code hooks + VS Code tasks persistence | HIGH |

### Security Practices

#### Before Installing Any Package

1. **Verify source**: Official npm registry, GitHub releases from verified accounts
2. **Check maintainer**: Downloads, GitHub stars, last publish date
3. **Inspect contents**: Dependencies, scripts, postinstall hooks
4. **Pin versions**: Use exact versions in package.json, not ranges
5. **Run scanner**: `npm run security:scan` before and after install

#### Blocked Packages

See `tools/security/ioc-blocklist.json` for current blocklist. Update from:
- Phoenix Security MPI (phxintel.security/package.html)
- StepSecurity OSS Security Feed
- OSV.dev (filter: severity=CRITICAL, fix=none)

#### Lockfile Policy

- Always commit `package-lock.json`
- Use `npm ci` for reproducible installs
- Run `npm run security:scan` after `npm install`
- Never use `npm install --force` or `--legacy-peer-deps`

#### Agent Configuration Security

- Audit `.cursorrules`, `CLAUDE.md`, `.vscode/tasks.json` before each session
- Check for zero-width Unicode characters (U+200B, U+200C, U+200D, U+FEFF)
- Never execute tasks with `runOn: folderOpen` + `reveal: never`
- Remove suspicious SessionStart hooks from Claude Code

### Security Tools

```bash
# Run full security scan
npm run security:scan

# Check lockfile for known vulnerabilities
npm audit

# OSV-Scanner (if installed)
osv-scanner --lockfile=package-lock.json
```

### Incident Response

1. **If scanner finds CRITICAL issue**: Stop installation, do not proceed
2. **If malicious package found**: Remove immediately, rotate all tokens
3. **If zero-width Unicode found**: Remove from config files, audit git history
4. **Report**: Document findings in validation/sessions/ as security incidents

### IOC Sources

| Source | URL | Update Frequency |
|--------|-----|------------------|
| OSV.dev | https://osv.dev | Real-time |
| GitHub Advisory Database | https://github.com/advisories | Real-time |
| Phoenix MPI | phxintel.security/package.html | Daily |
| StepSecurity OSS Feed | stepsecurity.io/oss-security | Daily |
| Socket.dev | socket.dev | Real-time |
| Aikido | aikido.dev | Real-time |
