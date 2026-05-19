# Claudio

Claudio 是一个本地运行的私人 AI DJ 电台。它把 Claude CLI、网易云音乐接口、个人品味档案、天气上下文、定时广播和 PWA 播放器组合在一起，让你可以用自然语言和一个“私人 DJ”对话、点歌、推荐下一首歌，并在浏览器或 UPnP/DLNA 音响上播放。

项目定位偏本地个人工作台：服务默认只监听 `127.0.0.1`，播放历史、对话记录、今日计划等状态保存在本地 SQLite 数据库里，个人口味资料则放在 `user/` 目录中，方便直接编辑和迁移。

## 核心能力

- 自然语言点歌：支持“播放 周杰伦 晴天”“放一首爵士”“下一首”等中文或英文简单指令。
- AI 推荐：通过 Claude CLI 读取 DJ 人设、用户品味、作息、情绪规则、天气、近期播放和对话上下文，返回结构化推荐结果。
- 网易云音乐播放：通过本地 NCM API 搜索歌曲并解析可播放音频链接。
- PWA 播放器：浏览器前端包含播放、聊天、品味、设置四个视图，可注册 Service Worker 和 Manifest。
- 个人品味管理：前端可读取和编辑 `user/taste.md`、`user/routines.md`、`user/mood-rules.md`。
- 定时广播：每天 07:00、12:00、19:00 触发推荐，并通过 WebSocket 推送到前端。
- 语音播报：可选接入 Fish Audio，把 DJ 回复合成为 MP3 并缓存到本地。
- 天气感知：可选接入 OpenWeather，把城市、温度、天气描述等信息注入推荐上下文。
- UPnP/DLNA 投放：可发现局域网 MediaRenderer 设备，并把当前音频推送到音响播放。
- 本地服务控制：设置页提供关闭 Claudio 和本地 NCM Enhanced 服务的按钮。

## 技术栈

| 层级 | 技术 |
| --- | --- |
| 后端服务 | Node.js ESM, Fastify, @fastify/static, @fastify/websocket |
| 数据存储 | better-sqlite3, 本地 `state.db` |
| 定时任务 | node-cron |
| AI 适配 | Claude CLI 子进程调用 |
| 音乐接口 | 本地 NeteaseCloudMusic API / NCM Enhanced API |
| 语音合成 | Fish Audio REST API |
| 天气 | OpenWeather API |
| 设备投放 | SSDP / UPnP / DLNA, xml2js |
| 前端 | Vanilla HTML / CSS / JavaScript, PWA |

## 架构概览

```text
┌──────────────────────────────────────────────┐
│ PWA Frontend                                  │
│ Player / Chat / Profile / Settings            │
└──────────────────────┬───────────────────────┘
                       │ HTTP + WebSocket
┌──────────────────────▼───────────────────────┐
│ Fastify Server                                 │
│ REST API / Static Assets / WS Stream           │
├──────────────────────────────────────────────┤
│ Router      Context       Claude Adapter       │
│ NCM Client   TTS Engine    Weather Client      │
│ Scheduler    UPnP Client   SQLite DB           │
└──────────────┬────────────┬────────────┬──────┘
               │            │            │
        Claude CLI     Local NCM API   External APIs
                                      Fish Audio / OpenWeather
```

一次推荐的大致流程：

1. 前端向 `/api/chat` 或 `/api/next` 发起请求。
2. `lib/router.js` 先识别点歌、下一首、当前播放等直接指令。
3. 需要 AI 推荐时，`lib/context.js` 组装 DJ 人设、用户口味、作息、天气、播放历史和对话历史。
4. `lib/claude.js` 调用 Claude CLI，并要求返回包含 `say`、`play`、`reason`、`segue` 的 JSON。
5. `lib/ncm.js` 把推荐歌曲解析成可播放 URL。
6. 服务端记录播放和对话，必要时生成 TTS，并把结果返回前端。

## 目录结构

