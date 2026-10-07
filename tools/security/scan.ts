/**
 * FlipDAW Security Scanner
 * Checks for known malicious packages, suspicious patterns, and IOC matches.
 * Run: npx tsx tools/security/scan.ts
 */

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { execSync } from 'node:child_process';

interface IOCData {
  version: string;
  description: string;
  packages: Record<string, string[]>;
  patterns: Record<string, { description: string; severity: string; chars?: string[] }>;
}

interface Finding {
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  category: string;
  message: string;
  file?: string;
  line?: number;
  package?: string;
  version?: string;
}

function loadIOC(): IOCData {
  const raw = readFileSync(join(import.meta.dirname, 'ioc-blocklist.json'), 'utf8');
  return JSON.parse(raw) as IOCData;
}

function checkPackageLock(ioc: IOCData): Finding[] {
  const findings: Finding[] = [];
  const lockPath = join(process.cwd(), 'package-lock.json');

  if (!existsSync(lockPath)) {
    findings.push({
      severity: 'MEDIUM',
      category: 'MISSING_LOCKFILE',
      message: 'No package-lock.json found. Run npm install to generate one.',
    });
    return findings;
  }

  const lock = JSON.parse(readFileSync(lockPath, 'utf8')) as {
    packages?: Record<string, { version?: string }>;
    dependencies?: Record<string, { version?: string }>;
  };

  // Check packages section (npm v2+)
  if (lock.packages) {
    for (const [path, info] of Object.entries(lock.packages)) {
      const name = path.replace('node_modules/', '').replace(/^.*node_modules\//, '');
      const version = info.version;
      if (!name || !version) continue;

      const blocked = ioc.packages[name];
      if (blocked && blocked.includes(version)) {
        findings.push({
          severity: 'CRITICAL',
          category: 'MALICIOUS_PACKAGE',
          message: `Blocked package: ${name}@${version}`,
          package: name,
          version,
        });
      }
    }
  }

  // Check dependencies section (npm v1)
  if (lock.dependencies) {
    for (const [name, info] of Object.entries(lock.dependencies)) {
      const version = info.version;
      if (!version) continue;

      const blocked = ioc.packages[name];
      if (blocked && blocked.includes(version)) {
        findings.push({
          severity: 'CRITICAL',
          category: 'MALICIOUS_PACKAGE',
          message: `Blocked package: ${name}@${version}`,
          package: name,
          version,
        });
      }
    }
  }

  return findings;
}

function scanDirectory(_dir: string, _ioc: IOCData): Finding[] {
  const findings: Finding[] = [];
  const nodeModules = join(process.cwd(), 'node_modules');

  if (!existsSync(nodeModules)) return findings;

  function walk(currentDir: string): void {
    let entries: string[];
    try {
      entries = readdirSync(currentDir);
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = join(currentDir, entry);
      let stat;
      try {
        stat = statSync(fullPath);
      } catch {
        continue;
      }

      if (stat.isDirectory()) {
        // Check for binding.gyp in non-native packages
        if (entry === 'binding.gyp') {
          const parentDir = currentDir.replace(/\/binding\.gyp$/, '');
          const pkgJson = join(parentDir, 'package.json');
          if (existsSync(pkgJson)) {
            try {
              const pkg = JSON.parse(readFileSync(pkgJson, 'utf8')) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
              const hasNative = pkg.dependencies?.['node-gyp'] || pkg.devDependencies?.['node-gyp'] ||
                existsSync(join(parentDir, 'src')) && readdirSync(join(parentDir, 'src')).some(f => f.endsWith('.cc') || f.endsWith('.cpp') || f.endsWith('.c'));
              if (!hasNative) {
                findings.push({
                  severity: 'CRITICAL',
                  category: 'PHANTOM_GYP',
                  message: `binding.gyp in non-native package: ${relative(process.cwd(), parentDir)}`,
                  file: relative(process.cwd(), fullPath),
                });
              }
            } catch {
              // Skip if can't read package.json
            }
          }
        }

        // Check for bun binary in suspicious locations
        if (entry === 'bun' && stat.isFile()) {
          const relPath = relative(process.cwd(), fullPath);
          if (relPath.startsWith('/tmp') || relPath.includes('/bun') && !relPath.includes('node_modules/bun-')) {
            findings.push({
              severity: 'CRITICAL',
              category: 'SUSPICIOUS_BUN',
              message: `bun binary in suspicious location: ${relPath}`,
              file: relPath,
            });
          }
        }

        walk(fullPath);
      }
    }
  }

  walk(nodeModules);
  return findings;
}

function scanAgentConfigs(): Finding[] {
  const findings: Finding[] = [];
  const configs = [
    '.cursorrules',
    'CLAUDE.md',
    '.claude/settings.json',
    '.vscode/tasks.json',
  ];

  // Zero-width Unicode characters (ZWJ intentionally included)
  // eslint-disable-next-line no-misleading-character-class
  const zeroWidth = /[\u{200B}\u{200C}\u{200D}\u{FEFF}]/u;

  for (const config of configs) {
    const fullPath = join(process.cwd(), config);
    if (!existsSync(fullPath)) continue;

    try {
      const content = readFileSync(fullPath, 'utf8');
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        if (zeroWidth.test(lines[i])) {
          findings.push({
            severity: 'HIGH',
            category: 'ZERO_WIDTH_UNICODE',
            message: `Zero-width Unicode in ${config}`,
            file: config,
            line: i + 1,
          });
        }
      }

      // Check .vscode/tasks.json for folderOpen
      if (config === '.vscode/tasks.json') {
        const tasks = JSON.parse(content) as { tasks?: Array<{ runOn?: string; reveal?: string; echo?: string }> };
        if (tasks.tasks) {
          for (const task of tasks.tasks) {
            if (task.runOn === 'folderOpen' && task.reveal === 'never' && task.echo === false) {
              findings.push({
                severity: 'HIGH',
                category: 'VSCODE_TASKS_FOLDEROPEN',
                message: 'Suspicious .vscode/tasks.json with folderOpen + hidden execution',
                file: config,
              });
            }
          }
        }
      }
    } catch {
      // Skip if can't read
    }
  }

  return findings;
}

