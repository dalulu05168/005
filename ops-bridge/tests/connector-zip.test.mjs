import test from 'node:test';
import assert from 'node:assert/strict';
import {zipStored} from '../build-connector-zip.mjs';
test('generated Windows distribution is a valid uncompressed ZIP archive',()=>{
  const files=[
    {name:'Nuvexa-WhatsApp-Connector/START-WHATSAPP.cmd',bytes:Buffer.from('@echo off\r\n')},
    {name:'Nuvexa-WhatsApp-Connector/README.md',bytes:Buffer.from('Windows 安装说明')}
  ];
  const zip=zipStored(files);
  assert.equal(zip.readUInt32LE(0),0x04034b50);
  assert.equal(zip.readUInt32LE(zip.length-22),0x06054b50);
  assert.equal(zip.readUInt16LE(zip.length-22+8),2);
  assert.ok(zip.includes(Buffer.from('START-WHATSAPP.cmd')));
  assert.ok(zip.includes(Buffer.from('Windows 安装说明')));
});
test('ZIP filename escaping and path traversal are rejected',()=>{
  assert.throws(()=>zipStored([{name:'../private/session.json',bytes:Buffer.from('secret')}]),/UNSAFE_ZIP_ENTRY/);
  assert.throws(()=>zipStored([{name:'/absolute/path',bytes:Buffer.from('secret')}]),/UNSAFE_ZIP_ENTRY/);
});
