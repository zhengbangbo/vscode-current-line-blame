# Current Line Blame

只做一件事：在 VS Code 当前行的末尾，显示这行代码最后一次提交的作者、时间和摘要。类似 GitLens 的 Current Line Blame 和 Zed 原生的行尾 blame。

```text
const answer = 42;    Alice, 2 days ago • Fix the answer
```

- 光标移动后自动更新，默认延迟 200ms。
- 悬停查看提交摘要、作者、完整日期及短 commit hash。
- 未提交的行显示 `Uncommitted changes`。未保存的插入、删除也会正确参与行号计算。
- 非 Git 文件、未跟踪文件、多光标和选中文本时不显示。
- 跟随编辑器主题，无运行时依赖，不访问网络。

## 安装与使用

需要本机安装 Git，并能在 PATH 中找到 `git`。支持 VS Code 1.85 及以上版本；Remote SSH / WSL / Dev Containers 场景需要在扩展运行环境中安装 Git。

1. 执行 `npm install`。
2. 执行 `npm run package`，生成 `current-line-blame-0.1.0.vsix`。
3. 在 VS Code 命令面板运行 **Extensions: Install from VSIX...**，选择生成的文件。
4. 打开 Git 仓库中的已跟踪文件，将光标停在任意一行。

也可以在本项目按 F5 启动 Extension Development Host 调试。

## 设置

| 设置 | 默认值 | 用途 |
| --- | --- | --- |
| `currentLineBlame.enabled` | `true` | 开关行尾注释 |
| `currentLineBlame.delay` | `200` | 更新延迟，单位毫秒 |
| `currentLineBlame.maxFileSize` | `1048576` | 最大文档大小，单位 UTF-8 字节 |

命令面板提供 **Current Line Blame: Toggle**。外部提交或分支切换后，移动光标、切回窗口或等待最多 30 秒会刷新。

扩展仅在受信任工作区运行 Git。Git 不存在、文件尚未提交或命令失败时会安静隐藏注释。每次只查询当前行，命令最多运行 5 秒；快速移动光标会取消旧查询。

## 开发

`npm run check` 做静态类型检查，`npm test` 在临时 Git 仓库中验证真实 blame、未保存修改、特殊文件名和取消请求。

行尾显示使用 VS Code 官方 [Decoration API](https://code.visualstudio.com/api/references/vscode-api#DecorationRenderOptions)。
