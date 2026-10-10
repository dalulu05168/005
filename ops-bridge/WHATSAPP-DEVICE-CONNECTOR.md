# WhatsApp 设备连接器接口（Nuvexa Cloud Edition）

## 系统状态

当前管理后台含 72 个**角色/账号位置**，不代表 72 个 WhatsApp 号码已经授权。
Cloud API 支持实际扫码二维码显示与实时心跳，但服务器端**不会生成假二维码或虚拟在线状态**。必须先在用户拥有/获授权的设备上运行真实 WhatsApp 设备连接器。

云手机项目 `cloudphone-manager` 目前独立存在，已具备设备启动、WhatsApp 登录页检测等基础实现，但 **Nuvexa Cloud 并未自动接入云手机项目**；其 Android 注册验证码页面不等同于 WhatsApp Web 扫码页面。只有实际 Web/桌面可扫描的配对流程才可返回二维码。

## 操作权限与会话

- Cloud 管理员有权查看请求和二维码；设备 Worker 仅持有独立 Agent Key，严禁在前端、仓库或日志存储密钥。
- Worker 的每个 `accountId` 对应**一个独立的持久化会话目录**，不能共享浏览器 profile 或 Session；会话应加密储存，启动后尝试恢复真实已授权的登录。用户需在 WhatsApp 原设备端确认授权。
- 如果无法恢复，状态标为 `NEEDS_QR`、`OFFLINE` 或 `VERIFYING`；**绝不能**用本地缓存的状态冒充在线。
- 账号发送/心跳必须尊重平台规则和真实授权，不得利用多个身份伪造第三方独立意见、投资收益或市场共识。

## 工作流程

1. Worker 启动真实 WhatsApp 会话，完成能力自检。
2. Worker 使用 `POST /v1/worker/accounts/heartbeat` 每 20–30 秒发送每个真实账号的连接状态，云端仅使用最近两分钟以内的有效心跳展示 `ONLINE`。
3. 管理员在 **账号管理 → 扫码登录** 选择某个账号。
4. 云端核对 Worker 存在，不存在则明确返回 `503 WHATSAPP_CONNECTOR_OFFLINE`，不会制造二维码。
5. Worker 用 `GET /v1/worker/accounts/requests` 读取被授权的账号连接请求。用户需要当前登录时，Worker 生成真实可配对二维码 PNG 并用 `POST /v1/worker/accounts/qr` 传给云端；QR 自动 90 秒失效。
6. 管理员 UI 用 `GET /v1/accounts/qr?accountId=...` 只读取属于所选账号的实际二维码或状态。连接完成后 Worker 用心跳报告 `ONLINE` 和号码后四位。
7. 每次桌面 Worker 重启，尝试恢复各账号会话；断开时发 `OFFLINE`。如果异常退出，云端到期自动标离线；会话恢复失败应重新授权或扫码。

## API

### Worker 上报状态

`POST /v1/worker/accounts/heartbeat`

Header：`X-Nuvexa-Agent-Key: <server-configured-agent-key>`

Body 示例（仅示意接口，不代表任何在线数据）：

```json
{"workerId":"local-wa-bridge","accounts":[{"accountId":"member-01","status":"ONLINE","phoneLast4":"1234","sessionId":"local-session-reference"}]}
```

只有已存在的 `accountId` 可更改；有效状态为 `ONLINE`、`OFFLINE`、`NEEDS_QR`、`VERIFYING` 和 `CONFIRMED_UNAVAILABLE`。服务端不向浏览器暴露 `sessionId` 或设备元数据。

### 请求实际二维码

- 管理员 `POST /v1/accounts/connect`：`{"accountId":"member-01"}`，如果 Worker 离线返回明确错误
- Worker `GET /v1/worker/accounts/requests`：查询当前待扫码列表
- Worker `POST /v1/worker/accounts/qr`：`{"accountId":"member-01","qrDataUrl":"data:image/png;base64,..."}`
- 管理员 `GET /v1/accounts/qr?accountId=member-01`：`WAITING_FOR_REAL_QR`、`SCAN_READY` 或 `CONNECTED`

这些端点不代替底层 WhatsApp Web/设备登录协议的实际实现。未连接真实 Worker 前，**扫码登录和启动后自动连接尚未交付**。提供接口不等于已实现 WhatsApp 真实连接。

## 部署备注

Render 承载 API/Redis，不能替代本机 Android 模拟器或 72 个独立 WhatsApp 会话运行。桌面连接器需要独立安装、启动、持久化会话目录和保活机制，尚待与用户的云手机项目确认集成边界。禁止未经确认直接合并或重写云手机项目。
