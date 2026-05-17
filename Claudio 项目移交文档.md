# Claudio 项目移交文档

> 版本：v0.1.0 | 最后更新：2026-05-08

---

## 目录

1. [项目概述](#1-项目概述)
2. [开发流程详情](#2-开发流程详情)
3. [技术栈](#3-技术栈)
4. [整体架构](#4-整体架构)
5. [目录结构](#5-目录结构)
6. [核心模块详解](#6-核心模块详解)
7. [前端架构](#7-前端架构)
8. [配置说明](#8-配置说明)
9. [API 接口文档](#9-api-接口文档)
10. [数据库设计](#10-数据库设计)
11. [已知问题与待办事项](#11-已知问题与待办事项)
12. [开发环境搭建](#12-开发环境搭建)

---

## 1. 项目概述

### 1.1 项目名称

**Claudio**（Claude + Radio）— 私人 AI DJ 电台

### 1.2 项目目标

构建一个本地运行的私人 AI DJ 电台，结合 Claude AI 的智能理解能力与网易云音乐的海量曲库，根据用户的音乐品味、当前时间和天气状况，智能推荐和播放音乐。

### 1.3 核心功能

| 功能 | 描述 |
|------|------|
| AI 智能推荐 | 基于 Claude AI，理解自然语言描述，推荐最合适的音乐 |
| 品味学习 | 通过配置品味文件，让 DJ 越来越懂用户 |
| 定时广播 | 早晨(07:00)、中午(12:00)、晚上(19:00)自动推送音乐推荐 |
| 语音播报 | Fish Audio TTS 语音合成，DJ 会用声音和用户打招呼 |
| 天气感知 | 根据天气状况调整推荐风格 |
| 设备投屏 | 支持 UPnP/DLNA 协议，推送到智能音箱 |
| PWA 支持 | 可安装到手机桌面，像原生 App 一样使用 |

### 1.4 项目时间线

| 里程碑 | 时间 | 内容 | 状态 |
|--------|------|------|------|
| M1 | Day 1 | 后端核心（路由/上下文/Claude/NCM/SQLite） | ✅ 完成 |
| M2 | Day 2 | TTS + UPnP + 定时广播 | ✅ 完成 |
| M3 | Day 3 | PWA 前端 + Service Worker | ✅ 完成 |
| M4 | Day 4 | 天气注入 + Profile 视图 + 统计 | ✅ 完成 |
| M5 | Day 5 | 错误处理 + 文档 + 验证 | ✅ 完成 |

---

## 2. 开发流程详情

### 2.1 M1：后端核心（第1阶段）

**目标**：搭建 Claudio 的后端核心 — 一个本地 Node.js 服务器，作为私人 AI DJ。

#### 2.1.1 项目脚手架

**创建文件**：
- `package.json` — 项目配置，ESM 模块
- `.gitignore` — 忽略 node_modules、.env、state.db
- `.env.example` — 环境变量模板

**安装依赖**：
```bash
npm install fastify better-sqlite3 dotenv @fastify/websocket
```

**目录结构初始化**：
```bash
mkdir -p lib prompts user cache/tts
```

#### 2.1.2 数据库层 (`lib/db.js`)

使用 better-sqlite3 创建 SQLite 数据库，包含 4 张表：

```sql
-- 播放记录
CREATE TABLE plays (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  song_id TEXT NOT NULL,
  song_name TEXT NOT NULL,
  artist TEXT NOT NULL,
  album TEXT,
  source TEXT DEFAULT 'manual',
  played_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  skipped INTEGER DEFAULT 0
);

-- 对话记录
CREATE TABLE messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 定时广播计划
CREATE TABLE plan (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slot TEXT NOT NULL,
  songs_json TEXT,
  reason TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 偏好设置
CREATE TABLE prefs (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
```

**导出函数**：
- `initDb()` — 初始化数据库
- `getDb()` — 获取数据库实例
- `recordPlay(song, source)` — 记录播放
- `getRecentPlays(limit)` — 获取最近播放
- `saveMessage(role, content)` — 保存对话
- `getRecentMessages(limit)` — 获取最近对话
- `savePlan(slot, songs, reason)` — 保存计划
- `getTodayPlan()` — 获取今日计划
- `getPref(key)` / `setPref(key, value)` — 偏好设置

#### 2.1.3 NCM API 封装 (`lib/ncm.js`)

封装网易云音乐 API，提供以下功能：

```javascript
// 搜索歌曲
export async function search(keyword, limit = 5)

// 获取歌曲 URL（带 9 分钟缓存）
export async function getUrl(songId)

// 获取歌词
export async function getLyric(songId)
```

**缓存策略**：使用 Map 存储歌曲 URL，9 分钟过期（网易云 URL 有效期 10 分钟，留 1 分钟安全边际）。

#### 2.1.4 Claude 适配器 (`lib/claude.js`)

通过子进程调用 Claude CLI：

```javascript
export async function ask(prompt, timeout = 30000) {
  const { stdout } = await execFileAsync(claudePath, [
    '-p', prompt,
    '--output', 'json',
    '--max-turns', '1',
  ], { timeout });
  return parseResponse(stdout);
}
```

**降级策略**：
- 超时或错误时，使用上次成功的结果
- 无历史结果时，返回默认提示

**响应解析**：
1. 尝试直接 JSON 解析
2. 尝试从文本中提取 JSON
3. 降级：将整个文本作为 `say` 字段

#### 2.1.5 Prompt 组装 (`lib/context.js`)

**6 片段组装架构**：

```
[SYSTEM]      — DJ 人设 prompt (prompts/dj-persona.md)
[USER TASTE]  — 音乐口味偏好 (user/taste.md)
[ROUTINES]    — 每日作息时间 (user/routines.md)
[MOOD RULES]  — 情绪场景规则 (user/mood-rules.md)
[ENVIRONMENT] — 当前时间 + 天气
[MEMORY]      — 最近播放(20条) + 对话历史(10条)
[INPUT]       — 用户输入
[TRACE]       — 触发来源追踪
```

**环境上下文**：
```javascript
function getEnvironmentContext() {
  // 时间段判断：深夜/早晨/上午/中午/下午/晚上
  // 天气信息注入（如果可用）
  return `当前时间: ${time} (${timeOfDay})\n天气: ${weather}`;
}
```

#### 2.1.6 意图路由 (`lib/router.js`)

使用正则表达式识别用户意图：

```javascript
const PLAY_PATTERN = /^(?:播放|放一首?|来一首?|play)\s*(.+)/i;
const NEXT_PATTERN = /^(?:下一首?|跳过|skip|换一首?|next)$/i;
const NOW_PATTERN = /^(?:现在放什么|当前播放|正在播放|now playing|now)$/i;
```

**路由逻辑**：
1. 匹配播放命令 → `play_direct`
2. 匹配控制命令 → `next`
3. 匹配查询命令 → `now`
4. 默认 → `claude`（交给 AI 处理）

#### 2.1.7 服务端入口 (`server.js`)

使用 Fastify 框架，注册所有模块和路由：

```javascript
// 模块配置
ncm.configure({ baseUrl: process.env.NCM_BASE_URL });
claude.configure({ path: process.env.CLAUDE_PATH || 'claude' });

// 初始化
db.initDb();

// 注册插件
await app.register(fastifyStatic, { root: join(__dirname, 'public') });
await app.register(fastifyWebsocket);

// 启动
await app.listen({ port: 3000, host: '127.0.0.1' });
```

### 2.2 M2：TTS + UPnP + 定时广播（第2阶段）

**目标**：添加语音播报、设备投屏和定时广播功能。

#### 2.2.1 TTS 语音合成 (`lib/tts.js`)

使用 Fish Audio API 实现语音合成：

```javascript
export async function synthesize(text) {
  // 1. 计算文本 MD5 哈希作为缓存键
  const hash = createHash('md5').update(text).digest('hex');
  
  // 2. 检查缓存
  if (existsSync(filePath)) return { url: `/tts/${filename}`, cached: true };
  
  // 3. 调用 Fish Audio API
  const res = await fetch('https://api.fish.audio/v1/tts', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({ text, reference_id: voiceId }),
  });
  
  // 4. 保存到缓存
  writeFileSync(filePath, buffer);
  return { url: `/tts/${filename}`, cached: false };
}
```

**缓存策略**：使用 MD5 哈希命名文件，相同文本不会重复合成。

#### 2.2.2 UPnP 设备投屏 (`lib/upnp.js`)

实现 SSDP 设备发现和音频推送：

```javascript
// 发现设备
export async function discover() {
  // 发送 M-SEARCH 到 239.255.255.250:1900
  // 解析设备描述 XML
  // 返回设备列表
}

// 推送音频
export async function play(deviceUrl, audioUrl) {
  // SOAP 调用 SetAVTransportURI
  // SOAP 调用 Play
}

// 停止播放
export async function stop(deviceUrl) {
  // SOAP 调用 Stop
}
```

**设备缓存**：60 秒缓存设备列表，避免频繁发现。

#### 2.2.3 定时广播 (`lib/scheduler.js`)

使用 node-cron 实现定时任务：

```javascript
// 早晨 07:00
cron.schedule('0 7 * * *', () => {
  triggerBroadcast('morning', '早上好！推荐一些适合早晨的音乐。');
}, { timezone: 'Asia/Shanghai' });

// 中午 12:00
cron.schedule('0 12 * * *', () => {
  triggerBroadcast('noon', '中午了，推荐一些轻松的午餐音乐。');
}, { timezone: 'Asia/Shanghai' });

// 晚上 19:00
cron.schedule('0 19 * * *', () => {
  triggerBroadcast('evening', '晚上好，推荐一些放松的音乐。');
}, { timezone: 'Asia/Shanghai' });
```

**广播流程**：
1. 组装上下文 → 2. 调用 Claude → 3. TTS 合成 → 4. 保存计划 → 5. WebSocket 广播

### 2.3 M3：PWA 前端（第3阶段）

**目标**：构建渐进式 Web 应用，支持离线使用和安装到桌面。

#### 2.3.1 前端文件结构

```
public/
├── index.html          # 主页面
├── manifest.json       # PWA 清单
├── sw.js              # Service Worker
├── css/
│   └── style.css      # 样式
├── js/
│   ├── app.js         # 主控制器
│   ├── api.js         # HTTP 客户端
│   ├── player.js      # 播放器
│   └── chat.js        # 聊天视图
└── icons/
    ├── icon-192.png   # 图标
    └── icon-512.png
```

#### 2.3.2 四视图架构

**播放器视图 (Player)**：
- 专辑封面旋转动画
- 进度条（点击跳转）
- 播放/暂停/下一首控制
- 音量滑块
- 天气徽章

**聊天视图 (Chat)**：
- 消息气泡（用户/DJ）
- 播放按钮（点击播放推荐歌曲）
- TTS 语音播放
- WebSocket 实时接收广播

**品味视图 (Profile)**：
- 显示/编辑音乐口味
- 显示/编辑每日作息
- 显示/编辑情绪规则

**设置视图 (Settings)**：
- 今日统计（播放次数、跳过率、对话次数）
- 定时广播状态
- UPnP 设备列表

#### 2.3.3 Service Worker 策略

```javascript
// 静态资源：Cache-First
// API 请求：Network-First
// TTS 音频：Cache-First
```

### 2.4 M4：天气 + Profile + Stats（第4阶段）

**目标**：添加天气感知、品味管理和播放统计。

#### 2.4.1 天气模块 (`lib/weather.js`)

```javascript
export async function getWeather() {
  // 5 分钟缓存
  if (cached && Date.now() - cacheTime < 5 * 60 * 1000) return cached;
  
  // 调用 OpenWeather API
  const url = `https://api.openweathermap.org/data/2.5/weather?q=${city}&appid=${apiKey}&units=metric&lang=zh_cn`;
  
  // 返回：city, temp, feels_like, description, icon, humidity, wind
}
```

#### 2.4.2 天气注入

在 `context.js` 中将天气信息注入 `[ENVIRONMENT]` 片段：

```javascript
const w = weather.getCachedWeather();
if (w && !w.error) {
  env += `\n天气: ${w.city} ${w.temp}°C ${w.description}，湿度 ${w.humidity}%`;
}
```

#### 2.4.3 新增 API

- `GET /api/weather` — 获取天气
- `GET /api/stats` — 获取统计
- `POST /api/taste` — 更新品味文件

### 2.5 M5：错误处理 + 文档（第5阶段）

**目标**：增强健壮性，完善文档。

#### 2.5.1 输入验证

```javascript
// 消息长度限制
if (message.length > 500) return reply.code(400).send({ error: 'message too long' });

// 内容长度限制
if (content.length > 5000) return reply.code(400).send({ error: 'content too long' });

// 文件名白名单
const allowed = ['taste.md', 'routines.md', 'mood-rules.md'];
if (!allowed.includes(file)) return reply.code(400).send({ error: 'invalid file name' });
```

#### 2.5.2 全局错误处理

```javascript
app.setErrorHandler((err, req, reply) => {
  app.log.error(err);
  reply.code(500).send({ error: 'Internal server error' });
});
```

---

## 3. 技术栈

### 3.1 后端

| 技术 | 版本 | 用途 |
|------|------|------|
| Node.js | 18+ | 运行环境 |
| Fastify | 5.x | HTTP 框架 |
| better-sqlite3 | 12.x | SQLite 数据库 |
| node-cron | 4.x | 定时任务 |
| xml2js | 0.6.x | XML 解析（UPnP） |
| dotenv | 17.x | 环境变量 |

### 3.2 前端

| 技术 | 用途 |
|------|------|
| Vanilla HTML/CSS/JS | 原生开发，无框架依赖 |
| PWA (Service Worker) | 离线支持、可安装 |
| WebSocket | 实时通信 |

### 3.3 外部服务

| 服务 | 用途 | 状态 |
|------|------|------|
| Claude CLI | AI 大脑 | ✅ 可用 |
| Fish Audio API | 语音合成 | ✅ 可用 |
| OpenWeather API | 天气数据 | ✅ 可用 |
| NeteaseCloudMusic API | 音乐数据源 | ❌ 已失效 |
| UPnP/DLNA | 设备投屏 | ✅ 可用 |

### 3.4 开发工具

| 工具 | 用途 |
|------|------|
| Git | 版本控制 |
| npm | 包管理 |
| Claude Code | AI 辅助开发 |

---

## 4. 整体架构

### 4.1 系统架构图

```
┌─────────────────────────────────────────────────────────────┐
│                    PWA Frontend Layer                        │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐       │
│  │  Player  │ │   Chat   │ │  Profile │ │ Settings │       │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘       │
│       └────────────┼────────────┼────────────┘              │
│                    │ HTTP + WebSocket                        │
└────────────────────┼────────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────────┐
│                    Fastify Server                            │
│  ┌─────────────────────────────────────────────────────┐    │
│  │                    API Routes                        │    │
│  │  /api/chat  /api/now  /api/next  /api/taste  ...   │    │
│  └─────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────┐    │
│  │                  Core Modules                        │    │
│  │  ┌────────┐ ┌─────────┐ ┌────────┐ ┌──────────┐    │    │
│  │  │ Router │ │ Context │ │ Claude │ │   NCM    │    │    │
│  │  └────────┘ └─────────┘ └────────┘ └──────────┘    │    │
│  │  ┌────────┐ ┌─────────┐ ┌────────┐ ┌──────────┐    │    │
│  │  │  TTS   │ │   UPnP  │ │Weather │ │Scheduler │    │    │
│  │  └────────┘ └─────────┘ └────────┘ └──────────┘    │    │
│  └─────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────┐    │
│  │                   SQLite DB                          │    │
│  │        plays | messages | plan | prefs               │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────────┐
│                  External Services                           │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐       │
│  │ Claude   │ │ NCM API  │ │Fish Audio│ │ Weather  │       │
│  │  CLI     │ │(已失效)  │ │   TTS    │ │   API    │       │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘       │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 数据流

```
用户输入
    │
    ▼
┌─────────┐    ┌─────────┐    ┌─────────┐
│ Router  │───▶│ Context │───▶│ Claude  │
│ 意图识别 │    │ Prompt  │    │  AI    │
└─────────┘    │ 组装    │    │ 推理   │
               └─────────┘    └────┬────┘
                    ▲              │
                    │              ▼
               ┌────┴────┐   ┌─────────┐
               │ User    │   │  NCM    │
               │ Corpus  │   │ 搜索    │
               │ 品味文件 │   └────┬────┘
               └─────────┘        │
                                  ▼
                            ┌─────────┐
                            │  TTS    │
                            │ 语音合成 │
                            └────┬────┘
                                 │
                                 ▼
                            ┌─────────┐
                            │ 响应    │
                            │ say+play│
                            └─────────┘
```

### 4.3 Prompt 组装架构

```
┌─────────────────────────────────────────────────────────────┐
│                    Prompt Fragments                          │
├─────────────────────────────────────────────────────────────┤
│ [SYSTEM]      DJ 人设 (prompts/dj-persona.md)               │
├─────────────────────────────────────────────────────────────┤
│ [USER TASTE]  音乐口味 (user/taste.md)                      │
├─────────────────────────────────────────────────────────────┤
│ [ROUTINES]    每日作息 (user/routines.md)                   │
├─────────────────────────────────────────────────────────────┤
│ [MOOD RULES]  情绪规则 (user/mood-rules.md)                 │
├─────────────────────────────────────────────────────────────┤
│ [ENVIRONMENT] 当前时间 + 天气                                │
├─────────────────────────────────────────────────────────────┤
│ [MEMORY]      最近播放(20) + 对话历史(10)                    │
├─────────────────────────────────────────────────────────────┤
│ [INPUT]       用户输入                                       │
├─────────────────────────────────────────────────────────────┤
│ [TRACE]       触发来源 (user/scheduler)                      │
└─────────────────────────────────────────────────────────────┘
```

---

## 5. 目录结构

```
claudio/
├── server.js                # 入口文件，Fastify 服务器
├── package.json             # 项目配置
├── .env                     # 环境变量（不提交）
├── .env.example             # 环境变量模板
├── .gitignore               # Git 忽略规则
├── state.db                 # SQLite 数据库（不提交）
├── state.db-shm             # SQLite 共享内存
├── state.db-wal             # SQLite 预写日志
│
├── lib/                     # 核心模块
│   ├── db.js                # 数据库层
│   ├── router.js            # 意图路由
│   ├── context.js           # Prompt 组装
│   ├── claude.js            # Claude CLI 适配器
│   ├── ncm.js               # 网易云音乐 API
│   ├── tts.js               # Fish Audio TTS
│   ├── upnp.js              # UPnP 设备投屏
│   ├── scheduler.js         # 定时广播
│   └── weather.js           # 天气模块
│
├── prompts/                 # Prompt 模板
│   └── dj-persona.md        # DJ 人设
│
├── user/                    # 用户品味文件
│   ├── taste.md             # 音乐口味
│   ├── routines.md          # 每日作息
│   ├── mood-rules.md        # 情绪规则
│   └── playlists.json       # 播放列表（预留）
│
├── public/                  # PWA 前端
│   ├── index.html           # 主页面
│   ├── manifest.json        # PWA 清单
│   ├── sw.js                # Service Worker
│   ├── css/
│   │   └── style.css        # 样式
│   ├── js/
│   │   ├── app.js           # 主控制器
│   │   ├── api.js           # HTTP 客户端
│   │   ├── player.js        # 播放器
│   │   └── chat.js          # 聊天视图
│   └── icons/
│       ├── icon-192.png     # 图标 192x192
│       └── icon-512.png     # 图标 512x512
│
├── cache/                   # 缓存目录
│   └── tts/                 # TTS 音频缓存
│
├── ncm-api/                 # 网易云音乐 API（需单独部署）
│   └── server.js
│
├── README.md                # 项目说明
├── USER_MANUAL.md           # 用户手册
└── PROJECT_HANDOVER.md      # 本文档
```

---

## 6. 核心模块详解

### 6.1 Router 模块 (`lib/router.js`)

**职责**：识别用户意图，分发到对应处理器。

**支持的命令**：

| 命令 | 模式 | 路由类型 |
|------|------|----------|
| 播放 | `播放/放一首/来一首/play + 关键词` | `play_direct` |
| 下一首 | `下一首/跳过/skip/next` | `next` |
| 查询 | `现在放什么/当前播放/now` | `now` |
| 自然语言 | 其他所有输入 | `claude` |

### 6.2 Context 模块 (`lib/context.js`)

**职责**：组装 6 片段 Prompt 发送给 Claude AI。

**关键函数**：
```javascript
export async function assemble({ input, db, ncmResults, trigger })
```

**片段组装顺序**：
1. SYSTEM — DJ 人设
2. USER TASTE — 音乐口味
3. ROUTINES — 每日作息
4. MOOD RULES — 情绪规则
5. ENVIRONMENT — 时间 + 天气
6. MEMORY — 播放历史 + 对话历史
7. INPUT — 用户输入
8. TRACE — 触发来源

### 6.3 Claude 模块 (`lib/claude.js`)

**职责**：调用 Claude CLI，解析 JSON 响应。

**调用方式**：
```bash
claude -p "prompt内容" --output json --max-turns 1
```

**降级策略**：
1. 超时(30s) → 使用上次成功结果
2. 无历史 → 返回默认提示

### 6.4 NCM 模块 (`lib/ncm.js`)

**职责**：封装网易云音乐 API。

**⚠️ 当前状态**：歌曲 URL 接口已失效，需要替换音乐源。

**缓存策略**：Map 存储，9 分钟过期。

### 6.5 TTS 模块 (`lib/tts.js`)

**职责**：Fish Audio 语音合成。

**缓存策略**：MD5 哈希命名文件，永久缓存。

### 6.6 UPnP 模块 (`lib/upnp.js`)

**职责**：UPnP/DLNA 设备发现和音频推送。

**协议**：
- SSDP M-SEARCH 设备发现
- SOAP 控制（Play/Stop/SetAVTransportURI）

### 6.7 Scheduler 模块 (`lib/scheduler.js`)

**职责**：定时广播。

**时间表**：
- 07:00 — 早晨广播
- 12:00 — 中午广播
- 19:00 — 晚上广播

### 6.8 Weather 模块 (`lib/weather.js`)

**职责**：获取天气信息。

**缓存策略**：内存缓存，5 分钟过期。

---

## 7. 前端架构

### 7.1 视图切换

```javascript
function showView(name) {
  // 1. 隐藏所有视图
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  
  // 2. 显示目标视图
  document.getElementById(`view-${name}`)?.classList.add('active');
  
  // 3. 更新导航栏状态
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.querySelector(`.nav-btn[data-view="${name}"]`)?.classList.add('active');
  
  // 4. 加载视图数据
  if (view === 'profile') loadProfile();
  if (view === 'settings') loadSettings();
}
```

### 7.2 播放器控制

```javascript
// 播放/暂停
export function togglePlay() {
  if (!audio.src || audio.src === location.href) {
    // 无歌曲时自动推荐
    api.getNext().then(result => playSong(result.play[0]));
    return;
  }
  audio.paused ? audio.play() : audio.pause();
}

// 播放歌曲
export function playSong(song) {
  audio.src = song.url;
  audio.play();
  document.getElementById('song-title').textContent = song.name;
}
```

### 7.3 WebSocket 实时通信

```javascript
export function connectWS(onMessage) {
  ws = new WebSocket(`ws://${location.host}/stream`);
  ws.onmessage = (e) => onMessage(JSON.parse(e.data));
  ws.onclose = () => setTimeout(() => connectWS(onMessage), 3000); // 自动重连
}
```

### 7.4 Service Worker 缓存策略

```javascript
// API 请求：Network-First
if (url.pathname.startsWith('/api/')) {
  e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
}

// TTS 音频：Cache-First
if (url.pathname.startsWith('/tts/')) {
  e.respondWith(caches.match(e.request).then(cached => cached || fetch(e.request)));
}

// 静态资源：Cache-First
e.respondWith(caches.match(e.request).then(cached => cached || fetch(e.request)));
```

---

## 8. 配置说明

### 8.1 环境变量 (.env)

```bash
# Claude CLI 路径
CLAUDE_PATH=claude

# 网易云音乐 API
NCM_BASE_URL=http://localhost:3001

# Fish Audio TTS
FISH_API_KEY=your_api_key
FISH_VOICE_ID=your_voice_id

# OpenWeather
WEATHER_API_KEY=your_api_key
WEATHER_CITY=ChangSha

# 服务端口
PORT=3000
```

### 8.2 品味文件

#### taste.md — 音乐口味

```markdown
# 我的音乐口味

## 喜欢的风格
- 华语流行、独立民谣、轻爵士

## 喜欢的歌手
- 周杰伦、陈奕迅、李宗盛

## 不喜欢的
- 喊麦、DJ 舞曲
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
```

---

## 9. API 接口文档

### 9.1 聊天与播放

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/chat` | 发送消息给 DJ |
| GET | `/api/now` | 获取当前播放 |
| GET | `/api/next` | 获取下一首推荐 |

**POST /api/chat 请求**：
```json
{
  "message": "播放 周杰伦 晴天"
}
```

**响应**：
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
  "reason": "user_request",
  "ttsUrl": "/tts/abc123.mp3"
}
```

### 9.2 用户品味

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/taste` | 获取品味文件 |
| POST | `/api/taste` | 更新品味文件 |

**POST /api/taste 请求**：
```json
{
  "file": "taste.md",
  "content": "# 新的口味内容"
}
```

### 9.3 天气与统计

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/weather` | 获取天气 |
| GET | `/api/stats` | 获取统计 |

**GET /api/weather 响应**：
```json
{
  "city": "Changsha",
  "temp": 18,
  "feels_like": 18,
  "description": "阴，多云",
  "humidity": 80,
  "wind": 4
}
```

**GET /api/stats 响应**：
```json
{
  "totalPlays": 15,
  "skipped": 3,
  "skipRate": 20,
  "totalMessages": 8
}
```

### 9.4 设备与投屏

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/devices` | 发现 UPnP 设备 |
| POST | `/api/cast` | 推送音频到设备 |
| POST | `/api/stop` | 停止设备播放 |

### 9.5 系统

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/prefs` | 获取偏好设置 |
| POST | `/api/prefs` | 更新偏好设置 |
| GET | `/api/scheduler` | 获取调度器状态 |
| GET | `/api/plan/today` | 获取今日计划 |
| GET | `/tts/:filename` | 获取 TTS 音频 |

### 9.6 WebSocket

连接 `ws://localhost:3000/stream` 接收实时事件。

**事件格式**：
```json
{
  "type": "auto-broadcast",
  "slot": "morning",
  "say": "早上好！",
  "play": [...],
  "ttsUrl": "/tts/..."
}
```

---

## 10. 数据库设计

### 10.1 表结构

#### plays 表 — 播放记录

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER | 主键 |
| song_id | TEXT | 歌曲 ID |
| song_name | TEXT | 歌曲名称 |
| artist | TEXT | 歌手 |
| album | TEXT | 专辑 |
| source | TEXT | 来源 (chat/scheduler/manual) |
| played_at | DATETIME | 播放时间 |
| skipped | INTEGER | 是否跳过 (0/1) |

#### messages 表 — 对话记录

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER | 主键 |
| role | TEXT | 角色 (user/assistant) |
| content | TEXT | 内容 |
| created_at | DATETIME | 创建时间 |

#### plan 表 — 定时广播计划

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER | 主键 |
| slot | TEXT | 时段 (morning/noon/evening) |
| songs_json | TEXT | 歌曲列表 JSON |
| reason | TEXT | 选曲理由 |
| created_at | DATETIME | 创建时间 |

#### prefs 表 — 偏好设置

| 字段 | 类型 | 说明 |
|------|------|------|
| key | TEXT | 主键 |
| value | TEXT | 值 |

---

## 11. 已知问题与待办事项

### 11.1 已知问题

| 问题 | 状态 | 说明 |
|------|------|------|
| NCM API 失效 | ❌ | 网易云音乐歌曲 URL 接口已关闭，需要替换音乐源 |
| 图标占位符 | ⚠️ | PWA 图标是 1x1 像素占位符，需要设计真实图标 |

### 11.2 待办事项

| 优先级 | 任务 | 说明 |
|--------|------|------|
| 🔴 高 | 替换音乐源 | 网易云 API 已失效，需接入 QQ 音乐或其他源 |
| 🟡 中 | 设计 PWA 图标 | 当前是占位符，需要专业设计 |
| 🟡 中 | 飞书日历集成 | M4 已推迟，需要实现 |
| 🟢 低 | 压力测试 | 验证并发性能 |
| 🟢 低 | 降级逻辑完善 | 外部服务不可用时的用户体验 |

### 11.3 技术债务

1. **NCM API 替换**：当前使用的 NeteaseCloudMusicApi 已失效，需要寻找替代方案
2. **错误处理**：部分模块的错误处理可以更完善
3. **测试覆盖**：缺少单元测试和集成测试
4. **类型检查**：纯 JavaScript，无 TypeScript 类型保护

---

## 12. 开发环境搭建

### 12.1 前置条件

- Node.js 18+
- Claude CLI (`npm i -g @anthropic-ai/claude-code`)
- Git

### 12.2 安装步骤

```bash
# 1. 克隆项目
git clone <repository-url>
cd claudio

# 2. 安装依赖
npm install

# 3. 配置环境变量
cp .env.example .env
# 编辑 .env 填入你的 API Key

# 4. 登录 Claude CLI
claude login

# 5. 启动服务
npm start
```

### 12.3 开发模式

```bash
# 自动重启
npm run dev
```

### 12.4 常用命令

```bash
# 启动服务
npm start

# 开发模式
npm run dev

# 查看数据库
sqlite3 state.db ".tables"

# 清除数据库
rm -f state.db state.db-shm state.db-wal

# 查看日志
# Fastify 会自动输出请求日志
```

### 12.5 调试技巧

1. **查看 Prompt**：在 `context.js` 的 `assemble()` 函数中添加 `console.log(fragments)`
2. **查看 Claude 响应**：在 `claude.js` 的 `ask()` 函数中添加 `console.log(stdout)`
3. **查看 API 请求**：Fastify 会自动记录所有请求
4. **数据库调试**：使用 `sqlite3 state.db` 命令行工具

---

## 附录

### A. Git 提交历史

```
f585ea1 fix: play button auto-recommends when no song loaded
4ce5628 chore: add ncm-api to gitignore
ff4a477 fix: NCM API endpoint paths (song_url instead of song/url)
4673c5e docs: add README with setup, API, and architecture
ce452c7 feat: input validation and global error handler
df80197 chore: update gitignore for db WAL files
cbea361 test: verify M4 weather and profile integration
4399ded feat: Profile view, weather badge, stats display, 4-tab nav
84ecd76 feat: weather module, taste edit API, stats API, context injection
23d458d test: verify M3 PWA integration
0d7e8f7 feat: static file serving and prefs API
a201c5f feat: PWA frontend with player, chat, settings views and service worker
f153ff1 feat: integrate TTS, UPnP, and Scheduler into server
50806b2 feat: time-based scheduler with morning/noon/evening broadcasts
8a1c5ba feat: UPnP device discovery and audio push
9567973 feat: TTS pipeline with Fish Audio and MD5 caching
195f2a8 chore: add M2 dependencies (node-cron, xml2js)
d453a32 chore: add .DS_Store to gitignore
26d4b23 feat: Fastify server with all M1 API endpoints
871e3f4 feat: user corpus templates (taste, routines, mood-rules, playlists)
fc62d78 feat: intent router with play/next/now/claude routing
59e2a56 feat: 6-fragment prompt assembly with DJ persona
6942e91 feat: Claude CLI adapter with timeout fallback
06320e4 feat: SQLite database layer and NCM API wrapper
3cf3b36 chore: project scaffolding with dependencies
```

### B. 相关文档

- `README.md` — 项目说明
- `USER_MANUAL.md` — 用户手册
- `Claudio_PRD_v1.0.docx` — 产品需求文档

### C. 联系方式

如有问题，请联系项目负责人。

---

> 文档版本：v1.0 | 最后更新：2026-05-08
