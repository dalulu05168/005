# Nuvexa Pro｜7座调度开发阶段验收记录（不得作为交付合格证明）

## 范围和身份
- 项目：Nuvexa Ops Telegram→WhatsApp，GitHub `dalulu05168/005`，隔离分支 `fix/nuvexa-ephemeral-forward-confirmation-20261011`，Draft PR #18。
- 本记录仅针对源代码、自动化单元/模拟集成测试。**没有具备独立权限的真实 WhatsApp 测试设备/合法测试账户/真实端到端发送回执，不是独立验收官 PASS。**
- 正式网站 admin.nuvexapro.com、DNS和主分支未修改；不触碰真实客户会话资料。

## 需求覆盖与当前结论

| 项目 | 结论 | 证据/说明 |
|---|---|---|
| 65个普通角色、3普通备用、助理2与教授2 | PASS（代码单测） | `ops-bridge/tests/member-config.test.mjs` |
| 编码身份可编辑、编号唯一 | PASS（代码单测） | `ops-bridge/tests/source-role-extraction.test.mjs`、`member-config.test.mjs` |
| 7座滚动容量、一次安全释放一席、下一个补入 | PASS（FakeClient模拟） | `whatsapp-connector/tests/seat-controller.test.mjs` |
| 助理教授高优先任务、未开始普通任务排序 | PASS（代码单测） | `ops-bridge/tests/priority-scheduler.test.mjs` |
| SENDING/VERIFYING、部分群组ACK不能抢断 | PASS（代码单测） | `seat-controller.test.mjs`、`seat-plan-rolling-integration.test.mjs` |
| 全天角色顺序映射与ACK推进 | PASS（模拟多群组） | `ops-bridge/tests/seat-plan.test.mjs`、`seat-plan-rolling-integration.test.mjs` |
| 完成后清除聊天内容、只留短时哈希去重 | PASS（单测） | `ops-bridge/tests/ephemeral-confirmation.test.mjs` |
| 群组禁用不可冒充成功，队列满不得丢弃未完成任务 | PASS（静态逻辑与部分单测） | `deriveTaskStatus` / `FORWARD_QUEUE_AT_CAPACITY` |
| Windows安装后扫码/恢复真实7个账号 | BLOCKED（未实测） | 需要授权设备、真实账号、硬件/存储/网络 |
| Telegram真实来源到WhatsApp多群组发送回执 | BLOCKED（未实测） | 真实发件Worker仍未完成，不应宣称可发布 |
| 7座连续长期运行稳定性、自动异常恢复 | NOT_TESTED | 需要逐级3/5/7真实实例压力测试 |
| 手机/PC页面真机验收与实际部署 | NOT_TESTED | 代码UI已更新但未部署或进行浏览器验收 |
| 独立总验收官最终签字 | BLOCKED | 没有独立执行者与完整实测证据，禁止PASS |
| 发布/合并/生产DNS变更 | NOT_AUTHORIZED | 必须用户另行明确批准 |

## 已接入的安全界限
- 滚动模式仅在 Windows 设置 `NUVEXA_SEAT_MODE=true` 且管理员在后台保存全天计划后启用；没有合法已关联账户时不会静默添加。
- `destroy()` 仅回收 Chrome 实例，**不调用 logout、不删除 LocalAuth 会话**。
- 执行与座位分离，助理/教授优先只在非抢断边界执行；待核实结果保持阻塞，不虚报成功。
- 后台变更当前全天计划绑定的身份/编号时必须安全重配，避免发送错人。
- 仅用于真实获授权账号和透明业务消息；不得冒充互不相关的投资人以制造虚假的市场共识或投资表现。

## 必需后续验收
- 完成合法真实发送Worker，并核验WhatsApp提供的实际消息ID、实际接收群和服务器/设备ACK。
- 真实授权账号扫码登录、断网恢复、失效重新扫码；分别测试3、5、7并行会话。
- 用两个真实测试群组证明“只完成一个目标群不可释放，全部ACK才释放”；重复消息不得再次发布。
- 登录、全天计划编辑、手机端显示、错误弹窗和按钮逐项真实操作并截图；独立测试与正式发布批准分开。
