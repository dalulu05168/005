# Nuvexa Pro 群消息采集接入（Cloud Edition）

## 状态与边界

采集接口已接入 `ops-bridge/server.mjs`，与现有 Render Web Service 共用一个进程。**不强制使用 Telegram 或外部翻译服务**。通用来源适配器可以调用 `POST /v1/collector/ingest`，通过现有 `X-Nuvexa-Agent-Key` 鉴权。只有选择使用 Telegram Bot 时，才需要配置 Telegram 凭据；未配置时 Telegram Webhook 返回 503，不影响通用采集接口。请勿将机器人令牌、Webhook Secret 写入 GitHub、截图或聊天记录。

模块通过授权来源适配器接收群内的文本和图片，按“图片任务 / 文字任务”分别推入现有队列；Telegram 只是可选来源。**它不负责连接、登录或操作 WhatsApp。**实际 WhatsApp 发图和发文需要独立 worker 实现并调用 `/v1/worker/lease`、`/v1/worker/authorize`、`/v1/worker/ack`；未经验证不能把后端 ACK 当作真实发出。

## Telegram 来源（仅选择此来源时需要）

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

配置后启用 `TELEGRAM_AUTO_WEBHOOK=true`，在 Render 部署/重启完成时注册：

`https://nuvexa-ops-bridge.onrender.com/v1/collector/telegram/webhook`

Telegram Webhook 验证 `X-Telegram-Bot-Api-Secret-Token`，非白名单群组更新直接忽略。图片下载由受 Agent Key 保护的 `GET /v1/worker/media?ref=tgfile:...` 提供，不公开 Telegram Bot Token，也不读取图片内容。

## 通用采集（不需要 Telegram）

调用 `POST https://nuvexa-ops-bridge.onrender.com/v1/collector/ingest`，请求头携带 `X-Nuvexa-Agent-Key`，正文例子：

```json
{
  "sourceChatId": "authorized-source-group",
  "sourceMessageId": "message-001",
  "sourceSenderId": "source-actor-id",
  "text": "助理\n今日市场上涨。\n\nPiața a crescut astăzi. Good morning!"
}
```

字段 `text` 里上面是中文、下面是现成译文，无需 `romanianText`，系统自动提取下方译文。分开发送的图片通过 `mediaRef` 提供不可变图片引用，图片不计入文字间隔。同一个来源同一条消息使用稳定的消息 ID，避免重复发送。来源适配器仍须另行连接到实际群消息系统，接口上线不代表已经接入真实聊天消息。

## 与截图一致的实际消息格式

- 源消息可以是一条“图片 + caption 正文”，图片在最上方；也可以只包含正文，不带图片。**只有真正携带的图片才生成 IMAGE 任务**。
- 正文第一行是角色（例如 `资讯助理`、`45男`、`2女`）；下面是中文原文，最后是已准备好的罗马尼亚语译文。系统只提取最后中文行下方的非中文内容，英文可以原样混排。不要再调用翻译服务。
- `资讯助理` 映射 `ASSISTANT`，发出时角色标签为 `Asistent informativ`；`45男` / `2女` 分别映射 `AUXILIARY:45`、`AUXILIARY:2`，发出标签为 `45 M`、`2 F`。这两类编号角色在**实际转发前必须已经配置对应的授权发送账号**，否则任务应保持阻止状态，不能冒用其他账号，也不能报告已发送。
- 图片保持原始 mediaRef、不分析内容，并按现有图片零等待规则单独发出；文字按间隔发送。源消息没有图片时，绝不插入图片。
- 测试用例：`ops-bridge/tests/source-role-extraction.test.mjs`，在 `ops-bridge` 目录运行 `npm test`。

## 业务规则

- 当前支持群内角色标签：`资讯助理`、`助理`、`资讯教授`、`教授`、`辅助 01` 及 `1女` 到 `70男` 这类带数字性别标记的角色（也可由现有 API 显式传入 role）。带数字角色只依据源消息明确标签进行映射，不推断任何人的真实身份。
- 图片只有在能与同群的角色文字准确匹配时才排队；没有角色的独立图片先短暂暂存，不自行外发。
- 图片与译文是不同任务。**图片无需文字间隔，也不更新文字间隔时钟**；文字按原本的群组间隔发送。
- 图片保持原始文件信息，不进行 OCR/视觉识别，且不计入翻译调用。
- 中文原文之后应已经附带罗马尼亚语或英文译文。系统只提取**最后一段中文之后**的非中文内容，不调用任何翻译 API。英语可以与罗马尼亚语混合，最终外发文字禁止出现中文汉字或中文标点。后端在入队、任务领取、发送前授权三个阶段检查。
- 没有现成的非中文译文时，必须阻断文字消息；不能将中文原文直接外发。不含中文的消息可以直接进入文字队列。
- 如果图片无效、消息不含角色、同一时刻存在多个无法区分的候选图片，须阻断或等待，不能错配或伪造。
- Webhook 处理失败时 Telegram 会重试，后端依据来源群和消息 ID 对图片/文字分开去重。

## 完整验收清单

1. Render 服务正常、Redis 可连接，日志有 `Telegram webhook registration OK`，检查 Telegram `getWebhookInfo` 指向本服务。
2. 白名单群组文字进入队列，非白名单群组被忽略。
3. 一张图片位于角色文字上方：图片不分析，先生成 IMAGE 任务；角色译文另生成 TEXT 任务。
4. 中文上方段落只用于角色和内容分段，下方已经准备好的译文原样取出；发送前检查禁止中文外发。
5. 图片发送不重置或增加文字冷却时间。
6. WhatsApp worker 实际拉取图片字节、发至**用户明确授权的测试群**并确认收到；失败时不能 ACK 冒充成功。
7. 在实际外发运行之前，先用独立测试群完成完整端到端验证，切勿以模拟回执代替。

## 注意

不同 Telegram 图片可能以 album/media_group 发出；目前主要覆盖单图和后续角色消息，多图相册需要另外验证。消息归属不确定时不强行匹配。不要求翻译服务或其密钥。禁止把采集的群消息或个人隐私数据发到未获授权的群组。
