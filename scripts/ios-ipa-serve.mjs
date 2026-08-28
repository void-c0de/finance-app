/**
 * LAN-Auslieferung der unsignierten IPA + private AltStore-Quelle.
 *
 *   npm run ios:ipa:serve      – HTTP-Server im lokalen Netz
 *
 * Serviert AUSSCHLIESSLICH:
 *   /                       – Info-Seite (LAN-URL, SHA-256, Hinweise)
 *   /FinanceApp.ipa         – die verifizierte IPA
 *   /source.json            – AltStore-Quelle (zeigt auf /FinanceApp.ipa)
 *
 * Kein Directory-Listing. Kein Repo-Root. Keine Secrets. Kein Upload zu Dritten.
 *
 * WICHTIG: Eine IPA herunterladen ist NICHT installieren. Die Datei wird erst
 * nutzbar, wenn AltStore / SideStore / Sideloadly auf dem iPhone sie mit deiner
 * kostenlosen Apple-ID signiert.
 */
import { createHash } from 'node:crypto';
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import { resolve } from 'node:path';

const IPA = resolve('.artifacts/ios/FinanceApp-ios-unsigned.ipa');
const PORT = Number(process.env.IOS_IPA_PORT ?? 8788);
const BUNDLE_ID = 'com.nocta-xz.financeapp';
const APP_NAME = 'Finance App';
const VERSION = '1.5.0';

if (!existsSync(IPA)) {
  console.error('Keine IPA unter .artifacts/ios/. Erst:  npm run ios:unsigned:prepare');
  process.exitCode = 1;
} else {
  const ipaBuf = readFileSync(IPA);
  const sha = createHash('sha256').update(ipaBuf).digest('hex');
  const size = statSync(IPA).size;

  const lanIp =
    Object.values(networkInterfaces())
      .flat()
      .find((n) => n && n.family === 'IPv4' && !n.internal)?.address ?? '127.0.0.1';
  const base = `http://${lanIp}:${PORT}`;

  const source = {
    name: 'Finance App (lokal)',
    identifier: 'com.nocta-xz.financeapp.localsource',
    sourceURL: `${base}/source.json`,
    apps: [
      {
        name: APP_NAME,
        bundleIdentifier: BUNDLE_ID,
        developerName: 'nocta-xz',
        version: VERSION,
        versionDate: new Date(statSync(IPA).mtime).toISOString().slice(0, 10),
        versionDescription: 'Unsignierter Entwicklungs-Build. Wird von AltStore mit deiner Apple-ID signiert.',
        downloadURL: `${base}/FinanceApp.ipa`,
        localizedDescription: 'Konten, Budgets, Sparziele — offline-first, verschlüsselt.',
        iconURL: `${base}/icon.png`,
        tintColor: '000000',
        size,
        sha256: sha,
        permissions: [],
      },
    ],
  };

  const page = `<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1">
<title>Finance App — LAN</title>
<style>body{font:16px/1.5 -apple-system,system-ui,sans-serif;max-width:40em;margin:2em auto;padding:0 1em;color:#111;background:#fff}
code{background:#f2f2f2;padding:.1em .3em;border-radius:4px;word-break:break-all}h1{font-size:1.4em}
.b{background:#fffae6;border:1px solid #e8d98a;border-radius:8px;padding:.8em 1em;margin:1em 0}</style>
<h1>Finance App — unsignierte IPA</h1>
<p><b>${APP_NAME} ${VERSION}</b> · Bundle <code>${BUNDLE_ID}</code> · ${(size / 1048576).toFixed(1)} MB</p>
<p>SHA-256:<br><code>${sha}</code></p>
<div class=b><b>Download ≠ Installation.</b> Diese Datei allein installiert nichts.
Sie wird nutzbar, sobald <b>AltStore / SideStore / Sideloadly</b> auf dem iPhone sie
mit deiner <b>kostenlosen Apple-ID</b> signiert.</div>
<h2>iPhone (Safari)</h2>
<p><a href="/FinanceApp.ipa">FinanceApp.ipa herunterladen</a> → in „Dateien" ablegen → in AltStore/SideStore öffnen.</p>
<h2>AltStore-Quelle</h2>
<p>In AltStore „Quelle hinzufügen": <code>${base}/source.json</code><br>
Danach erkennt AltStore neue Finance-App-Versionen automatisch.</p>
<p style=color:#666>Nur im lokalen Netz. Server stoppen: Strg+C.</p>`;

  const server = createServer((req, res) => {
    const url = (req.url ?? '/').split('?')[0];
    const send = (code, type, body) => {
      res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
      res.end(body);
    };
    if (url === '/' || url === '/index.html') return send(200, 'text/html; charset=utf-8', page);
    if (url === '/source.json') return send(200, 'application/json; charset=utf-8', JSON.stringify(source, null, 2));
    if (url === '/FinanceApp.ipa') {
      res.writeHead(200, {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': 'attachment; filename="FinanceApp.ipa"',
        'Content-Length': size,
      });
      return createReadStream(IPA).pipe(res);
    }
    return send(404, 'text/plain', 'not found');
  });

  server.listen(PORT, '0.0.0.0', () => {
    console.log('Finance App — LAN-Auslieferung\n');
    console.log(`  Info-Seite : ${base}/`);
    console.log(`  IPA        : ${base}/FinanceApp.ipa`);
    console.log(`  AltStore   : ${base}/source.json`);
    console.log(`\n  SHA-256    : ${sha}`);
    console.log(`  Größe      : ${(size / 1048576).toFixed(1)} MB`);
    console.log('\niPhone + PC müssen im selben WLAN sein. Stoppen mit Strg+C.');
    console.log('Erinnerung: Download ≠ Installation — Signierung via AltStore/SideStore.');
  });
}
