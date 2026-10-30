// Git runs without a shell: filenames and document text are never interpreted as commands.
const { spawn } = require('node:child_process');
const path = require('node:path');
const { realpath } = require('node:fs/promises');

/** @param {string[]} args @param {string} cwd @param {string | undefined} input @param {AbortSignal} signal */
function runGit(args, cwd, input, signal) {
  return new Promise((resolve, reject) => {
    const child = spawn('git', args, { cwd, signal, windowsHide: true, env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0' } });
    let output = '';
    const timeout = setTimeout(() => child.kill(), 5000);
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      output += chunk;
      if (output.length > 2 * 1024 * 1024) child.kill();
    });
    child.stderr.resume();
    child.stdin.on('error', () => {});
    child.on('error', reject);
    child.on('close', (code) => {
      clearTimeout(timeout);
      if (code === 0) resolve(output);
      else reject(new Error(`Git exited with ${code}`));
    });
    child.stdin.end(input);
  });
}

/** @param {string} output */
function parseBlame(output) {
  const lines = output.split('\n');
  const header = /^([0-9a-f]{40,64}) \d+ \d+(?: \d+)?$/.exec(lines[0]);
  if (!header) throw new Error('Invalid blame output');
  const fields = new Map(lines.slice(1).filter(line => !line.startsWith('\t')).map(line => {
    const space = line.indexOf(' ');
    return [line.slice(0, space), line.slice(space + 1)];
  }));
  return {
    hash: header[1],
    uncommitted: /^0+$/.test(header[1]),
    author: fields.get('author') || 'Unknown',
    timestamp: Number(fields.get('author-time') || 0) * 1000,
    summary: fields.get('summary') || ''
  };
}

/** @param {string} filename @param {string} contents @param {number} line @param {AbortSignal} signal */
async function blameLine(filename, contents, line, signal) {
  filename = await realpath(filename);
  const cwd = path.dirname(filename);
  const root = (await runGit(['rev-parse', '--show-toplevel'], cwd, undefined, signal)).trimEnd();
  const relative = path.relative(root, filename).split(path.sep).join('/');
  const output = await runGit(['blame', '--line-porcelain', '--contents', '-', '-L', `${line},${line}`, '--', relative], root, contents, signal);
  return parseBlame(output);
}

/** @param {number} timestamp @param {number} [now] */
function relativeTime(timestamp, now = Date.now()) {
  const seconds = Math.max(0, Math.floor((now - timestamp) / 1000));
  for (const [size, unit] of /** @type {[number, string][]} */ ([[31536000, 'year'], [2592000, 'month'], [86400, 'day'], [3600, 'hour'], [60, 'minute']])) {
    if (seconds >= size) {
      const count = Math.floor(seconds / size);
      return `${count} ${unit}${count === 1 ? '' : 's'} ago`;
    }
  }
  return 'just now';
}

module.exports = { blameLine, parseBlame, relativeTime };
