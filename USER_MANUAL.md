# Claudio 使用手册

> 你的私人 AI DJ 电台 — 让音乐懂你

---

## 目录

1. [项目简介](#1-项目简介)
2. [环境要求](#2-环境要求)
3. [安装部署](#3-安装部署)
4. [配置说明](#4-配置说明)
5. [快速上手](#5-快速上手)
6. [功能详解](#6-功能详解)
7. [品味定制](#7-品味定制)
8. [API 参考](#8-api-参考)
9. [常见问题](#9-常见问题)
10. [架构说明](#10-架构说明)

---

## 1. 项目简介

Claudio（Claude + Radio）是一个本地运行的私人 AI DJ 电台。它结合 Claude AI 的智能理解能力与网易云音乐的海量曲库，根据你的音乐品味、当前时间和天气状况，为你智能推荐和播放音乐。

### 核心特性

- **AI 智能推荐** — 基于 Claude AI，理解你的自然语言描述，推荐最合适的音乐
- **品味学习** — 通过配置品味文件，让 DJ 越来越懂你
- **定时广播** — 早晨、中午、晚上自动推送音乐推荐
- **语音播报** — Fish Audio TTS 语音合成，DJ 会用声音和你打招呼
- **天气感知** — 根据天气状况调整推荐风格
- **设备投屏** — 支持 UPnP/DLNA 协议，推送到智能音箱
- **PWA 支持** — 可安装到手机桌面，像原生 App 一样使用

---

## 2. 环境要求

| 依赖 | 版本要求 | 说明 |
|------|----------|------|
| Node.js | 18+ | 运行环境 |
| Claude CLI | 最新版 | AI 大脑，需先登录 |
| NCM API | 本地部署 | 音乐数据源 |

### 可选依赖

| 服务 | 用途 | 是否必须 |
|------|------|----------|
| Fish Audio API | 语音播报 | 否，无则静默 |
| OpenWeather API | 天气感知 | 否，无则忽略天气 |
| UPnP 音箱 | 音乐投屏 | 否，无则本地播放 |

---

## 3. 安装部署

### 3.1 安装 Claudio

```bash
# 进入项目目录
cd "Claudio 项目"

# 安装依赖
npm install

# 复制配置模板
cp .env.example .env

# 编辑配置（填入你的 API Key）
nano .env
```

### 3.2 安装 Claude CLI

```bash
# 安装 Claude CLI
npm install -g @anthropic-ai/claude-code

# 登录（需要 Anthropic 账号）
claude login

# 验证安装
claude --version
```

### 3.3 部署网易云音乐 API

```bash
# 在项目目录下创建 ncm-api 文件夹
mkdir ncm-api && cd ncm-api

# 初始化并安装
npm init -y
npm install NeteaseCloudMusicApi

# 创建启动脚本
cat > server.js << 'EOF'
const NeteaseCloudMusicApi = require('NeteaseCloudMusicApi');
const http = require('http');

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const path = url.pathname.replace(/^\//, '');
  const params = Object.fromEntries(url.searchParams);

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  try {
    if (path && NeteaseCloudMusicApi[path]) {
      const result = await NeteaseCloudMusicApi[path](params);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result.body));
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
    }
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  }
});

server.listen(3001, () => {
  console.log('NCM API running at http://localhost:3001');
});
EOF

# 启动服务
node server.js
```

---

## 4. 配置说明

### 4.1 环境变量 (.env)

```bash
# Claude CLI 路径（默认从 PATH 查找）
CLAUDE_PATH=claude

# 网易云音乐 API 地址
NCM_BASE_URL=http://localhost:3001

# Fish Audio TTS（语音播报）
FISH_API_KEY=你的API密钥
FISH_VOICE_ID=你的语音ID

# OpenWeather（天气感知）
WEATHER_API_KEY=你的API密钥
WEATHER_CITY=ChangSha

# 服务端口
PORT=3000
```

### 4.2 获取 API Key

#### Fish Audio TTS（语音播报）

1. 访问 https://fish.audio
2. 注册账号并登录
3. 进入控制台获取 API Key
4. 在语音市场选择喜欢的音色，获取 Voice ID

#### OpenWeather（天气感知）

1. 访问 https://openweathermap.org/api
2. 注册免费账号
3. 进入 API Keys 页面获取 Key
4. 免费版每分钟可调用 60 次，足够使用

---

## 5. 快速上手

### 5.1 启动服务

需要同时运行两个服务：

```bash
# 终端 1：启动 NCM API
cd ncm-api
node server.js

# 终端 2：启动 Claudio
cd "Claudio 项目"
npm start
```

### 5.2 打开应用

浏览器访问 http://localhost:3000

你会看到四个标签页：
- 🎵 **播放** — 主播放器界面
- 💬 **聊天** — 与 DJ 对话
- 👤 **品味** — 管理音乐偏好
- ⚙️ **设置** — 系统配置与统计

### 5.3 第一次播放

在聊天框输入以下任意一种：

```
播放 周杰伦 晴天
放一首 陈奕迅 的歌
来点轻松的音乐
我想听爵士
```

DJ 会回复你并自动播放歌曲。

---

## 6. 功能详解

### 6.1 聊天点歌

在聊天视图中，你可以用自然语言和 DJ 交流：

| 说法 | 效果 |
|------|------|
| `播放 周杰伦 晴天` | 精确搜索并播放 |
| `放一首 轻音乐` | 搜索并播放 |
| `来点开心的歌` | AI 推荐并播放 |
| `我想听爵士` | AI 推荐并播放 |
| `下一首` / `跳过` | 切换到下一首 |
| `现在放什么` | 查询当前播放 |

### 6.2 播放器控制

播放器界面提供以下控制：

- **▶ 按钮** — 播放/暂停（首次点击会自动推荐一首歌）
- **⏭ 按钮** — 跳到下一首（AI 推荐）
- **进度条** — 点击可跳转到指定位置
- **音量滑块** — 调节音量大小
- **💬 按钮** — 快速切换到聊天视图

### 6.3 定时广播

Claudio 内置定时广播功能，会在以下时间自动推送音乐推荐：

| 时间 | 场景 | 推荐风格 |
|------|------|----------|
| 07:00 | 早晨 | 轻柔唤醒 |
| 12:00 | 中午 | 轻松午餐 |
| 19:00 | 晚上 | 放松切换 |

广播会通过 WebSocket 实时推送到所有打开的页面。

### 6.4 天气感知

配置 OpenWeather API 后，Claudio 会：

- 在播放器头部显示当前天气（如 "18°C 阴，多云"）
- 将天气信息注入 AI 上下文，影响推荐风格
- 根据天气匹配情绪规则（如下雨天推荐爵士）

### 6.5 语音播报

配置 Fish Audio TTS 后，DJ 的每句话都会被合成为语音：

- 聊天回复时自动播放语音
- 定时广播时包含语音播报
- 语音文件会缓存在 `cache/tts/` 目录

### 6.6 设备投屏

如果你的网络中有支持 UPnP/DLNA 的智能音箱：

1. 进入 **设置** 页面
2. 点击 **刷新** 按钮发现设备
3. 点击设备旁的 **推送** 按钮
4. 当前播放的音乐会推送到音箱

支持的设备包括：Sonos、小米音箱、华为音箱等支持 DLNA 的设备。

---

## 7. 品味定制

### 7.1 品味文件说明

Claudio 通过三个 Markdown 文件了解你的音乐偏好：

#### taste.md — 音乐口味

```markdown
# 我的音乐口味

## 喜欢的风格
- 华语流行、独立民谣、轻爵士
- 90 年代经典摇滚
- 日系 City Pop

## 喜欢的歌手
- 周杰伦、陈奕迅、李宗盛
- 邓紫棋、林宥嘉
- 落日飞车、告五人

## 不喜欢的
- 喊麦、DJ 舞曲
- 过于悲伤的歌
```

#### routines.md — 每日作息

```markdown
# 我的日常

- 07:30 起床，需要轻柔唤醒
- 09:00-12:00 工作，需要专注白噪音或轻音乐
- 12:00-13:00 午餐，放松的流行乐
- 14:00-18:00 工作，纯音乐优先
- 19:00-21:00 放松时间，随心情
- 22:00 以后，助眠音乐
```

#### mood-rules.md — 情绪规则

```markdown
# 情绪规则

- 下雨天 → 爵士、钢琴曲
- 晴天户外 → 轻快独立、民谣
- 深夜独处 → Lo-fi、Ambient
- 运动时 → 电子、节奏感强的
- 心情低落 → 治愈系、不悲伤的
- 朋友聚会 → 欢快流行、派对音乐
```

### 7.2 编辑品味

有两种方式编辑品味文件：

#### 方式一：网页界面

1. 进入 **👤 品味** 标签页
2. 点击对应区域的 **编辑** 按钮
3. 在弹出的编辑框中修改内容
4. 点击确定保存

#### 方式二：直接编辑文件

```bash
# 编辑音乐口味
nano user/taste.md

# 编辑作息时间
nano user/routines.md

# 编辑情绪规则
nano user/mood-rules.md
```

修改后无需重启服务，下次对话时会自动读取最新内容。

---

## 8. API 参考

### 8.1 聊天与播放

#### POST /api/chat

发送消息给 DJ。

**请求：**
```json
{
  "message": "播放 周杰伦 晴天"
}
```

**响应：**
```json
{
  "say": "好的，为你播放 晴天",
  "play": [
    {
      "id": "123456",
      "name": "晴天",
      "artist": "周杰伦",
      "url": "http://..."
    }
  ],
  "reason": "用户点播",
  "ttsUrl": "/tts/abc123.mp3"
}
```

#### GET /api/now

获取当前播放的歌曲。

**响应：**
```json
{
  "id": 1,
  "song_id": "123456",
  "song_name": "晴天",
  "artist": "周杰伦",
  "played_at": "2026-05-08 10:30:00",
  "skipped": 0
}
```

#### GET /api/next

获取 AI 推荐的下一首歌。

**响应：** 同 `/api/chat`

### 8.2 用户品味

#### GET /api/taste

获取所有品味文件内容。

**响应：**
```json
{
  "taste": "# 我的音乐口味\n...",
  "routines": "# 我的日常\n...",
  "mood-rules": "# 情绪规则\n..."
}
```

#### POST /api/taste

更新品味文件。

**请求：**
```json
{
  "file": "taste.md",
  "content": "# 新的口味内容\n..."
}
```

**文件名可选值：** `taste.md`、`routines.md`、`mood-rules.md`

### 8.3 天气与统计

#### GET /api/weather

获取当前天气。

**响应：**
```json
{
  "city": "Changsha",
  "temp": 18,
  "feels_like": 18,
  "description": "阴，多云",
  "icon": "04d",
  "humidity": 80,
  "wind": 4
}
```

#### GET /api/stats

获取今日播放统计。

**响应：**
```json
{
  "totalPlays": 15,
  "skipped": 3,
  "skipRate": 20,
  "totalMessages": 8
}
```

### 8.4 设备与投屏

#### GET /api/devices

发现局域网中的 UPnP 设备。

**响应：**
```json
{
  "devices": [
    {
      "name": "小米音箱",
      "location": "http://192.168.1.100:8080/description.xml"
    }
  ],
  "count": 1
}
```

#### POST /api/cast

推送音频到设备。

**请求：**
```json
{
  "deviceUrl": "http://192.168.1.100:8080/description.xml",
  "url": "http://music.126.net/..."
}
```

#### POST /api/stop

停止设备播放。

**请求：**
```json
{
  "deviceUrl": "http://192.168.1.100:8080/description.xml"
}
```

### 8.5 系统

#### GET /api/scheduler

获取定时广播状态。

**响应：**
```json
{
  "running": true,
  "jobs": 3,
  "slots": ["morning", "noon", "evening"]
}
```

#### GET /api/prefs

获取所有偏好设置。

#### POST /api/prefs

更新偏好设置。

**请求：**
```json
{
  "key": "tts_enabled",
  "value": "true"
}
```

### 8.6 WebSocket

连接 `ws://localhost:3000/stream` 接收实时事件。

**事件格式：**
```json
{
  "type": "auto-broadcast",
  "slot": "morning",
  "say": "早上好！今天天气不错...",
  "play": [...],
  "ttsUrl": "/tts/..."
}
```

---

## 9. 常见问题

### Q: 启动后无法播放音乐？

**A:** 检查以下几点：

1. NCM API 是否运行在 3001 端口？
   ```bash
   curl http://localhost:3001/search?keywords=test
   ```
   如果返回错误，说明 NCM API 未启动。

2. Claude CLI 是否已登录？
   ```bash
   claude --version
   ```
   如果提示未安装或未登录，请先执行 `claude login`。

### Q: 点击播放按钮没有反应？

**A:** 首次点击播放按钮时，如果没有加载过歌曲，它会自动请求 AI 推荐一首。这需要几秒钟时间。如果仍然没有反应：

1. 打开浏览器开发者工具（F12）
2. 查看 Console 标签页是否有错误信息
3. 检查网络请求是否正常

### Q: 天气信息不显示？

**A:** 检查 `.env` 文件中的天气配置：

```bash
WEATHER_API_KEY=你的Key
WEATHER_CITY=你的城市
```

注意：城市名需要用英文，如 `ChangSha`、`Beijing`、`Shanghai`。

### Q: 语音播报没有声音？

**A:** 检查 Fish Audio 配置：

```bash
FISH_API_KEY=你的Key
FISH_VOICE_ID=你的音色ID
```

可以在 https://fish.audio 试听不同音色并获取 ID。

### Q: 如何修改定时广播时间？

**A:** 编辑 `lib/scheduler.js` 文件中的 cron 表达式：

```javascript
// 格式: 分 时 日 月 周
cron.schedule('0 7 * * *', ...)   // 07:00
cron.schedule('0 12 * * *', ...)  // 12:00
cron.schedule('0 19 * * *', ...)  // 19:00
```

修改后需要重启服务。

### Q: 数据库在哪里？

**A:** SQLite 数据库文件位于项目根目录的 `state.db`。它会自动创建，包含以下表：

- `plays` — 播放记录
- `messages` — 对话记录
- `plan` — 定时广播计划
- `prefs` — 偏好设置

### Q: 如何清除播放记录？

**A:** 删除数据库文件并重启：

```bash
rm -f state.db state.db-shm state.db-wal
npm start
```

---

## 10. 架构说明

### 10.1 系统架构

```
┌─────────────────────────────────────────────┐
│  PWA Frontend (Vanilla HTML/CSS/JS)         │
│  Player / Chat / Profile / Settings         │
└──────────────────┬──────────────────────────┘
                   │ HTTP + WebSocket
┌──────────────────▼──────────────────────────┐
│  Fastify Server (server.js)                 │
│  REST API + WebSocket broadcast             │
├─────────────────────────────────────────────┤
│  Router │ Context │ Claude │ NCM │ TTS      │
│         │ Assembler│ Adapter│ API │ Engine   │
├─────────────────────────────────────────────┤
│  Scheduler │ UPnP │ Weather │ SQLite DB     │
└─────────────────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────┐
│  External Services                          │
│  Claude CLI │ NCM API │ Fish Audio │ Weather│
└─────────────────────────────────────────────┘
```

### 10.2 核心模块

| 模块 | 文件 | 职责 |
|------|------|------|
| 路由 | `lib/router.js` | 识别用户意图，分发到对应处理器 |
| 上下文 | `lib/context.js` | 组装 6 片段 Prompt 发送给 AI |
| Claude | `lib/claude.js` | 调用 Claude CLI，解析 JSON 响应 |
| NCM | `lib/ncm.js` | 网易云音乐 API 封装，含 URL 缓存 |
| TTS | `lib/tts.js` | Fish Audio 语音合成，含文件缓存 |
| 调度 | `lib/scheduler.js` | 定时广播（早/午/晚） |
| UPnP | `lib/upnp.js` | 设备发现与音频推送 |
| 天气 | `lib/weather.js` | OpenWeather API，5 分钟缓存 |
| 数据库 | `lib/db.js` | SQLite 数据层 |

### 10.3 Prompt 组装（6 片段）

每次 AI 调用时，Context 模块会组装以下片段：

```
[SYSTEM]     — DJ 人设 prompt
[USER TASTE] — 音乐口味偏好
[ROUTINES]   — 每日作息时间
[MOOD RULES] — 情绪场景规则
[ENVIRONMENT]— 当前时间 + 天气
[MEMORY]     — 最近播放 + 对话历史
[INPUT]      — 用户输入
[TRACE]      — 触发来源追踪
```

### 10.4 数据流

```
用户输入 → Router → Context → Claude → NCM → TTS → 响应
                ↓
           SQLite (记录播放/对话)
```

### 10.5 缓存策略

| 资源 | 缓存方式 | 过期时间 |
|------|----------|----------|
| NCM 歌曲 URL | 内存 Map | 9 分钟 |
| TTS 音频 | 文件 (MD5 命名) | 永久 |
| 天气数据 | 内存变量 | 5 分钟 |
| UPnP 设备 | 内存数组 | 60 秒 |

---

## 附录：快捷命令速查

| 说法 | 效果 |
|------|------|
| `播放 歌名` | 搜索并播放 |
| `放一首 歌手 的歌` | 搜索并播放 |
| `来点 风格 的音乐` | AI 推荐 |
| `我想听 歌手` | AI 推荐 |
| `下一首` / `跳过` | 切换下一首 |
| `现在放什么` | 查询当前播放 |
| `推荐一首歌` | AI 自由推荐 |
| `来点轻松的` | 场景推荐 |
| `下雨天听什么好` | 场景推荐 |

---

> Claudio — 让音乐懂你
