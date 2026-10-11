# Oracle Always Free 部署 Nuvexa Pro 云端扫码连接器（首个账号）

目标：电脑关机后由 Oracle 免费 ARM 服务器独立运行 **1 个 WhatsApp Web 登录会话**；保持现有 Render 后台、72 个人物账号、Windows 账号和共享备用规则不变。这是非官方 WhatsApp Web 实现，只用于有权登录的账号，扫码与真实连接需按实际手机验证。

## 注册 Oracle Cloud（用户自己操作）

1. 官方注册 https://www.oracle.com/cloud/free/ 。银行卡验证仅在 Oracle 官方 HTTPS 页面完成，**不要把卡号、验证码、账号密码、SSH 私钥发给聊天机器人**。
2. 账号类型保持 Free Tier / Always Free。**不要点 Upgrade、Pay As You Go 或创建付费 shape**。官方说明在不升级的情况下不会因免费验证自动转成收费账号，但可能有临时小额银行卡验证预授权。
3. 选择 Home Region 前仔细考虑：**注册后不能更改**，Always Free 的 ARM 机只能在 Home Region 创建。建议优先检查离马来西亚近、支持 Ampere A1 的可用地区（如新加坡），实际库存以 Oracle 控制台为准；若该地区无库存，等待免费资源恢复，别误选收费机型。
4. 官方 2026 年起最新 Always Free ARM 总额度为 **2 OCPU、12GB RAM**（合计所有 A1 实例），存储 200GB（包括启动盘）。网上旧版 4 OCPU/24GB 教程已过期。

## 创建唯一一台免费 VM（先验证一个账号）

| 配置项 | 选择 |
|---|---|
| Compute instance | Create instance / 创建实例 |
| Image | Ubuntu 24.04 aarch64/ARM64（可用的 Canonical ARM64） |
| Shape | VM.Standard.A1.Flex，必须标注 Always Free-eligible |
| OCPU | 1 |
| RAM | 6GB |
| Boot volume | 默认 50GB（计入免费 200GB） |
| Network | 允许出站 HTTPS 443；只开放你自己的 SSH 22（不开放 10000） |
| SSH | 在本机生成或保存私钥，**不要发到聊天中** |

如果看到 Out of host capacity，是免费机器库存不足，不代表代码问题。不要因此切换到非免费 shape。

## 安装（VM 建好之后）

连接 SSH 时使用控制台显示的公网 IP 和自己保存的 SSH 私钥。Ubuntu ARM 官方镜像常用用户名 ubuntu，以控制台指示为准。

克隆 GitHub 仓库当前试点分支（若仓库是私有的，请在服务器上通过自己的 GitHub 授权访问，不要把个人访问令牌发给聊天）：

```bash
git clone --branch feature/cloud-whatsapp-single-account-20261011 https://github.com/dalulu05168/005.git nuvexa-pilot
cd nuvexa-pilot
bash oci-free/setup.sh
```

脚本自动安装 Docker（如果尚未安装）、构建 Linux ARM64 Chromium 镜像，创建私有 `/srv/nuvexa-whatsapp-pilot` 会话目录并启动单账号服务。Docker `--restart unless-stopped` 随宿主机开机恢复。

默认仅在服务器本机 127.0.0.1:10000 提供健康接口：

```bash
curl -s http://127.0.0.1:10000/healthz
```

**未配对时**显示 `phase: AWAITING_PAIRING`，这只是说明容器已运行，不代表 WhatsApp 已登录。

## 配对云端，而不是 Windows

1. 待后台云端试点 PR 合并、原 Nuvexa Render API 重新部署完成后，在后台账号管理进入 **连接云端扫码服务**。
2. 生成 10 分钟有效的一次性连接码；回到 Oracle SSH 窗口执行：

```bash
bash oci-free/pair.sh
```

3. 通过 SSH 交互输入一次性连接码。脚本短暂注入到容器内完成绑定，配对成功后再用**不带连接码**的新容器恢复专用会话 Token；原 Windows 配对 Token 不变。
4. 后台扫码方式选 **云端扫码（首个账号）**，挑选一个 **未在线账号**，点击扫码并在手机 WhatsApp → 已关联设备扫码。
5. 在后台验证：账号真实 `ONLINE`、号码后四位、每次心跳；随后重启容器验证会话恢复，不应再要求扫码。

## 免费版稳定性与数据保护

- `/srv/nuvexa-whatsapp-pilot` 在 Oracle VM 的启动盘上，通常可跨容器或 VM 重启保存，**但如果删掉 VM 时同时删除启动盘，数据也会丢失**。请保留启动盘并自行备份加密的私有会话。
- Oracle Always Free 可能由于低使用率回收机器；这不是 100% 24 小时在线 SLA。严禁为了防回收而制造无意义的 CPU/网络负载。
- 不要公开端口 10000，也不要把本地登录 Session、云端 Token、验证码、私钥上传 GitHub 或给他人。
- Docker 目前每台 VM 只启动一个云端扫码试点容器，容器最多运行一个 WhatsApp Web 会话。免费配置不保证 72 个账号同时在线。
- 后台发送/共享备用的调度逻辑与云端扫码是不同功能；该云端试点尚未实现真实消息发送、群发或备用补发。

官方来源：https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier.htm
https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm
