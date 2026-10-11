# Nuvexa Pro · 云端 WhatsApp 扫码试点

## 状态与边界

这是一个可部署的 **真实 WhatsApp Web 登录连接器**（非 Meta 官方 API）。部署完成、持久磁盘验证、管理员授权、手机扫码及重启恢复验收之前，**不能声称已上线或已登录成功**。

新云端连接器不会读取、复制、删除用户 Windows 端的 WhatsApp LocalAuth 文件；后台现有的 72 个账号位置、角色、已登录的 Windows 助理和成员备用规则均原样保留。

**仅允许一个未在线的账号试点。** 先完成真实扫码、手机尾号、连接心跳、云端重启会话恢复及断线显示。此云端程序不包含 WhatsApp 消息发送/补发能力。

## Render 部署配置

官方资料：[Persistent Disks](https://render.com/docs/disks) 和 [Free Instances](https://render.com/docs/free)。Render 免费服务会休眠、无持久磁盘，不能用来保存 WhatsApp Web 登录会话。

| 配置 | 值 |
|---|---|
| Repository | https://github.com/dalulu05168/005 |
| Branch | deploy/nuvexa-ops-v026 |
| 类型 | Web Service · Docker |
| Dockerfile | ./Dockerfile.whatsapp-cloud |
| 起步规格 | 付费，建议 Standard（Chromium 需要足够内存；根据实际内存使用调整） |
| 运行位置 | Singapore |
| 持久磁盘 | 至少 2 GB，Mount Path 精确为 /var/data |
| 健康检查 | GET /healthz |
| 新服务名称 | nuvexa-whatsapp-cloud-pilot |
| 环境变量 | NUVEXA_CLOUD_PAIR_CODE（从原后台一次性复制到 Render 私有环境配置，不发给聊天） |

代码会在启动时检验 Linux mountinfo 存在 /var/data 独立挂载，并尝试创建文件。未挂载则拒绝启动 WhatsApp，不会冒险将会话存入重启即清空的路径。配置文件、账号列表和 LocalAuth profile 只在 /var/data/nuvexa-wa 内。

## 首次配对与云端扫码

1. 在用户明确授权的 Render 工作区创建上述付费 Web Service 和 Disk。**创建之前应确认该工作区与付费资源。**
2. 服务 /healthz 首次显示 phase=AWAITING_PAIRING、diskVerified=true，代表磁盘和进程就绪，但尚未登录 WhatsApp。
3. 在 Nuvexa Pro 的 Render 管理后台登录，账号管理 → 连接云端扫码服务，生成 10 分钟一次性连接码。
4. 在 Render 新云端服务的私密环境变量 NUVEXA_CLOUD_PAIR_CODE 中粘贴该码，重新部署；不要把它粘贴到聊天、GitHub 或上传文件中。
5. 新云端服务以专用云端令牌认证，仅访问 /v1/cloud/accounts/requests、/qr、/heartbeat。令牌写在 /var/data/nuvexa-wa/cloud-pairing.json，旧 Windows Token 不变。
6. 后台扫码方式选择云端扫码，从未在线的账号中挑选一个，点击该账号扫码登录。已在线的 Windows 账号不会被云端抢占。
7. 看到真正来自 WhatsApp Web 的二维码后用手机 WhatsApp 的已关联设备功能扫码，确认号码后四位、状态 ONLINE 和持续心跳。
8. 在 Render Dashboard 只重启该云端实例，确认它不需要重新扫码即可恢复同一登录会话；再测试网络异常时离线状态和恢复。

## 安全

- 不把验证码、两步验证密码、云端/Windows Token、会话目录内容写入仓库或日志。
- 新云端 Token 与现有 Windows 配对凭据完全隔离，使用独立 Redis 密钥。
- 试点仅一账号，云端 QR/心跳路径无发送 API 权限；不能由 QR 已可见推断已经登录成功。
- 业务群内必须遵守适用的平台条款与真实授权规则，不应伪造多名独立投资者的观点或收益。
- Render 实例重启可能短时离线，持久磁盘不是零停机承诺。非官方 WhatsApp Web 库随 WhatsApp 更新可能需要兼容性维护。

## 故障

- CLOUD_CONNECTOR_OFFLINE：云端服务未运行、未授权或最近两分钟未上报心跳。
- CLOUD_PILOT_ALREADY_ASSIGNED：当前单账号试点已经选定一个账号，不会自动覆盖。
- ACCOUNT_ALREADY_ONLINE_ON_WINDOWS：为避免影响本机账号，云端试点拒绝抢占现有在线号。
- PERSISTENT_DISK_NOT_MOUNTED：Render 未正确挂载付费持久磁盘到 /var/data。