```text
.
├── server.js                 # Fastify 入口、API 路由、静态资源、WebSocket
├── package.json              # npm 脚本和依赖
├── .env.example              # 环境变量模板
├── start-local.sh            # 一键启动 Claudio + ncm-enhanced-api
├── start-local.command       # macOS 双击启动包装脚本
├── lib/
│   ├── claude.js             # Claude CLI 适配器
│   ├── context.js            # 推荐上下文组装
│   ├── db.js                 # SQLite 初始化和读写
│   ├── ncm.js                # 网易云音乐搜索、歌词、播放链接解析
│   ├── router.js             # 简单意图路由
│   ├── scheduler.js          # 早/午/晚定时广播
│   ├── tts.js                # Fish Audio TTS 与本地缓存
│   ├── upnp.js               # UPnP/DLNA 设备发现与投放
│   └── weather.js            # OpenWeather 查询与缓存
├── prompts/
│   └── dj-persona.md         # DJ 人设提示词
├── user/
│   ├── mood-rules.md         # 情绪和场景规则
│   ├── playlists.json        # 用户歌单资料
│   ├── routines.md           # 作息资料
│   └── taste.md              # 音乐品味资料
├── public/
│   ├── index.html            # PWA 页面
│   ├── manifest.json         # PWA Manifest
│   ├── sw.js                 # Service Worker
│   ├── css/
│   ├── js/
│   └── icons/
├── USER_MANUAL.md            # 更偏使用者视角的操作手册
├── Claudio 项目移交文档.md    # 项目移交说明
├── Claudio_PRD_v1.0.docx     # 产品需求文档
├── Claudio 结构图.png         # 架构/结构图
└── Claudio施工图.png          # 施工图
```

运行后会生成一些本地状态文件，默认不提交到 Git：

- `state.db`、`state.db-shm`、`state.db-wal`：SQLite 数据库和 WAL 文件。
- `cache/tts/`：Fish Audio 合成后的 MP3 缓存。
- `.claudio-run/`：一键启动脚本产生的 PID 和日志。
- `ncm-api/`、`ncm-enhanced-api/`：本地音乐接口服务目录。
- `.env`：本地密钥和配置。

## 环境要求

必需：

- Node.js 18 或更高版本。
- npm。
- Claude CLI，并已在本机完成登录。
- 一个本地运行的网易云音乐 API 服务，默认地址为 `http://localhost:3001`。

可选：

- Fish Audio API Key：用于语音播报。
- OpenWeather API Key：用于天气上下文。
- 局域网内支持 UPnP/DLNA 的播放设备：用于音响投放。
- macOS：可使用 `start-local.command` 双击启动。

## 安装

```bash
npm install
cp .env.example .env
```

然后编辑 `.env`，至少确认 `CLAUDE_PATH` 和 `NCM_BASE_URL` 可用。

Claude CLI 安装示例：

```bash
npm install -g @anthropic-ai/claude-code
claude login
claude --version
```

## 配置

`.env.example` 提供了当前支持的配置项：

```bash
# Claude CLI path
CLAUDE_PATH=claude

# NeteaseCloudMusic API
NCM_BASE_URL=http://localhost:3001
NCM_LEVEL=standard

# Fish Audio TTS
FISH_API_KEY=
FISH_VOICE_ID=

# OpenWeather
WEATHER_API_KEY=
WEATHER_CITY=Beijing

# Feishu/Lark reserved
FEISHU_APP_ID=
FEISHU_APP_SECRET=
```

补充说明：

| 变量 | 必需 | 说明 |
| --- | --- | --- |
| `CLAUDE_PATH` | 是 | Claude CLI 可执行文件路径，默认使用 PATH 中的 `claude`。 |
| `NCM_BASE_URL` | 是 | 本地网易云音乐 API 地址，默认 `http://localhost:3001`。 |
| `NCM_LEVEL` | 否 | `/song/url/v1` 使用的音质等级，默认 `standard`。 |
| `FISH_API_KEY` | 否 | Fish Audio API Key；为空时不生成语音，接口仍可正常返回文字和歌曲。 |
| `FISH_VOICE_ID` | 否 | Fish Audio 语音 ID。 |
| `WEATHER_API_KEY` | 否 | OpenWeather API Key；为空时天气接口返回未配置提示。 |
| `WEATHER_CITY` | 否 | 天气查询城市，默认 `Beijing`。 |
| `PORT` | 否 | Claudio 服务端口，代码默认 `3000`；可在 `.env` 中手动添加。 |
| `FEISHU_APP_ID` / `FEISHU_APP_SECRET` | 否 | 当前模板中保留的后续集成配置。 |

## 启动方式

### 方式一：只启动 Claudio

适合你已经单独启动了本地 NCM API 的情况。

```bash
npm start
```

开发时可使用 Node.js watch 模式：

```bash
npm run dev
```

默认访问地址：

```text
http://localhost:3000
```

### 方式二：一键启动 Claudio 和 NCM Enhanced

如果项目根目录下存在 `ncm-enhanced-api/`，可以使用：

```bash
./start-local.sh
```

