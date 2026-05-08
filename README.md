# Claudio - Personal AI DJ Radio Station

一个本地运行的私人 AI DJ 电台，结合 Claude AI 与网易云音乐，根据你的品味和场景智能推荐音乐。

## 架构

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

## 快速开始

### 前置条件

- Node.js 18+
- Claude CLI (`npm i -g @anthropic-ai/claude-code`)
- 本地部署的 NeteaseCloudMusic API (端口 3001)

### 安装

```bash
npm install
cp .env.example .env
# 编辑 .env 填入你的 API keys
```

### 启动

```bash
npm start        # 生产模式
npm run dev      # 开发模式 (自动重启)
```

服务运行在 http://localhost:3000

## 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `CLAUDE_PATH` | Claude CLI 路径 | `claude` |
| `NCM_BASE_URL` | 网易云音乐 API 地址 | `http://localhost:3001` |
| `FISH_API_KEY` | Fish Audio TTS API Key | - |
| `FISH_VOICE_ID` | Fish Audio 语音 ID | - |
| `WEATHER_API_KEY` | OpenWeather API Key | - |
| `WEATHER_CITY` | 天气查询城市 | `Beijing` |
| `PORT` | 服务端口 | `3000` |

## API 文档

### 聊天 & 播放

- `POST /api/chat` - 发送消息给 DJ
  - Body: `{ "message": "来点轻松的音乐" }`
  - Returns: `{ "say": "...", "play": [...], "reason": "..." }`

- `GET /api/now` - 获取当前播放
- `GET /api/next` - 获取下一首推荐

### 用户品味

- `GET /api/taste` - 获取品味文件
- `POST /api/taste` - 更新品味文件
  - Body: `{ "file": "taste.md", "content": "..." }`

### 设备 & 投放

- `GET /api/devices` - 发现 UPnP 设备
- `POST /api/cast` - 推送音频到音响
  - Body: `{ "deviceUrl": "...", "url": "..." }`
- `POST /api/stop` - 停止音响播放

### 天气 & 统计

- `GET /api/weather` - 获取当前天气
- `GET /api/stats` - 获取今日播放统计

### 系统

- `GET /api/prefs` - 获取所有偏好设置
- `POST /api/prefs` - 更新偏好设置
- `GET /api/scheduler` - 获取定时广播状态
- `GET /api/plan/today` - 获取今日播放计划

### WebSocket

- `ws://localhost:3000/stream` - 实时广播事件

## 技术栈

- **后端**: Fastify, better-sqlite3, node-cron
- **AI**: Claude CLI (subprocess)
- **音乐**: NeteaseCloudMusic API
- **TTS**: Fish Audio REST API
- **天气**: OpenWeather API
- **投屏**: UPnP/DLNA
- **前端**: Vanilla HTML/CSS/JS PWA

## 目录结构

```
claudio/
├── server.js          # 入口 & API 路由
├── lib/
│   ├── db.js          # SQLite 数据层
│   ├── router.js      # 意图路由
│   ├── context.js     # Prompt 组装 (6片段)
│   ├── claude.js      # Claude CLI 适配器
│   ├── ncm.js         # 网易云音乐 API
│   ├── tts.js         # Fish Audio TTS
│   ├── upnp.js        # UPnP 设备发现 & 投放
│   ├── scheduler.js   # 定时广播 (早/午/晚)
│   └── weather.js     # OpenWeather 天气
├── prompts/
│   └── dj-persona.md  # DJ 人设 prompt
├── user/
│   ├── taste.md       # 音乐口味
│   ├── routines.md    # 每日作息
│   ├── mood-rules.md  # 情绪规则
│   └── playlists.json # 播放列表
├── public/            # PWA 前端
│   ├── index.html
│   ├── manifest.json
│   ├── sw.js
│   ├── css/
│   ├── js/
│   └── icons/
└── cache/tts/         # TTS 音频缓存
```

## License

MIT
