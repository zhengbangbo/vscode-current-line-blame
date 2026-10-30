const vscode = require('vscode');
const { blameLine, relativeTime } = require('./git');

/** @param {vscode.ExtensionContext} context */
function activate(context) {
  const decoration = vscode.window.createTextEditorDecorationType({
    after: { color: new vscode.ThemeColor('editorCodeLens.foreground'), margin: '0 0 0 3em', fontStyle: 'italic' },
    rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
  });
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let timer;
  /** @type {AbortController | undefined} */
  let request;
  let generation = 0;
  const clear = () => {
    for (const editor of vscode.window.visibleTextEditors) editor.setDecorations(decoration, []);
  };
  const schedule = () => {
    clearTimeout(timer);
    request?.abort();
    const ticket = ++generation;
    clear();
    const editor = vscode.window.activeTextEditor;
    const config = vscode.workspace.getConfiguration('currentLineBlame', editor?.document.uri);
    if (!editor || !vscode.workspace.isTrusted || !config.get('enabled', true) || editor.document.uri.scheme !== 'file' || editor.selections.length !== 1 || !editor.selection.isEmpty) return;
    timer = setTimeout(async () => {
      const document = editor.document;
      const version = document.version;
      const line = editor.selection.active.line;
      const contents = document.getText();
      if (!contents || Buffer.byteLength(contents, 'utf8') > config.get('maxFileSize', 1048576)) return;
      const controller = new AbortController();
      request = controller;
      try {
        const blame = await blameLine(document.uri.fsPath, contents, line + 1, controller.signal);
        if (ticket !== generation || version !== document.version || editor !== vscode.window.activeTextEditor) return;
        const text = blame.uncommitted ? 'Uncommitted changes' : `${blame.author}, ${relativeTime(blame.timestamp)} • ${blame.summary}`;
        const hover = new vscode.MarkdownString();
        if (blame.uncommitted) hover.appendText('Uncommitted changes');
        else {
          hover.appendText(blame.summary);
          hover.appendMarkdown('\n\n');
          hover.appendText(`${blame.author} · ${new Date(blame.timestamp).toLocaleString()} · ${blame.hash.slice(0, 8)}`);
        }
        const end = document.lineAt(line).range.end;
        editor.setDecorations(decoration, [{ range: new vscode.Range(end, end), hoverMessage: hover, renderOptions: { after: { contentText: text.replace(/[\r\n\t]/g, ' ').slice(0, 250) } } }]);
      } catch {
        // Non-repositories, untracked files, missing Git and cancelled requests stay quiet.
      }
    }, config.get('delay', 200));
  };
  context.subscriptions.push(
    decoration,
    vscode.window.onDidChangeActiveTextEditor(schedule),
    vscode.window.onDidChangeTextEditorSelection(schedule),
    vscode.workspace.onDidChangeTextDocument(event => {
      if (event.document === vscode.window.activeTextEditor?.document) schedule();
    }),
    vscode.workspace.onDidSaveTextDocument(schedule),
    vscode.workspace.onDidChangeConfiguration(schedule),
    vscode.workspace.onDidGrantWorkspaceTrust(schedule),
    vscode.window.onDidChangeWindowState(event => { if (event.focused) schedule(); }),
    vscode.commands.registerCommand('currentLineBlame.toggle', async () => {
      const config = vscode.workspace.getConfiguration('currentLineBlame', vscode.window.activeTextEditor?.document.uri);
      const setting = config.inspect('enabled');
      const target = setting?.workspaceFolderValue !== undefined ? vscode.ConfigurationTarget.WorkspaceFolder
        : setting?.workspaceValue !== undefined ? vscode.ConfigurationTarget.Workspace
          : vscode.ConfigurationTarget.Global;
      await config.update('enabled', !config.get('enabled', true), target);
    }),
    { dispose() { clearTimeout(timer); request?.abort(); } }
  );
  // Refresh after commits/checkouts, including changes made outside VS Code.
  const refresh = setInterval(schedule, 30000);
  context.subscriptions.push({ dispose() { clearInterval(refresh); } });
  schedule();
}

module.exports = { activate };
