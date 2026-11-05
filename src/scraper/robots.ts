// robots.txt の最小実装: `User-agent: *` の Disallow 前方一致のみ。
export function parseDisallow(robotsTxt: string): string[] {
  const rules: string[] = [];
  let applies = false;
  let prevWasUA = false;
  for (const raw of robotsTxt.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    const m = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(line);
    if (!m) continue;
    const key = (m[1] ?? '').toLowerCase();
    const value = m[2] ?? '';
    if (key === 'user-agent') {
      // 連続する User-agent 行は同一グループ
      applies = (prevWasUA ? applies : false) || value === '*';
      prevWasUA = true;
      continue;
    }
    prevWasUA = false;
    if (key === 'disallow' && applies && value) rules.push(value);
  }
  return rules;
}

export function isAllowed(pathname: string, disallow: string[]): boolean {
  return !disallow.some((p) => pathname.startsWith(p));
}