function scanGitHistory(): Finding[] {
  const findings: Finding[] = [];

  try {
    // Check for known malicious commit messages
    const result = execSync('git log --oneline -100 --all 2>/dev/null || echo ""', {
      encoding: 'utf8',
      cwd: process.cwd(),
    });

    const maliciousPatterns = [
      'Shai-Hulud',
      'Miasma: The Spreading Blight',
      'ChainDrop',
      'Phantom Gyp',
    ];

    const lines = result.split('\n');
    for (const line of lines) {
      for (const pattern of maliciousPatterns) {
        if (line.includes(pattern)) {
          findings.push({
            severity: 'CRITICAL',
            category: 'MALICIOUS_GIT_HISTORY',
            message: `Suspicious commit message: ${line.trim()}`,
          });
        }
      }
    }
  } catch {
    // Git not available or no repo
  }

  return findings;
}

/**
 * Supply-chain guards for the desktop shell: dependency provenance, install hooks,
 * Cargo sources, committed secrets and dangerous sinks in our own renderer code.
 */
function scanSupplyChain(): Finding[] {
  const findings: Finding[] = [];
  const root = process.cwd();

  // 1. npm: only the official registry, and no git/URL dependencies.
  const lockPath = join(root, 'package.json');
  if (existsSync(lockPath)) {
    const pkg = JSON.parse(readFileSync(lockPath, 'utf8')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    for (const group of [pkg.dependencies, pkg.devDependencies]) {
      for (const [name, spec] of Object.entries(group ?? {})) {
        if (/^(git|github|https?|file|link):/i.test(spec) || spec.includes('/')) {
          findings.push({
            severity: 'HIGH',
            category: 'NON_REGISTRY_DEPENDENCY',
            message: `${name} is not a pinned registry version: "${spec}"`,
          });
        }
      }
    }
  }

  const cargoLock = join(root, 'src-tauri', 'Cargo.lock');
  if (existsSync(cargoLock)) {
    const lock = readFileSync(cargoLock, 'utf8');
    for (const m of lock.matchAll(/^source = "(.+)"$/gm)) {
      if (!m[1].startsWith('registry+https://github.com/rust-lang/crates.io-index')) {
        findings.push({
          severity: 'CRITICAL',
          category: 'UNTRUSTED_CRATE_SOURCE',
          message: `Crate resolved from an unexpected source: ${m[1]}`,
          file: 'src-tauri/Cargo.lock',
        });
      }
    }
  }

  // 2. Renderer: no HTML/eval sinks that would defeat the CSP.
  const dangerousSinks = [
    { re: /dangerouslySetInnerHTML/, label: 'dangerouslySetInnerHTML' },
    { re: /\.innerHTML\s*=/, label: 'innerHTML assignment' },
    { re: /\beval\s*\(/, label: 'eval()' },
    { re: /new\s+Function\s*\(/, label: 'new Function()' },
    { re: /document\.write\s*\(/, label: 'document.write()' },
  ];
  const srcRoot = join(root, 'src');
  if (existsSync(srcRoot)) {
    const walkSources = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          walkSources(full);
        } else if (/\.(ts|tsx)$/.test(entry.name)) {
          const lines = readFileSync(full, 'utf8').split('\n');
          lines.forEach((line, i) => {
            for (const sink of dangerousSinks) {
              if (sink.re.test(line)) {
                findings.push({
                  severity: 'HIGH',
                  category: 'DANGEROUS_SINK',
                  message: `${sink.label} in renderer code — this would bypass the CSP`,
                  file: relative(root, full),
                  line: i + 1,
                });
              }
            }
          });
        }
      }
    };
    walkSources(srcRoot);
  }

  // 3. Committed secrets and personal data in tracked files.
  const secretPatterns: { re: RegExp; label: string }[] = [
    { re: /AKIA[0-9A-Z]{16}/, label: 'AWS access key' },
    { re: /gh[pousr]_[A-Za-z0-9]{30,}/, label: 'GitHub token' },
    { re: /xox[baprs]-[A-Za-z0-9-]{10,}/, label: 'Slack token' },
    { re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/, label: 'private key' },
  ];
  // Anything that ties the build machine to the person publishing it. The app itself has
  // no such data, so a hit means a local path or contact slipped into a commit.
  const privacyPatterns: { re: RegExp; label: string; docsOnly?: boolean }[] = [
    { re: /[A-Za-z]:\\Users\\[^\\\s"']+/gi, label: 'absolute user home path' },
    { re: /\/home\/[a-z0-9._-]+\//g, label: 'absolute home directory path' },
    { re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, label: 'email address', docsOnly: true },
  ];
  try {
    const tracked = execSync('git ls-files -z', { encoding: 'buffer', cwd: root })
      .toString('utf8')
      .split('\0')
      .filter(Boolean);
    for (const rel of tracked) {
      const full = join(root, rel);
      if (!existsSync(full)) continue;
      let content: string;
      try {
        content = readFileSync(full, 'utf8');
      } catch {
        continue;
      }
      if (content.includes('\0')) continue;
      for (const { re, label } of secretPatterns) {
        if (re.test(content)) {
          findings.push({
            severity: 'CRITICAL',
            category: 'COMMITTED_SECRET',
            message: `${label} committed in ${rel}`,
            file: rel,
          });
        }
      }
      for (const { re, label, docsOnly } of privacyPatterns) {
        if (docsOnly && !/\.(md|mdx|txt)$/i.test(rel)) continue;
        re.lastIndex = 0;
        const hit = re.exec(content);
        if (hit) {
          findings.push({
            severity: 'MEDIUM',
            category: 'PRIVACY_LEAK',
            message: `${label} in ${rel}: ${hit[0].slice(0, 60)}`,
            file: rel,
          });
        }
      }
    }
  } catch {
    // Git not available or not a repo.
  }

  return findings;
}

function printFindings(findings: Finding[]): void {
  if (findings.length === 0) {
    console.log('\n✅ No security issues found.\n');
    return;
  }

  const sorted = findings.sort((a, b) => {
    const order = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
    return order[a.severity] - order[b.severity];
  });

  console.log('\n⚠️  Security findings:\n');

  for (const f of sorted) {
    const icon = f.severity === 'CRITICAL' ? '🔴' : f.severity === 'HIGH' ? '🟠' : f.severity === 'MEDIUM' ? '🟡' : '🔵';
    const location = f.file ? ` in ${f.file}${f.line ? `:${f.line}` : ''}` : '';
    console.log(`${icon} [${f.severity}] ${f.category}: ${f.message}${location}`);
  }

  const criticals = findings.filter(f => f.severity === 'CRITICAL').length;
  const highs = findings.filter(f => f.severity === 'HIGH').length;

  console.log(`\n📊 Summary: ${criticals} critical, ${highs} high, ${findings.length - criticals - highs} other\n`);

  if (criticals > 0) {
    console.log('🚨 CRITICAL issues found. Do not proceed with installation.\n');
    process.exit(1);
  }
}

// Main
console.log('🔍 FlipDAW Security Scanner');
console.log('━'.repeat(50));

const ioc = loadIOC();
console.log(`📋 Loaded IOC blocklist: ${ioc.version}`);
console.log(`   ${Object.keys(ioc.packages).length} blocked packages\n`);

const findings: Finding[] = [
  ...checkPackageLock(ioc),
  ...scanDirectory(process.cwd(), ioc),
  ...scanAgentConfigs(),
  ...scanGitHistory(),
  ...scanSupplyChain(),
];

printFindings(findings);
