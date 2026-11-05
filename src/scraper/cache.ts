// 生HTMLキャッシュ（data/raw/、git管理外）。本文は正本に保存しない（operations §4）。
import { mkdir, readdir, rename, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { readTextIfExists } from '../read-text';

export class RawCache {
  constructor(readonly dir: string) {}

  async read(rel: string): Promise<string | null> {
    return readTextIfExists(join(this.dir, rel));
  }

  async write(rel: string, body: string): Promise<void> {
    const path = join(this.dir, rel);
    await mkdir(dirname(path), { recursive: true });
    const tmp = `${path}.tmp`;
    await writeFile(tmp, body);
    await rename(tmp, path); // 書き込み途中の欠損ファイルを残さない
  }

  /** 取得時刻（ファイルのmtime, ms）。無ければ null。 */
  async fetchedAt(rel: string): Promise<number | null> {
    return stat(join(this.dir, rel)).then((s) => s.mtimeMs, () => null);
  }

  async list(subdir: string): Promise<string[]> {
    return (await readdir(join(this.dir, subdir)).catch(() => [])).filter((f) => !f.endsWith('.tmp'));
  }
}
