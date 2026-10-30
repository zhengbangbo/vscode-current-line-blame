const { mkdtemp, mkdir, writeFile, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { runTests } = require('@vscode/test-electron');

async function main() {
  // macOS IPC sockets have a short path limit; its default temp path is too long.
  const root = await mkdtemp(path.join(process.platform === 'darwin' ? '/tmp' : tmpdir(), 'clb-host-'));
  const workspace = path.join(root, 'workspace');
  try {
    await mkdir(path.join(workspace, '.vscode'), { recursive: true });
    await writeFile(path.join(workspace, '.vscode/settings.json'), JSON.stringify({
      'currentLineBlame.delay': 20,
      'git.blame.editorDecoration.enabled': false,
      'editor.fontSize': 16,
      'window.startupEditor': 'none',
      'workbench.enableExperiments': false,
      'telemetry.telemetryLevel': 'off'
    }));
    await writeFile(path.join(workspace, 'sample.js'), '// Current Line Blame integration fixture\nconst first = 1;\nconst second = 2;\n\nconst third = 3;\n');
    await writeFile(path.join(workspace, 'other.js'), 'const other = true;\n');
    const git = args => execFileSync('git', args, { cwd: workspace, stdio: 'pipe' });
    git(['init', '-b', 'main']);
    git(['config', 'user.name', 'Blame Tester']);
    git(['config', 'user.email', 'blame@example.com']);
    git(['add', '.']);
    git(['commit', '-m', 'Add integration fixture']);
    await writeFile(path.join(workspace, 'untracked.js'), 'const untracked = true;\n');
    await runTests({
      vscodeExecutablePath: process.env.VSCODE_EXECUTABLE_PATH || undefined,
      extensionDevelopmentPath: path.resolve(__dirname, '..'),
      extensionTestsPath: path.resolve(__dirname, '../integration/suite.js'),
      extensionTestsEnv: { BLAME_TEST_WORKSPACE: workspace },
      launchArgs: [workspace, '--user-data-dir', path.join(root, 'user-data'), '--extensions-dir', path.join(root, 'extensions'), '--disable-extensions', '--skip-welcome', '--skip-release-notes', '--disable-workspace-trust']
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
