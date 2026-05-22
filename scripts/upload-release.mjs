import { readFile, writeFile } from 'fs/promises';
const TOKEN='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',TAG='v1.0.0',VERSION='1.0.0',REPO='benzsiangco/Jarvis-AI',API='https://api.github.com';
const INSTALLER=`app/tauri/target/release/bundle/nsis/Jarvis AI_1.0.0_x64-setup.exe`,SIG=`${INSTALLER}.sig`;
const h={Authorization:`token ${TOKEN}`,Accept:'application/vnd.github+json'};
const rel=await fetch(`${API}/repos/${REPO}/releases/tags/${TAG}`,{headers:h}).then(r=>r.json());
const up=rel.upload_url.replace('{?name,label}','');
const sig=(await readFile(SIG,'utf8')).trim();
const lj=JSON.stringify({version:VERSION,notes:`JARVIS AI ${TAG}`,pub_date:new Date().toISOString(),platforms:{'windows-x86_64':{signature:sig,url:`https://github.com/${REPO}/releases/download/${TAG}/Jarvis.AI_${VERSION}_x64-setup.exe`}}},null,2);
await writeFile('latest.json',lj,'utf8');
const assets=await fetch(`${API}/repos/${REPO}/releases/${rel.id}/assets`,{headers:h}).then(r=>r.json());
for(const a of assets){if(['Jarvis.AI_1.0.0_x64-setup.exe','Jarvis.AI_1.0.0_x64-setup.exe.sig','latest.json'].includes(a.name)){await fetch(`${API}/repos/${REPO}/releases/assets/${a.id}`,{method:'DELETE',headers:h});}}
async function upload(f,n,ct){const d=await readFile(f);const r=await fetch(`${up}?name=${encodeURIComponent(n)}`,{method:'POST',headers:{...h,'Content-Type':ct,'Content-Length':String(d.length)},body:d});const j=await r.json();console.log(`${n} → ${r.status} ${j.browser_download_url||j.message||''}`);}
await upload(INSTALLER,`Jarvis.AI_${VERSION}_x64-setup.exe`,'application/octet-stream');
await upload(SIG,`Jarvis.AI_${VERSION}_x64-setup.exe.sig`,'text/plain');
await upload('latest.json','latest.json','application/json');
console.log('Done!');
