# Claudio 项目 Agent 接手说明

生成日期：2026-05-22  
适用目录：`/Users/mz/Downloads/Codex 工程项目/Claudio 项目`

## 基本工作方式

- 始终使用中文和用户沟通。
- 遇到目标模糊、信息冲突、实现边界不清或可能误删/误改用户内容时，先停下来提问，不要盲目猜测。
- 默认先只读审阅，再做最小修改；每一处改动都要能对应到用户本次请求。
- 不做顺手重构，不清理无关代码，不格式化无关文件。
- 运行 shell 命令时优先加 `rtk` 前缀，例如 `rtk rg --files`、`rtk npm start`、`rtk node --check server.js`。
- 本项目可能存在用户尚未提交的改动。修改前先看 `git status --short --branch`，不要回退或覆盖非本次产生的变化。

## 建议阅读顺序

1. `README.md`：当前最完整的项目说明，包含定位、架构、安装、配置、API、数据库和 FAQ。
2. `Claudio 项目移交文档.md`：早期移交材料，包含开发过程和已知问题。注意它可能和当前代码不同步。
3. `USER_MANUAL.md`：使用者视角的操作说明。
4. `package.json`：确认脚本和依赖。
5. `server.js`：Fastify 后端入口、API 路由、WebSocket、服务停止接口。
6. `lib/`：核心后端模块。
7. `public/`：PWA 前端页面、样式、播放器和聊天逻辑。
8. `user/`：用户口味、作息、情绪规则和歌单资料。

## 项目画像

Claudio 是一个本地运行的私人 AI DJ 电台，默认监听 `127.0.0.1:3000`。它把 Claude CLI、本地网易云音乐 API、SQLite 状态库、个人品味文件、天气上下文、定时广播、PWA 播放器和可选 UPnP/DLNA 投放组合在一起。

核心结构：

- `server.js`：服务入口，注册静态资源、REST API、WebSocket、调度器和系统停止接口。
- `lib/context.js`：组装 DJ 人设、用户资料、天气、最近播放和对话上下文。
- `lib/claude.js`：调用 Claude CLI，并把返回值规范化为 `say`、`play`、`reason`、`segue`。
- `lib/ncm.js`：搜索网易云歌曲、解析歌词和可播放 URL，并统一歌曲对象结构。
- `lib/db.js`：初始化和读写 SQLite，表包括 `plays`、`messages`、`plan`、`prefs`。
- `lib/scheduler.js`：早/午/晚定时推荐与广播。
- `lib/tts.js`：可选 Fish Audio 语音合成。
- `lib/upnp.js`：可选 UPnP/DLNA 设备发现与投放。
- `public/js/*`：浏览器端 API、播放器、聊天、视图切换和设置页逻辑。

主要环境变量：

- `CLAUDE_PATH`
- `NCM_BASE_URL`
- `NCM_LEVEL`
- `FISH_API_KEY`
- `FISH_VOICE_ID`
- `WEATHER_API_KEY`
- `WEATHER_CITY`
- `PORT`

不要把 `.env`、`state.db*`、`.claudio-run/`、`cache/`、`node_modules/`、`ncm-api/`、`ncm-enhanced-api/` 提交到仓库。

## 对话历史摘要

### 2026-05-17：项目接手与运行链路修复

- 已做过一次全面只读审阅，确认核心目录是 `server.js`、`lib/`、`public/`、`user/`、`prompts/`。
- 当时核对过移交文档、README、使用手册、核心后端模块和前端 JS。
- 曾用 `node --check` 检查 JS 语法，并抽查过 `/api/scheduler`、`/api/taste`、`/api/stats`、`/api/now`。
- 修过 Claude CLI 调用链路：从旧参数迁到 `--output-format json`，改用 `spawn`，关闭 stdin，加入超时和 stderr 聚合，并兼容 Claude CLI 外层 `result` 包装。
- 修过音乐源适配：`lib/ncm.js` 优先走 `/song/url/v1`，失败时回退 `/song_url`，并把歌曲统一成 `{ id, source, name, artist, album, duration, cover, url }`。
- `server.js` 已通过 `attachPlayableSongs()` / `resolvePlayableSongs()` 把 Claude 推荐结果补成可播放对象。

### 2026-05-19：README 补齐与 GitHub 发布

- README 已扩展成详尽中文文档，覆盖项目定位、架构、安装配置、启动方式、NCM API、用户资料、API、数据库、Claude 返回格式和 FAQ。
- 项目已是 Git 仓库，分支为 `main`，远端为 `https://github.com/TMAC12138/Claudio.git`。
- 历史提交中有 `846288d docs: expand README and prepare GitHub publish`，当时已推送到 `origin/main`。
- 后续如果用户说“初始化 Git 工程”，先检查现状，不要直接 `git init`。

### 2026-05-22：本次接手观察

- 当前目录已有 `.claude/settings.local.json`，其中主要是本地工具权限配置，不要把它当作业务配置。
- `.claudio-run/logs/` 里有最近运行日志；日志显示前端资源、天气、歌词、NCM 搜索和 `/api/next` 曾有成功请求。
- 最近日志里出现过 `TTS error`，说明 Fish Audio 语音链路可能未配置或暂不可用；这不等于主播放链路失败。
- 生成本文件时，`git status --short --branch` 显示工作区已有多处修改和一个未跟踪界面截图文件；后续改动前必须重新确认。

## 常用验证

- 项目结构：`rtk rg --files`
- Git 状态：`rtk git status --short --branch`
- 入口语法：`rtk node --check server.js`
- 单文件语法：`rtk node --check lib/claude.js`
- 启动 Claudio：`rtk npm start`
- 开发模式：`rtk npm run dev`
- 一键启动 Claudio + NCM Enhanced：`rtk ./start-local.sh`

如果改动前端体验，启动本地服务后用浏览器检查 `http://localhost:3000`。如果改动后端接口，至少跑相关 `node --check`，并用真实接口或最小请求验证关键路径。

## 修改边界

- 只改和用户请求直接相关的文件。
- 不要重写 README、手册或移交文档，除非用户明确要求。
- 不要删除本地运行状态、日志、数据库、缓存或截图，除非用户明确要求。
- 不要把真实密钥、token、API key 写入文档、记忆或提交记录。
- 如果文档和代码冲突，以当前代码为准，并把冲突点告诉用户。
- 如果需要联网确认依赖、API 或替代音乐源，先说明原因，再基于当前日期重新验证。
