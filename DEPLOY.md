# AWSL 远程面板部署指南

## 架构

```
                    ┌──────────────────────────┐
                    │  服务器 (Docker)          │
                    │  awsl dashboard           │
                    │  0.0.0.0:3120             │
  浏览器/手机 ──────│  ├─ HTTP  → Web UI        │
                    │  ├─ REST  → /api/*        │
                    │  └─ WS    → /ws/relay     │
                    └──────┬──────────┬─────────┘
                           │          │
                      ┌────┘          └────┐
                      ▼                    ▼
                ┌───────────┐        ┌───────────┐
                │ 开发机 A  │        │ 开发机 B  │
                │ remote    │        │ remote    │
                │ connect   │        │ connect   │
                └───────────┘        └───────────┘
```

## 服务器部署（Docker 一键起）

```bash
# 拉代码
git clone https://github.com/你的用户名/awsl-agent-teams.git
cd awsl-agent-teams

# 起服务
docker compose up -d
```

完事。面板跑在 `http://服务器IP:3120`。

更新版本：

```bash
git pull
docker compose up -d --build
```

停止：

```bash
docker compose down
```

### 自定义端口

```bash
# 改 docker-compose.yml 的 ports 映射即可
# 或者直接 docker run
docker build -t awsl-dashboard .
docker run -d -p 8080:3120 --restart unless-stopped --name awsl-dashboard awsl-dashboard
```

## 客户端连接

```bash
# 第一步：配置（只需一次）
cd /your/project
awsl remote init http://服务器IP:3120 --id my-laptop
# → 保存到 .planning/remote.json

# 第二步：后台连接
awsl remote connect --bg

# 查看状态
awsl remote status

# 停止
awsl remote stop
```

也可以跳过 init，直接连接：

```bash
awsl remote connect http://192.168.1.100:3120 --bg
```

连上后在面板 Machines 面板会看到这台机器。

### 配置文件

`awsl remote init` 生成 `.planning/remote.json`：

```json
{
  "serverUrl": "http://192.168.1.100:3120",
  "clientId": "my-laptop"
}
```

之后 `awsl remote connect` 不用带 URL，直接读配置。

### 开机自启

**Windows** — 创建 `awsl-remote.bat` 放到启动文件夹（`Win+R` → `shell:startup`）：

```bat
@echo off
cd /d C:\your\project
node C:\path\to\awsl-agent-teams\dist\cli.js remote connect
```

（会自动读 `.planning/remote.json`，不用写 URL。）

**Linux/Mac** — systemd user 服务：

```bash
mkdir -p ~/.config/systemd/user
cat > ~/.config/systemd/user/awsl-remote.service << 'EOF'
[Unit]
Description=AWSL Remote Client
After=network.target

[Service]
Type=simple
WorkingDirectory=/your/project
ExecStart=/usr/bin/node /path/to/awsl-agent-teams/dist/cli.js remote connect
Restart=always
RestartSec=10

[Install]
WantedBy=default.target
EOF

systemctl --user daemon-reload
systemctl --user enable --now awsl-remote
```

### 定时任务

定时任务运行在**本地**。远程面板通过中继发送 `queue:add --at "03:00"` 到本地机器后，本地自动注册系统定时任务（Windows 任务计划程序 / Unix `at`），到时间自动执行。面板只负责下发命令，不负责调度。

好处：
- 面板 Docker 重启不影响已调度的任务
- 断网后定时任务仍然按时执行
- 面板恢复后客户端自动重连，状态同步

## 浏览器使用

打开 `http://服务器IP:3120`：

1. **Machines 面板** — 显示所有在线机器，点击选中
2. **Queue 面板** — 自动切换到选中机器的队列，可直接添加/删除任务
3. **操作按钮** — System Info / Start Queue / 返回本地
4. 所有队列操作通过 WebSocket 中继路由到目标机器

## 网络配置

### 防火墙

```bash
# Linux (ufw)
sudo ufw allow 3120/tcp

# Linux (firewalld)
sudo firewall-cmd --add-port=3120/tcp --permanent && sudo firewall-cmd --reload
```

### Nginx 反向代理 + HTTPS

```nginx
server {
    listen 443 ssl;
    server_name awsl.example.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://127.0.0.1:3120;
        proxy_http_version 1.1;
        # WebSocket 必需
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

配合 Docker Compose 使用时，`docker-compose.yml` 可以把 ports 改为 `127.0.0.1:3120:3120`，只让 Nginx 访问。

### 内网穿透

```bash
# frp
frpc -c frpc.ini   # [awsl] type=tcp local_port=3120 remote_port=3120

# ngrok
ngrok http 3120

# cloudflared
cloudflared tunnel --url http://localhost:3120
```

## 安全

当前版本没有内置认证。建议：

1. **内网 / VPN** — 最简单安全
2. **Nginx Basic Auth** — 加一层 HTTP 认证：
   ```nginx
   auth_basic "AWSL";
   auth_basic_user_file /etc/nginx/.htpasswd;
   ```
3. **防火墙白名单** — 只允许特定 IP
4. **不要裸暴露到公网**

## API 参考

### 本地 API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/info` | 服务器信息 |
| GET | `/api/history` | 执行历史 |
| GET | `/api/stats` | 聚合统计 |
| GET | `/api/queue` | 本地队列 |
| GET | `/api/logs` | SSE 实时日志 |
| POST | `/api/queue/add` | 添加任务 |
| DELETE | `/api/queue/remove?id=q_1` | 删除任务 |
| POST | `/api/queue/clear` | 清空队列 |
| POST | `/api/queue/set-time` | 设置调度时间 |
| POST | `/api/history/clear` | 清除历史 |

### 远程控制 API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/clients` | 已连接客户端列表 |
| POST | `/api/clients/command` | 发送命令 `{clientId, action, payload?}` |
| WebSocket | `/ws/relay` | 客户端连接端点 |

### 远程命令

```bash
# 示例：给远程机器添加任务
curl -X POST http://server:3120/api/clients/command \
  -H "Content-Type: application/json" \
  -d '{"clientId":"my-laptop","action":"queue:add","payload":{"goal":"Build API"}}'
```

| action | payload | 说明 |
|--------|---------|------|
| `queue:add` | `{goal, engine?, quick?, dependsOn?, runAt?}` | 添加任务 |
| `queue:remove` | `{id}` | 删除任务 |
| `queue:clear` | - | 清空队列 |
| `queue:list` | - | 列出任务 |
| `queue:get` | `{id}` | 查看任务 |
| `queue:set-time` | `{id, runAt}` | 设置调度时间 |
| `queue:start` | `{engine?, once?}` | 启动执行 |
| `system:info` | - | 系统信息 |

## 故障排查

| 问题 | 排查 |
|------|------|
| 面板打不开 | `docker compose logs` 看报错 |
| 客户端连不上 | 检查防火墙、URL、`docker compose ps` 确认容器在跑 |
| WebSocket 断开 | Nginx 反向代理需要 `Upgrade` + `Connection` 头 |
| 命令超时 | 默认 30 秒，可在 payload 加 `timeout` 字段 |
| 90 秒后掉线 | 心跳超时，检查网络 |
