import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

test('redacts NCM response cookies while preserving diagnostic details', () => {
  const input = [
    '[ERR] {',
    '  status: 405,',
    "  body: { msg: '操作频繁，请稍候再试', code: 405 },",
    '  cookie: [',
    "    'NMTID=secret-value; Path=/;',",
    '  ]',
    '}',
    '[ERROR] /search?keywords=测试&limit=1 { status: 405 }',
    '',
  ].join('\n');

  const result = spawnSync(process.execPath, ['scripts/redact-ncm-log.js'], {
    cwd: projectRoot,
    input,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(result.stdout, /secret-value|NMTID=/);
  assert.match(result.stdout, /cookie: \[/);
  assert.match(result.stdout, /\[REDACTED\]/);
  assert.match(result.stdout, /status: 405/);
  assert.match(result.stdout, /操作频繁，请稍候再试/);
  assert.match(result.stdout, /\/search\?keywords=测试&limit=1/);
});
