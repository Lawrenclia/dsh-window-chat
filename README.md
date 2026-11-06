# 窗口间对话 · dsh-window-chat

一个 **DeepSeek Harness (DSH) Web UI 插件**：在当前聊天窗口旁边开一个浮窗，把它和**另一个会话窗口**连起来。你可以手动把消息发给对方窗口，也可以让两个窗口按设定轮数自动来回对话。

<p align="center">
  <img src="icon.svg" width="72" height="72" alt="dsh-window-chat icon" />
</p>

```
┌─ 主聊天窗口（会话 A）──────────┐
│  你正常聊天……                  │      ┌─ 浮窗：窗口间对话 ────┐
│                                │ ←──→ │ 对方窗口：B ▾        │
│                                │      │ 我 → 对方：……        │
└────────────────────────────────┘      │ 对方 → 我：……        │
                                        │ [输入框]      [发送]  │
                                        └──────────────────────┘
```

## 功能

- **会话选择器**：带搜索的下拉，列出本机所有其它会话（显示标题与最近活跃时间）。
- **双向消息**：输入 → 真正写入对方会话（对方 Agent 会像收到用户消息一样开始回复）；对方回复实时回显在浮窗。
- **自动对话**：打开开关后，一方的新回复自动转给另一方，按「轮数」上限来回，随时可停。
- **只转发正文**：只取 `text` 内容块；`reasoning`（思考过程）和工具调用既不会显示，也不会被转发。
- **顺手的小功能**：浮窗可拖动 / 缩放 / 收起 / Esc 关闭，位置和尺寸会记住；自动滚到底；清空记录；错误提示可关闭。
- **主题与语言**：只用 Harness 主题令牌（跟随明暗主题），中英文随界面语言切换。

## 安装

这是一个 DSH **bundle**（`package.json` + `cordis.patch.yml` + `client.js`），无需构建。

在你正在使用的 DSH 会话里，让 Agent 安装：

```
plugin_manager install_bundle  →  target 填本仓库的绝对路径
```

安装完成后刷新一次页面；输入框下方会出现「⇄ 窗口间对话」按钮，首次安装会自动打开浮窗。

也可以手动装：把本目录放到任意位置，在 profile 的 `cordis.patch.yml` 中插入一行同 `cordis.patch.yml` 的配置即可（不推荐手动改 profile）。

## 使用

1. 在浮窗的「对方窗口」下拉里搜索并选择一个会话；
2. 输入一句话发送 —— 对方会话会真的收到这条消息并开始回复，回复会出现在浮窗里；
3. 想让它俩自动聊：打开「自动对话」，设置轮数（1–20），点开始；到上限自动停，也可随时点「停止」。

> 注意：消息是**真实写入对方会话**的，会消耗 token 并进入对方的历史记录；自动对话每一轮都是一次真实的模型请求，请按需设置轮数。

## 工作原理

数据层只使用 Harness 客户端公开的会话接口，不依赖内部 `remote` 命名空间：

| 能力 | 接口 |
|---|---|
| 会话目录 | `ctx.sessions.list`（客户端会话目录快照，含标题/更新时间/运行状态） |
| 打开另一个会话 | `ctx.sessions.retain(sessionId, { source })` |
| 发消息 | `binding.session.prompt([{ type: 'text', text }], 'queue')` |
| 收消息 | `binding.eventSource`（增量事件窗）中的 `user/message` / `assistant/message` |
| 运行状态 | `binding.session.getSnapshot().running` |

UI 通过 `ctx.slots.inject` 注册到两个槽位：

- `conversation.composer.dock` —— 输入框下方的启动按钮；
- `shell.overlay` —— 浮窗本体（全页浮动层）。

消息转发前只拼接 `text` 块，因此不会把思考过程或工具调用带过去。

## 文件结构

```
package.json        bundle 清单（含 dsh.client 声明、locale/icon 导出）
cordis.patch.yml    插入插件行的 Loader patch
index.js            Host 半边（无行为，占位）
client.js           全部 UI 与跨会话逻辑（纯 JavaScript，无构建步骤）
locale/*.json       插件管理器里显示的中英文标题/描述
icon.svg            原创图标
```

## 开发

- `client.js` 是纯浏览器模块，通过 `window.__ModuleLoader__.load({ id, factory })` 注册，无编译步骤；
- 修改文件后由 DSH 的客户端 HMR 重新加载（必要时刷新页面）；
- 语法自检：`node --check client.js`。

## 已知限制

- 同一 Harness profile 内的会话之间通信；跨设备/跨 profile 不适用。
- 自动对话是「谁有新回复就转给另一方」，属于简单的接力式对聊，不保证话题不跑偏；请用轮数上限兜底。
- 只在 Web UI 中提供界面（桌面端/网页端共用同一 Web 前端）。

## License

[MIT](LICENSE)