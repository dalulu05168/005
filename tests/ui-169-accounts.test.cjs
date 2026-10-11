const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync('index.html','utf8');

test('Nuvexa branding only; no cross-project logo', () => {
  assert.match(html, /<span>Nuvexa Pro<\/span>/);
  assert.doesNotMatch(html, /皮皮爬云端/);
});
test('16:9 single-screen accounts layout and no page scrolling', () => {
  assert.match(html, /width:min\(100vw,177\.7778dvh\)/);
  assert.match(html, /height:min\(100dvh,56\.25vw\)/);
  assert.match(html, /\.content\[data-page="accounts"\]\{display:flex;flex-direction:column;overflow:hidden!important/);
  assert.match(html, /\.accounts-pane \.table-wrap\{flex:1 1 auto;min-height:0;overflow:hidden!important/);
});
test('tab switching retains seat plan functions separately from account list', () => {
  assert.match(html, /data-account-view="list"/);
  assert.match(html, /data-account-view="plan"/);
  assert.match(html, /\$\$\('\.accounts-view-switch button'\)\.forEach/);
  assert.match(html, /host\.closest\('\.table-wrap'\)\?\.clientHeight/);
  assert.match(html, /ui\.accountsSubview==='plan'\?seatPlanPanel\(\):accountsPageCore\(\)/);
  assert.match(html, /id="saveDailySeats"/);
  assert.match(html, /id="saveAccounts"/);
});
test('existing real WhatsApp QR and heartbeat pathways are preserved', () => {
  assert.match(html, /beginAccountConnect\(b\.dataset\.connectId\)/);
  assert.match(html, /api\('\/v1\/worker\/accounts\/status'\)/);
  assert.match(html, /id="waWorkerHealth"/);
  assert.match(html, /id="accFind"/);
  assert.match(html, /applyListPagination\('accounts'\)/);
});
test('inline JS parses without syntax errors', () => {
  let count=0;
  for (const m of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) {
    assert.doesNotThrow(() => new vm.Script(m[1]));
    count++;
  }
  assert.ok(count>0);
});
