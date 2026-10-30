const assert = require('node:assert/strict');
const path = require('node:path');
const vscode = require('vscode');
const Module = require('node:module');

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitFor(predicate, label) {
  const deadline = Date.now() + 6000;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await sleep(30);
  }
  throw new Error(`Timed out: ${label}`);
}

exports.run = async function run() {
  const extension = vscode.extensions.getExtension('zhengbangbo.current-line-blame');
  assert.ok(extension, 'Extension is registered');
  // TextEditor objects are frozen. Observe decoration writes at the module boundary,
  // forwarding every call to the real editor rather than replacing VS Code behavior.
  const observed = new WeakMap();
  const wrappers = new WeakMap();
  const wrapEditor = editor => {
    if (!editor) return editor;
    if (!wrappers.has(editor)) wrappers.set(editor, new Proxy({}, {
      get(_target, key) {
        if (key === 'setDecorations') return (type, values) => {
          observed.set(editor, values);
          return editor.setDecorations(type, values);
        };
        const value = editor[key];
        return typeof value === 'function' ? value.bind(editor) : value;
      }
    }));
    return wrappers.get(editor);
  };
  const window = new Proxy({}, { get(_target, key) {
    if (key === 'activeTextEditor') return wrapEditor(vscode.window.activeTextEditor);
    if (key === 'visibleTextEditors') return vscode.window.visibleTextEditors.map(wrapEditor);
    return vscode.window[key];
  } });
  const api = { ...vscode, window };
  const load = Module._load;
  let intercepted = false;
  Module._load = function(request, parent, isMain) {
    if (request === 'vscode' && parent?.filename === path.resolve(__dirname, '../src/extension.js')) {
      intercepted = true;
      return api;
    }
    return load.call(this, request, parent, isMain);
  };
  try { await extension.activate(); } finally { Module._load = load; }
  assert.ok(intercepted, 'Observed the actual extension activation');
  assert.ok(extension.isActive, 'Extension activates in the real extension host');
  assert.ok((await vscode.commands.getCommands()).includes('currentLineBlame.toggle'));
  console.log('PASS extension activation and command registration');

  const root = process.env.BLAME_TEST_WORKSPACE;
  const document = await vscode.workspace.openTextDocument(path.join(root, 'sample.js'));
  const editor = await vscode.window.showTextDocument(document);
  const decorations = () => observed.get(editor) || [];
  const text = () => decorations()[0]?.renderOptions?.after?.contentText || '';
  const move = line => { editor.selection = new vscode.Selection(line, 0, line, 0); };
  const waitBlame = label => waitFor(() => text().includes('Blame Tester') && text().includes('Add integration fixture'), label);
  const config = vscode.workspace.getConfiguration('currentLineBlame', document.uri);
  try {
    move(1);
    await waitBlame('committed line annotation');
    assert.equal(decorations()[0].range.start.line, 1);
    assert.equal(decorations()[0].range.start.character, document.lineAt(1).text.length);
    assert.match(decorations()[0].hoverMessage.value.replace(/&nbsp;/g, ' '), /Blame Tester/);
    console.log('PASS real editor receives author, summary, hover and end-of-line range');

    await editor.edit(edit => edit.insert(new vscode.Position(0, 0), '// unsaved insertion\n'));
    move(0);
    await waitFor(() => text() === 'Uncommitted changes', 'unsaved inserted line');
    move(2);
    await waitBlame('original attribution after unsaved insertion');
    console.log('PASS unsaved changes and shifted line attribution');

    editor.selection = new vscode.Selection(1, 0, 2, 0);
    await waitFor(() => decorations().length === 0, 'selection hides annotation');
    await sleep(150);
    assert.equal(decorations().length, 0);
    editor.selections = [new vscode.Selection(1, 0, 1, 0), new vscode.Selection(2, 0, 2, 0)];
    await sleep(150);
    assert.equal(decorations().length, 0);
    console.log('PASS text selection and multiple cursors hide annotations');

    for (let i = 0; i < 20; i++) { move(i % 5); await sleep(5); }
    move(2);
    await waitBlame('final cursor after rapid moves');
    assert.equal(decorations()[0].range.start.line, 2);
    console.log('PASS rapid cursor movement ends on the correct line');

    const untracked = await vscode.workspace.openTextDocument(path.join(root, 'untracked.js'));
    const untrackedEditor = await vscode.window.showTextDocument(untracked, vscode.ViewColumn.Beside);
    await waitFor(() => decorations().length === 0, 'switching editors clears previous blame');
    await sleep(150);
    assert.equal((observed.get(untrackedEditor) || []).length, 0, 'untracked editor stays clear');
    await vscode.window.showTextDocument(document, editor.viewColumn);
    await waitFor(() => vscode.window.activeTextEditor === editor, 'tracked editor is active');
    move(1);
    await sleep(50);
    move(2);
    await waitBlame('switching back to tracked document');
    console.log('PASS switching documents clears and restores blame');

    await vscode.commands.executeCommand('currentLineBlame.toggle');
    await waitFor(() => !vscode.workspace.getConfiguration('currentLineBlame', document.uri).get('enabled', true) && decorations().length === 0, 'toggle disables');
    await vscode.commands.executeCommand('currentLineBlame.toggle');
    await waitBlame('toggle enables');
    console.log('PASS toggle command with default settings');

    await config.update('maxFileSize', 1024, vscode.ConfigurationTarget.Workspace);
    await editor.edit(edit => edit.insert(new vscode.Position(0, 0), '//'.padEnd(2048, 'x') + '\n'));
    await sleep(200);
    assert.equal(decorations().length, 0, 'oversize file hides annotation');
    await vscode.commands.executeCommand('undo');
    move(2);
    await waitBlame('restored file below size limit');
    console.log('PASS file size limit');

    await config.update('enabled', true, vscode.ConfigurationTarget.Workspace);
    await waitBlame('workspace override enabled');
    await vscode.commands.executeCommand('currentLineBlame.toggle');
    await waitFor(() => !vscode.workspace.getConfiguration('currentLineBlame', document.uri).get('enabled', true) && decorations().length === 0, 'toggle honors workspace override');
    await vscode.commands.executeCommand('currentLineBlame.toggle');
    await waitBlame('workspace override toggles back on');
    console.log('PASS toggle command with workspace override');
  } finally {
    await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor');
  }
};
