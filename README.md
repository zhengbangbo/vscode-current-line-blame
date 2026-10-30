# Current Line Blame

A lightweight VS Code extension that does one thing: shows the author, relative time, and commit summary for the current line. Inspired by GitLens's Current Line Blame and Zed's built-in inline blame.

```text
const answer = 42;    Alice, 2 days ago • Fix the answer
```

- Updates automatically as you move the cursor, with a default delay of 200 ms.
- Hover to see the commit summary, author, full date, and short commit hash.
- Shows `Uncommitted changes` for lines that have not been committed. Unsaved insertions and deletions are included when mapping lines to commits.
- Hides annotations for files outside Git, untracked files, multiple cursors, and text selections.
- Follows your editor theme, has no runtime dependencies, and makes no network requests.

## Installation and usage

Requires VS Code 1.85 or later and Git available as `git` on your PATH. When using Remote SSH, WSL, or Dev Containers, install Git in the environment where the extension runs.

1. Run `npm install` in this project directory.
2. Run `npm run package` to generate `current-line-blame-0.1.0.vsix`.
3. Run **Extensions: Install from VSIX...** from the VS Code Command Palette and select the generated file.
4. Open a tracked file in a Git repository and place the cursor on a line.

To debug the extension, open this project in VS Code and press F5 to launch an Extension Development Host.

## Settings

| Setting | Default | Description |
| --- | --- | --- |
| `currentLineBlame.enabled` | `true` | Show or hide inline blame annotations. |
| `currentLineBlame.delay` | `200` | Update delay in milliseconds. |
| `currentLineBlame.maxFileSize` | `1048576` | Maximum document size in UTF-8 bytes. |

Use **Current Line Blame: Toggle** from the Command Palette to turn annotations on or off. The command updates an existing folder or workspace setting when present; otherwise, it updates the global setting. After an external commit or branch switch, move the cursor, refocus the window, or wait up to 30 seconds to refresh the annotation.

The extension runs Git only in trusted workspaces. Annotations are quietly hidden when Git is unavailable, a file has no committed history, or a command fails. Each request queries only the current line, with a five-second timeout per Git command. Moving the cursor cancels any previous request.

## Development

Run `npm run check` for static type checking. Run `npm test` to test against real temporary Git repositories, covering blame attribution, unsaved insertions and deletions, CRLF line endings, staged changes, multiple authors, special filenames, trailing spaces in directory names, worktrees, and request cancellation.

Run `npm run test:integration` to run extension host tests using the official `@vscode/test-electron` package, with an isolated VS Code profile and a temporary repository. The first run downloads VS Code and requires an internet connection. Tests cover extension activation, inline annotations and hover content, unsaved changes, rapid cursor movement, selections, multiple cursors, split editor switching, untracked files, file size limits, and toggling global and workspace settings. Editor API calls are observed and forwarded to the real editor; Git and editor behavior are not mocked.

You can also use an installed compatible editor, such as VSCodium on macOS:

```sh
VSCODE_EXECUTABLE_PATH=/Applications/VSCodium.app/Contents/MacOS/VSCodium npm run test:integration
```

Tests use a temporary user profile and do not modify your regular editor settings.

Inline annotations use VS Code's [Decoration API](https://code.visualstudio.com/api/references/vscode-api#DecorationRenderOptions).
