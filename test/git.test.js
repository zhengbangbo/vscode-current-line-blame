const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtemp, writeFile, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { blameLine, parseBlame, relativeTime } = require('../src/git');

test('blame follows unsaved inserted lines and identifies new content', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'line-blame-'));
  const git = (/** @type {string[]} */ args) => execFileSync('git', args, { cwd: root });
  try {
    git(['init']);
    git(['config', 'user.name', 'Test Author']);
    git(['config', 'user.email', 'test@example.com']);
    const filename = path.join(root, 'file with 空格.txt');
    await writeFile(filename, 'first\nsecond\nthird\n');
    git(['add', '.']);
    git(['commit', '-m', 'Initial text']);
    const signal = new AbortController().signal;
    const original = await blameLine(filename, 'first\nsecond\nthird\n', 2, signal);
    assert.equal(original.author, 'Test Author');
    assert.equal(original.summary, 'Initial text');
    assert.equal(original.uncommitted, false);
    const moved = await blameLine(filename, 'inserted\nfirst\nsecond\nthird\n', 3, signal);
    assert.equal(moved.hash, original.hash);
    const changed = await blameLine(filename, 'inserted\nfirst\nsecond\nthird\n', 1, signal);
    assert.equal(changed.uncommitted, true);
    const untracked = path.join(root, 'untracked.txt');
    await writeFile(untracked, 'new\n');
    await assert.rejects(blameLine(untracked, 'new\n', 1, signal));
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(blameLine(filename, 'first\n', 1, controller.signal));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('malformed blame is rejected and relative dates are stable', () => {
  assert.throws(() => parseBlame('bad output'));
  assert.equal(relativeTime(0, 120000), '2 minutes ago');
  assert.equal(relativeTime(1000, 0), 'just now');
});