脚本会做这些事：

1. 检查 `node`、`npm`、`lsof` 是否可用。
2. 检查 Claudio 和 `ncm-enhanced-api` 是否已安装依赖，没有则自动执行 `npm install`。
3. 如果 3001 端口没有服务，启动 NCM Enhanced。
4. 如果 3000 端口没有服务，启动 Claudio。
5. 把日志写入 `.claudio-run/logs/`。

macOS 下也可以双击：

```text
start-local.command
```

### 停止服务

在前端“设置”页可以点击：

- 关闭 NCM Enhanced
- 关闭 Claudio

也可以在终端手动停止对应端口：

```bash
lsof -tiTCP:3000 -sTCP:LISTEN | xargs kill
lsof -tiTCP:3001 -sTCP:LISTEN | xargs kill
```

## 本地 NCM API

Claudio 不直接连接网易云音乐官方接口，而是依赖本机的 NCM API 服务。当前代码会调用这些接口：

- `/search`
- `/song/url/v1`
- `/song_url`
- `/lyric`

因此你的 NCM 服务需要兼容这些路径。`lib/ncm.js` 会优先尝试 `/song/url/v1`，如果没有拿到可播放 URL，再回退到 `/song_url`。

如果你使用 `start-local.sh`，推荐把兼容服务放在项目根目录的 `ncm-enhanced-api/` 下；该目录默认在 `.gitignore` 中，不会被提交。

## 使用方式

启动后打开 `http://localhost:3000`，底部有四个页面：

| 页面 | 用途 |
| --- | --- |
| 播放 | 当前歌曲、播放/暂停、下一首、进度条、音量。 |
| 聊天 | 和 DJ 对话，发送点歌或推荐请求。 |
| 品味 | 查看和编辑个人口味、作息、情绪规则。 |
| 设置 | 查看今日统计、定时广播状态、UPnP 设备、本地服务控制。 |

常用聊天示例：

```text
播放 周杰伦 晴天
放一首 陈奕迅 的歌
来点轻松的音乐
我想听爵士
下一首
现在放什么
```

## 用户资料

Claudio 的个性化主要来自 `user/` 目录：

- `taste.md`：喜欢的歌手、风格、语言、年代、禁忌等。
- `routines.md`：日常作息、通勤、工作、休息时段。
- `mood-rules.md`：不同情绪和场景下的推荐规则。
- `playlists.json`：结构化歌单资料。

这些文件会被 `lib/context.js` 拼入 Claude prompt。前端“品味”页可以编辑三个 Markdown 文件；如果想做更细的整理，也可以直接在编辑器里修改。

## API 参考

### 播放和聊天

#### `POST /api/chat`

发送一句自然语言给 DJ。

请求：

```json
{
  "message": "来点适合晚上放松的歌"
}
```

响应示例：

```json
{
  "say": "晚上适合慢一点的旋律，我给你来一首放松的。",
  "play": [
    {
      "id": "123",
      "source": "netease",
      "name": "Song Name",
      "artist": "Artist",
      "album": "Album",
      "duration": 240000,
      "cover": "https://...",
      "url": "https://..."
    }
  ],
  "reason": "evening_relax",
  "segue": "",
  "ttsUrl": "/tts/xxx.mp3"
}
```

#### `GET /api/now`

返回最近一次播放记录；没有记录时返回 `{ "playing": false }`。

#### `GET /api/next`

让 Claude 推荐下一首歌，并解析可播放 URL。

### 用户资料

#### `GET /api/taste`

读取 `taste.md`、`routines.md`、`mood-rules.md`。

#### `POST /api/taste`

更新一个用户资料文件。

请求：

```json
{
  "file": "taste.md",
  "content": "我喜欢 city pop、爵士和轻电子..."
}
```

允许的 `file`：

- `taste.md`
- `routines.md`
- `mood-rules.md`

### 设备投放

#### `GET /api/devices`

扫描局域网内 UPnP MediaRenderer 设备。

#### `POST /api/cast`

把当前歌曲 URL 推送到指定设备。

```json
{
  "deviceUrl": "http://192.168.1.10:1234/device.xml",
  "url": "https://music-url.example/song.mp3"
}
```

#### `POST /api/stop`

停止指定 UPnP 设备播放。

```json
{
  "deviceUrl": "http://192.168.1.10:1234/device.xml"
}
```

### 环境、统计和计划

#### `GET /api/weather`

返回 OpenWeather 查询结果；未配置 `WEATHER_API_KEY` 时返回错误说明。

