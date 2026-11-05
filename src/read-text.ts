import { readFile } from 'node:fs/promises';

/** ファイルが無い(ENOENT)ときのみ null。権限エラー等は握りつぶさず投げる。 */
export const readTextIfExists = (path: string): Promise<string | null> =>
  readFile(path, 'utf8').catch((e: NodeJS.ErrnoException) => {
    if (e.code === 'ENOENT') return null;
    throw e;
  });
