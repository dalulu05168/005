import { readFile, writeFile, mkdir, rename, copyFile, unlink, open } from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

export class JsonStore {
  constructor(base) { this.base = base; this.queues = new Map(); }
  async read(name, fallback, validate = () => true) {
    let raw;
    try { raw = await readFile(path.join(this.base, name), 'utf8'); }
    catch (e) { if (e.code === 'ENOENT') return structuredClone(fallback); throw new Error(`无法读取 ${name}：${e.code}`); }
    let data;
    try { data = JSON.parse(raw.replace(/^\uFEFF/, '')); } catch { throw new Error(`${name} 格式损坏，已停止写入。请关闭程序并从 .bak 备份恢复。`); }
    if (!validate(data)) throw new Error(`${name} 内容不符合要求，已停止写入。`);
    return data;
  }
  async write(name, value) {
    await mkdir(this.base, { recursive: true });
    const file = path.join(this.base, name), tmp = `${file}.${crypto.randomUUID()}.tmp`;
    try {
      const handle = await open(tmp, 'wx', 0o600);
      try { await handle.writeFile(JSON.stringify(value, null, 2), 'utf8'); await handle.sync(); } finally { await handle.close(); }
      try { await copyFile(file, `${file}.bak`); } catch (e) { if (e.code !== 'ENOENT') throw e; }
      await rename(tmp, file);
    } finally { await unlink(tmp).catch(() => {}); }
  }
  transaction(name, fallback, validate, update) {
    const work = (this.queues.get(name) || Promise.resolve()).then(async () => {
      const data = await this.read(name, fallback, validate);
      const result = await update(data);
      if (!validate(data)) throw new Error('拒绝保存无效数据');
      await this.write(name, data);
      return result;
    });
    const tail = work.catch(() => {}); this.queues.set(name, tail);
    tail.then(() => { if (this.queues.get(name) === tail) this.queues.delete(name); });
    return work;
  }
}
export const isObject = x => !!x && typeof x === 'object' && !Array.isArray(x);
export const validUsers = x => Array.isArray(x) && x.every(u => isObject(u) && typeof u.email === 'string' && /^[a-f0-9]{32}$/i.test(u.salt) && /^[a-f0-9]{128}$/i.test(u.passwordHash));
export const validMetadata = x => isObject(x) && Object.values(x).every(isObject);
export function validateRegistry(rows) {
  if (!Array.isArray(rows) || !rows.length) throw new Error('设备注册表为空或不是数组，请运行准备程序。');
  const ids = new Set(), names = new Set(), ports = new Set();
  for (const row of rows) {
    if (!isObject(row) || !/^[A-Za-z0-9_-]{1,128}$/.test(row.deviceId || '') || !/^[A-Za-z0-9_.-]+$/.test(row.avdName || '') || !Number.isInteger(row.port) || row.port < 5554 || row.port > 5682 || row.port % 2) throw new Error('设备注册表存在无效编号、AVD 名或端口，未改写文件。');
    if (ids.has(row.deviceId) || names.has(row.avdName.toLowerCase()) || ports.has(row.port)) throw new Error('设备注册表存在重复编号、AVD 名或端口。');
    ids.add(row.deviceId); names.add(row.avdName.toLowerCase()); ports.add(row.port);
  }
  return rows;
}
