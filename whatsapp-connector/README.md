# Nuvexa Pro – Windows WhatsApp Connector (beta)

## 实际能力与限制

这是在用户自己 Windows 电脑上运行的 WhatsApp Web 扫码登录连接器，不是伪二维码发生器。基于 [whatsapp-web.js](https://wwebjs.dev/) 的非官方 WhatsApp Web 自动化实现（可能受 WhatsApp Web 版本或平台使用条款影响）。**不属于 Meta 官方 WhatsApp Business API**。必须使用你拥有或明确获授权的 WhatsApp 账号，并由该账号持有人在手机 WhatsApp 的“已关联设备”页面主动扫码。

当前阶段实现：**真实 WhatsApp Web QR 登录、每账号独立 LocalAuth 会话、程序启动恢复曾经授权的会话、状态监测、后台扫码请求、最后四位回报、掉线检测和普通网络断开后的恢复尝试**。不等于已实现任何 Telegram → WhatsApp 实际发送；本地连接器没有自动群发功能。共享备用 1→2→3 的*服务器队列路由逻辑*已经单独测试，但**实际发送端需要后续合规集成和真实验收**。请勿使用角色伪装成独立投资者，以营造虚假市场共识、收益或投资经历。

## 第一次使用

1. 安装 **Node.js LTS 20 或以上**：<https://nodejs.org/>
2. 打开 Nuvexa Pro [账号管理](https://nuvexa-ops-bridge.onrender.com/admin#accounts)，登录后台，点 **连接 Windows 扫码程序**，在弹窗里复制 24 位一次性连接码。连接码 10 分钟有效。
3. 下载/解压当前目录到 Windows 电脑，双击 **START-WHATSAPP.cmd**。启动器将自动执行 npm install（第一次需要联网，下载浏览器可能较大）。需要保留命令窗口。
4. 在命令窗口粘贴一次性连接码。连接程序与线上账户管理建立受限连接。无需查看、复制或覆盖 Render 的 Agent Key。
5. 后台点击所需**单个**账号的“扫码登录”。仅在程序实际收到 WhatsApp Web 发出的 QR 后会出现二维码。用对应 WhatsApp 账号的手机在“设置 → 已关联设备 → 关联设备”扫码。
6. 系统在实际 client ready 和 getState CONNECTED 后标 ONLINE，后四位由连接账号返回；未授权、掉线或不稳定时不会伪报 ONLINE。
7. 以后再次双击 START-WHATSAPP.cmd，会从同一个 Windows 用户的本地资料目录加载并尝试恢复已登录会话。授权失效、手机退出、设备解绑仍可能需要重新扫码。

## 本地文件与隐私

会话与配对 Token **不会写入 Git 仓库**，而放在:
\`\`\`
%LOCALAPPDATA%\NuvexaPro\WhatsAppConnector\
  config.json                  # 设备 Token；请保密
  authorized-accounts.json     # 本机已创建的账号 ID
  sessions\                    # 按账号分别存储 Chromium LocalAuth 会话
\`\`\`
这些文件可以使你的 WhatsApp Web 会话在当地设备恢复；**请不要把它们发送给任何人，也不要上传到 GitHub**。如果你手工删除，会丢失保存的会话。建议限制电脑登录用户权限，启用 Windows 磁盘加密。

## 启动、并发与资源

默认最大并行 **3 个 Chromium/WhatsApp Web 会话**，避免一启动就耗尽电脑内存。可以从 Windows 命令行设置 \`NUVEXA_MAX_ACTIVE\`，例如 6 或 12，**仅当电脑确实有相应 CPU/RAM 资源**。达到上限时新扫码请求会等待；这不是成功登录。默认情况下**无法让72个 WhatsApp 网页会话同时在线**。若需规模化，应评估硬件、许可合规与每人明确授权，不应把人物编号当作账号数量承诺。

## 故障排查

- 后台说“连接器离线”：Windows 本机窗口没有运行、设备 Token 过期、网络不通或后台服务休眠。
- 扫码后仍“验证中”：必须等待 WhatsApp Web 的 \`ready\` 事件与连接状态确认；不要反复扫码制造额外会话。
- 已到并发上限：减少打开的会话或在电脑资源足够时调整 \`NUVEXA_MAX_ACTIVE\`。修改后重启启动器。
- 所有二维码均来自 WhatsApp Web 原始登录事件，保存在内存，后台 Redis 仅暂存 90 秒；不写入日志。
- Windows 的浏览器组件由 Puppeteer 安装；可能被公司代理、杀毒软件、Windows 权限、磁盘空间等阻止。安装失败先检查 Node、网络与本机 Windows 防护日志。
- 安全退出：关闭控制台或 Ctrl+C；LocalAuth 授权文件继续保留。
- 任何软件更新均可能使非官方 WhatsApp Web 集成失效，届时需要兼容性修复。

## 设备配对安全

设备 Token 仅有 **QR/状态心跳**权限，有效期 90 天。新配对会使旧连接器 Token 失效。后台扫码 QR 需管理员登录，设备连接码10分钟一次性使用且不能被反复领取。**请不要在聊天中提供验证码、个人账户登录密码、设备 Token 或二维码。**
