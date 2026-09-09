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

function scanDirectory(dir: string, ioc: IOCData): Finding[] {
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

  // Zero-width Unicode characters
  const zeroWidth = /[\u200B\u200C\u200D\uFEFF]/;

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
];

printFindings(findings);
