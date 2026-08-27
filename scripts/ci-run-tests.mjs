import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

/**
 * Führt alle `test:*`-Skripte aus package.json aus. Exit 1, wenn eines fehlschlägt.
 * Bewusst reihum (die Suiten sind schnell und teilen teils Dateien).
 */
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
// Nur echte Suiten – `test:all` ist dieser Runner selbst.
const scripts = Object.keys(pkg.scripts).filter((k) => k.startsWith('test:') && k !== 'test:all');

let failed = 0;
for (const name of scripts) {
  process.stdout.write(`• ${name} … `);
  try {
    execSync(`npm run --silent ${name}`, { stdio: ['ignore', 'pipe', 'pipe'] });
    console.log('ok');
  } catch (error) {
    failed += 1;
    console.log('FAIL');
    console.log(String(error.stdout ?? ''));
    console.log(String(error.stderr ?? ''));
  }
}

console.log(`\n${scripts.length - failed}/${scripts.length} Suiten grün`);
process.exit(failed > 0 ? 1 : 0);
