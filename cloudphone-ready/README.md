# CloudPhone 本地可用版 2.1.0

这是 Windows 本机 Android AVD 管理工具。它直接调用本机 Android SDK，不连接演示 Provider，也不会创建收费的第三方云手机。

## 使用

1. 安装 Node.js 20 或更高版本、Android Studio、Android Emulator 和 Platform-Tools。
2. 在 Android Studio Device Manager 中创建需要的 AVD。AVD 名称只使用英文、数字、点、下划线或横线。
3. 双击根目录最醒目的 `启动云手机.cmd`。首次运行会显示注册邀请码。
4. 在打开的窗口注册本机账号。以后登录不再要求邀请码。

不要直接打开 `local/public/index.html`。如果误打开，页面会提示返回根目录使用启动器。

数据保存在 `%LOCALAPPDATA%\CloudPhone`。程序保留已有 `instances.json`、`app-users.json` 和 `device-metadata.json`。新建的 AVD 会追加到注册表，不改变旧设备的编号和端口。每次保存 JSON 前会生成 `.bak` 备份；文件损坏时停止写入，避免覆盖数据。

## 已实现

- 精确核验 AVD 名、固定端口和 SDK 内模拟器进程，避免相似名称串号。
- 每台设备独立排队启动、停止、重启；一台开机不会阻塞其他设备的网页请求。
- 模拟器以无窗口模式运行，并自动通过 scrcpy 弹出可点击、可输入的手机镜像，绕过 Emulator 原生窗口黑屏、屏幕外定位和 Crashpad 崩溃。
- 异常或卡在启动中的设备可“恢复停止”，只有进程身份二次核验通过才会强制结束。
- 截图尺寸直接从 PNG 读取，点击坐标与实际画面一致。
- 列出 WhatsApp / WhatsApp Business 所在的 Android 用户，并可选择指定用户打开。
- 登录、设备备注和尾号登记；并发写入串行化，损坏文件拒绝覆盖。

## 注意

- “恢复停止”会结束已准确匹配 AVD 名和端口的模拟器进程，请先等待普通停止完成。
- WhatsApp 号码通常无法由 Android 系统直接读取；无法读取时请通过设备画面确认，并手工登记尾号。
- AVD 数据、WhatsApp 登录状态和聊天数据由 Android 模拟器保存。本程序不会备份这些内容，重要设备请另行备份 AVD。
- 日志：`%LOCALAPPDATA%\CloudPhone\local-ui.err.log` 及 `emulator-端口.log`。

运行自带验证：`npm test`。
