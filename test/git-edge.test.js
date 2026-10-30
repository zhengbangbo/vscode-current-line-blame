const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtemp, mkdir, writeFile, rm } = require('node:fs/promises');
const { tmpdir, devNull } = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { blameLine } = require('../src/git');

/** @param {(fixture: { root: string, git: (args: string[]) => string, write: (name: string, contents: string) => Promise<string>, blame: (name: string, contents: string, line: number) => ReturnType<typeof blameLine> }) => Promise<void>} run */
async function inRepository(run) {
  const root = await mkdtemp(path.join(tmpdir(), 'line-blame-edge-'));
  const git = (/** @type {string[]} */ args) => execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: devNull, GIT_AUTHOR_NAME: 'Alice', GIT_AUTHOR_EMAIL: 'alice@example.com', GIT_COMMITTER_NAME: 'Alice', GIT_COMMITTER_EMAIL: 'alice@example.com' }
  }).trim();
  const write = async (/** @type {string} */ name, /** @type {string} */ contents) => {
    const filename = path.join(root, name);
    await mkdir(path.dirname(filename), { recursive: true });
    await writeFile(filename, contents);
    return filename;
  };
  const blame = (/** @type {string} */ name, /** @type {string} */ contents, /** @type {number} */ line) => blameLine(path.join(root, name), contents, line, new AbortController().signal);
  try {
    git(['init', '-b', 'main']);
    await run({ root, git, write, blame });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test('unsaved deletions preserve blame and appended lines are uncommitted', async () => {
  await inRepository(async ({ git, write, blame }) => {
    await write('source.txt', 'first\nsecond\nthird\n');
    git(['add', '.']);
    git(['commit', '-m', 'Original lines']);
    const original = git(['rev-parse', 'HEAD']);
    assert.equal((await blame('source.txt', 'third\n', 1)).hash, original);
    assert.equal((await blame('source.txt', 'first\nsecond\nthird\nadded\n', 4)).uncommitted, true);
  });
});

test('committed blank lines, CRLF and a final line without newline retain attribution', async () => {
  await inRepository(async ({ git, write, blame }) => {
    const contents = 'first\r\n\r\nlast';
    await write('windows.txt', contents);
    git(['add', '.']);
    git(['commit', '-m', 'Windows lines']);
    for (const line of [1, 2, 3]) {
      const result = await blame('windows.txt', contents, line);
      assert.equal(result.author, 'Alice');
      assert.equal(result.uncommitted, false);
    }
  });
});

test('staged edits are uncommitted and new commits refresh attribution', async () => {
  await inRepository(async ({ git, write, blame }) => {
    await write('source.txt', 'first\nsecond\n');
    git(['add', '.']);
    git(['commit', '-m', 'Original']);
    const original = git(['rev-parse', 'HEAD']);
    await write('source.txt', 'first\nchanged\n');
    git(['add', '.']);
    assert.equal((await blame('source.txt', 'first\nchanged\n', 2)).uncommitted, true);
    assert.equal((await blame('source.txt', 'first\nchanged\n', 1)).hash, original);
    git(['commit', '--author', 'Bob <bob@example.com>', '-m', 'Change second line']);
    const changed = await blame('source.txt', 'first\nchanged\n', 2);
    assert.equal(changed.author, 'Bob');
    assert.equal(changed.summary, 'Change second line');
    assert.equal(changed.uncommitted, false);
    assert.notEqual(changed.hash, original);
  });
});

test('nested directories, Unicode and shell metacharacters are treated as literal filenames', async () => {
  await inRepository(async ({ git, write, blame }) => {
    const name = 'nested 空格/-file $(false) `false` [x].txt';
    await write(name, 'safe contents\n');
    git(['add', '.']);
    git(['commit', '-m', 'Special filename']);
    assert.equal((await blame(name, 'safe contents\n', 1)).summary, 'Special filename');
  });
});

test('linked worktrees resolve the correct repository and branch', async () => {
  await inRepository(async ({ root, git, write }) => {
    await write('source.txt', 'main\n');
    git(['add', '.']);
    git(['commit', '-m', 'Main contents']);
    const worktree = path.join(root, 'linked-worktree');
    git(['worktree', 'add', '-b', 'feature', worktree]);
    await writeFile(path.join(worktree, 'source.txt'), 'feature\n');
    git(['-C', worktree, 'add', '.']);
    git(['-C', worktree, 'commit', '-m', 'Feature contents']);
    const result = await blameLine(path.join(worktree, 'source.txt'), 'feature\n', 1, new AbortController().signal);
    assert.equal(result.summary, 'Feature contents');
  });
});

test('repository paths retain meaningful trailing whitespace', async () => {
  await inRepository(async ({ root, git }) => {
    const nested = path.join(root, 'repository with trailing space ');
    await mkdir(nested);
    git(['-C', nested, 'init', '-b', 'main']);
    const filename = path.join(nested, 'source.txt');
    await writeFile(filename, 'nested contents\n');
    git(['-C', nested, 'add', '.']);
    git(['-C', nested, 'commit', '-m', 'Nested repository contents']);
    const result = await blameLine(filename, 'nested contents\n', 1, new AbortController().signal);
    assert.equal(result.summary, 'Nested repository contents');
  });
});

test('a directory outside Git is rejected quietly by the caller', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'line-blame-outside-'));
  try {
    const filename = path.join(root, 'outside.txt');
    await writeFile(filename, 'outside\n');
    await assert.rejects(blameLine(filename, 'outside\n', 1, new AbortController().signal));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