#### `GET /api/stats`

返回当天播放次数、跳过次数、跳过率和对话次数。

#### `GET /api/scheduler`

返回定时广播状态和 slot 列表。

#### `GET /api/plan/today`

返回今天由定时广播生成的计划记录。

### 偏好设置

#### `GET /api/prefs`

读取 `prefs` 表中的所有键值。

#### `POST /api/prefs`

写入一个偏好项。

```json
{
  "key": "theme",
  "value": "dark"
}
```

### 本地服务控制

#### `POST /api/system/stop-ncm`

停止 `NCM_BASE_URL` 对应的本地监听端口。出于安全考虑，代码只允许停止 `localhost`、`127.0.0.1`、`::1` 上的服务。

#### `POST /api/system/stop-claudio`

停止当前 Claudio 服务。

### WebSocket

#### `ws://localhost:3000/stream`

用于接收定时广播等实时事件。当前事件类型：

```json
{
  "type": "auto-broadcast",
  "slot": "morning",
  "say": "...",
  "play": [],
  "reason": "..."
}
```

## 数据库

`lib/db.js` 会初始化本地 SQLite 数据库 `state.db`，包含四张表：

| 表 | 用途 |
| --- | --- |
| `plays` | 播放历史，包括歌曲、歌手、来源、播放时间、是否跳过。 |
| `messages` | 用户和 DJ 的近期对话。 |
| `plan` | 定时广播生成的每日推荐计划。 |
| `prefs` | 简单键值偏好。 |

这些数据是本地运行状态，默认不提交到 GitHub。

## Claude 返回格式

`lib/claude.js` 会通过 Claude CLI 调用一次性 prompt，并要求返回 JSON。推荐结果会被规范化为：

```json
{
  "say": "DJ 要说的话",
  "play": [
    {
      "name": "歌曲名",
      "artist": "歌手"
    }
  ],
  "reason": "推荐理由或标签",
  "segue": "串场文本"
}
```

`play` 可以是歌曲对象数组，也可以是一个字符串；代码会把字符串转成单首候选歌曲。随后 `lib/ncm.js` 会按歌曲名和歌手搜索并补充可播放 URL。

## 常见问题

### 页面打开了但没有歌

先确认本地 NCM API 是否运行在 `NCM_BASE_URL`，并且 `/search`、`/song/url/v1` 或 `/song_url` 能返回数据。也可以先在聊天页输入明确点歌指令，例如：

```text
播放 周杰伦 晴天
```

### Claude 没有响应

确认 `CLAUDE_PATH` 指向可执行的 Claude CLI，并且本机已经登录：

```bash
claude --version
```

如果 Claude 调用失败，服务端会返回 `claude_unavailable`，或在已有成功结果时回退到上一次成功推荐。

### 没有语音播报

`FISH_API_KEY` 为空时是正常情况，Claudio 会跳过语音合成。配置 Key 后，合成文件会缓存到 `cache/tts/`，相同文本不会重复请求。

### 天气显示未配置

设置 `WEATHER_API_KEY` 和 `WEATHER_CITY` 后重启服务。天气结果有 5 分钟缓存。

### UPnP 设备扫描不到

确认音响和电脑在同一局域网，并且设备支持 MediaRenderer。扫描结果会缓存 60 秒，必要时稍等后刷新设置页。

### 端口被占用

默认端口：

- Claudio：`3000`
- NCM API：`3001`

可以通过 `.env` 中的 `PORT` 修改 Claudio 端口。NCM 端口需要与你的本地 NCM API 服务配置保持一致，并同步更新 `NCM_BASE_URL`。

## 开发提示

项目没有引入构建步骤，前端静态文件由 Fastify 直接提供。改动后通常只需要重启服务或刷新浏览器。

建议的最小验证：

```bash
node --check server.js
npm start
```

如果要验证完整链路，需要同时具备：

1. Claude CLI 可用并已登录。
2. 本地 NCM API 正常运行。
3. 浏览器能访问 `http://localhost:3000`。

## 版本管理建议

建议提交到 GitHub 的内容：

- 源码：`server.js`、`lib/`、`public/`。
- 用户可编辑模板和默认资料：`prompts/`、`user/`。
- 文档和产品材料：`README.md`、`USER_MANUAL.md`、移交文档、PRD、结构图。
- 依赖锁定：`package-lock.json`。

不要提交：

- `.env`
- `node_modules/`
- `state.db*`
- `cache/`
- `.claudio-run/`
- 本地 NCM API 服务目录

## License

MIT
