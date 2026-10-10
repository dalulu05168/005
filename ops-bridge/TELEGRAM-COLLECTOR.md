# Nuvexa Pro Telegram 采集器（Cloud Edition）

## 状态与边界

采集器已接入 `ops-bridge/server.mjs`，与现有 Render Web Service 共用一个进程，**默认关闭**。缺少必需环境变量时，Webhook 返回 503，不会读取 Telegram 消息。请勿将机器人令牌、Webhook Secret 或 DeepL 密钥写入 GitHub、截图或聊天记录。

这套模块接收**用户指定的 Telegram 群组**的文本和图片，按“图片任务 / 文字任务”分别推入现有队列；它**不**负责连接、登录或操作 WhatsApp。实际 WhatsApp 发图和发文需要独立 worker 实现并调用 `/v1/worker/lease`、`/v1/worker/authorize`、`/v1/worker/ack`；未经验证不能把后端 ACK 当作真实发出。

## 配置 Telegram Bot

1. 在 Telegram 找 **@BotFather**，使用 `/newbot` 创建专用机器人，私下保存其 **Bot Token**。不要把 Token 发给任何聊天机器人。
2. 把新机器人加入需要采集的源 Telegram 群组。希望读取普通群消息时，使用 BotFather 的 `/setprivacy` 选择 **Disable**，必要时从群组移除后重新加入；或者按 Telegram 权限要求把机器人设为群组管理员。
3. 获取源群组的**数字 chat ID**，例如 `-1001234567890`。在设置 Webhook 前，可以先向群里发送一条测试消息，再从 Telegram 官方 Bot API 的 `getUpdates` 响应里读取 `message.chat.id`。注意：Token 属于秘密，避免把带 Token 的链接公开分享或截图。
4. 在 Render 的 `nuvexa-ops-bridge` 服务中设置以下环境变量，**不改变或删除现有 Redis、OPS 管理员与 Agent 密钥**。

| 变量 | 作用 |
|---|---|
| `TELEGRAM_BOT_TOKEN` | BotFather 的 Telegram 机器人令牌，必填 |
| `TELEGRAM_WEBHOOK_SECRET` | 自定义随机的 32–64 位字母数字/连字符/下划线，必填 |
| `TELEGRAM_SOURCE_CHAT_IDS` | 允许采集的源群组 chat ID，多个用英文逗号隔开，必填 |
| `TELEGRAM_AUTO_WEBHOOK` | `true` 允许启动时自动向 Telegram 注册 Webhook；默认关闭 |
| `TELEGRAM_PUBLIC_ORIGIN` | 可选，默认 `https://nuvexa-ops-bridge.onrender.com` |
| `DEEPL_AUTH_KEY` | DeepL 翻译 API 密钥；有中文原文需要翻译时必填 |
| `DEEPL_API_ENDPOINT` | 可选；DeepL 免费方案默认 `https://api-free.deepl.com/v2/translate`，Pro 方案用 `https://api.deepl.com/v2/translate` |

配置后启用 `TELEGRAM_AUTO_WEBHOOK=true`，在 Render 部署/重启完成时注册：

`https://nuvexa-ops-bridge.onrender.com/v1/collector/telegram/webhook`

Telegram Webhook 验证 `X-Telegram-Bot-Api-Secret-Token`，非白名单群组更新直接忽略。图片下载由受 Agent Key 保护的 `GET /v1/worker/media?ref=tgfile:...` 提供，不公开 Telegram Bot Token，也不读取图片内容。

## 业务规则

- 识别目前支持的角色前缀：`助理`、`教授`、`辅助 01` 等（也可由现有 API 显式传入 role）。如果真实群里使用其他人名标签，需要扩展角色映射；**不能随意猜身份**。
- 图片只有在能与同群的角色文字准确匹配时才排队；没有角色的独立图片先短暂暂存，不自行外发。
- 图片与译文是不同任务。**图片无需文字间隔，也不更新文字间隔时钟**；文字按原本的群组间隔发送。
- 图片保持原始文件信息，不进行 OCR/视觉识别，且不计入翻译调用。
- 中文原文必须先翻译为罗马尼亚语。英语可以与罗马尼亚语混合，最终文字禁止出现中文汉字及中文标点。后端在入队、任务领取、发送前授权三个阶段检查。
- 没有 DeepL Key 时，仅不包含中文的原文可以直接进入文本队列；不能将中文源消息原样外发。
- 如果图片无效、消息不含角色、同一时刻存在多个无法区分的候选图片，须阻断或等待，不能错配或伪造。
- Webhook 处理失败时 Telegram 会重试，后端依据来源群和消息 ID 对图片/文字分开去重。

## 完整验收清单

1. Render 服务正常、Redis 可连接，日志有 `Telegram webhook registration OK`，检查 Telegram `getWebhookInfo` 指向本服务。
2. 白名单群组文字进入队列，非白名单群组被忽略。
3. 一张图片位于角色文字上方：图片不分析，先生成 IMAGE 任务；角色译文另生成 TEXT 任务。
4. 中文、英文混写原文翻成罗马尼亚语；发送前检查禁止中文外发。
5. 图片发送不重置或增加文字冷却时间。
6. WhatsApp worker 实际拉取图片字节、发至**用户明确授权的测试群**并确认收到；失败时不能 ACK 冒充成功。
7. 在实际外发运行之前，先用独立测试群完成完整端到端验证，切勿以模拟回执代替。

## 注意

不同 Telegram 图片可能以 album/media_group 发出；目前主要覆盖单图和后续角色消息，多图相册需要另外验证。消息归属不确定时不强行匹配。翻译 API 可能产生费用；需要检查额度。禁止把采集的群消息或个人隐私数据发到未获授权的群组。
