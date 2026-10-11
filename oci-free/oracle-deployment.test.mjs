import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=p=>readFile(new URL(p,import.meta.url),'utf8');
const [setup,pair,docker,worker]=await Promise.all([
  read('./setup.sh'),read('./pair.sh'),read('../Dockerfile.whatsapp-cloud'),read('../whatsapp-connector/cloud.mjs')
]);
test('Oracle ARM64 only and no x86-only runtime',()=>{
 assert.match(setup,/aarch64/);
 assert.match(setup,/--platform linux\/arm64/);
 assert.match(docker,/node:22-bookworm-slim/);
 assert.match(docker,/chromium/);
});
test('browser and cloud health port stay private, storage persists across reboot',()=>{
 assert.match(setup,/127\.0\.0\.1:10000:10000/);
 assert.match(setup,/--restart unless-stopped/);
 assert.match(setup,/type=bind,src=\$DATA,dst=\/var\/data/);
 assert.match(setup,/\/srv\/nuvexa-whatsapp-pilot/);
 assert.match(worker,/PERSISTENT_DISK_NOT_MOUNTED/);
});
test('Cloud browser has reduced privileges',()=>{
 assert.match(docker,/USER 10001:10001/);
 assert.match(setup,/--cap-drop ALL/);
 assert.match(setup,/--security-opt no-new-privileges/);
});
test('Pairing code is handled only at runtime and stripped after use',()=>{
 assert.match(pair,/read -r -s/);
 assert.match(pair,/NUVEXA_SKIP_BUILD=1/);
 assert.match(pair,/unset code/);
 assert.match(pair,/Clearing short-lived enrollment code/);
 assert.doesNotMatch(pair,/nw_[0-9a-f]{64}/);
 assert.doesNotMatch(pair,/nc_[0-9a-f]{64}/);
});
test('Single account and no real WhatsApp messages',()=>{
 assert.match(worker,/maxActive:1/);
 assert.doesNotMatch(worker,/\.sendMessage\(/);
});
