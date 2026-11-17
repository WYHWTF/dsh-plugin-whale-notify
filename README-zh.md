# dsh-plugin-whale-notify 🐋

> **适用范围：vivo 实测可用，其他品牌机型慎用。**

一轮任务结束时推一条通知,给 **DSH-Android**(在手机上跑的 DeepSeek Harness)用。

重点不是那条通知,是通知对你注意力的作用。

一轮任务可以思考、调工具好几分钟。App 自己没有"干完了"的通知,想知道停没停,只能回来盯着看——
这意味着长任务只有在两种情况下可用:你要么守在那儿,要么不停地打断手头别的事回来看一眼。

它把**任务时长和你的注意力解耦**了:开着就走,被叫一次,回来。短于 `minSeconds`(默认 60 秒)
的轮次不通知,所以普通聊天不会烦你。

## Compatibility / 兼容性

> **vivo 适用，其他品牌机型慎用。**
>
> 真正实测过的只有一台 **vivo V2617A(PD2617) / OriginOS 16.0 / Android 16(SDK 36)**。
> 小米、OPPO、华为、荣耀、三星、一加等其他品牌**未经实测**——它们对通知通道、静默模式和后台
> 策略的处理都不同，装上去**可能一条通知都不弹**。请别抱着"应该能用"的心态装；
> 也请先跑下面的自检，再说"插件坏了"。代码路径在所有安卓上一样，厂商策略不一样。

| | |
|---|---|
| 实测机型 | **vivo V2617A(PD2617)**，OriginOS 16.0，Android 16(SDK 36) |
| 实测环境 | DSH-Android 0.3.11，引擎 0.2.1-rc.5，Shizuku 13.5(adb 模式) |
| 其他品牌 | **慎用**——未实测，可能一条都不弹(先跑自检) |
| 前提 | Shizuku 在运行(见下)，且会话模式包含 `system` 工具组 |

### 30 秒自检（任何安卓机型）

插件最终就是借 `shell` 身份跑这一条命令：

    cmd notification post -S bigtext -t '自检' dsh_turn '这条通知出现了，说明这台手机可以用'

跑一次就行——让 agent 用 `adb_shell` 执行上面这条，或者用 Shizuku 终端。

- 通知弹出来了 → 这台手机没问题，放心装。
- 没弹 / 报错 → 把报错贴进 issue。那是在告诉我们是**那个 ROM** 的问题，不等于插件坏了。


## Why it goes through Shizuku / 为什么走 Shizuku

在上面那台机器上实测:

- App 只有**一个**通知通道 `engine`(Agent 引擎,importance 2、静默、常驻),它是给前台服务保活的,不是消息通道。
- 引擎跑在 App 的 `:engine` 进程里。以 App 身份执行 `cmd notification post` 会被系统拒绝:`permission denied: callingUid=…`。
- 同一个命令以 `shell` 身份(Shizuku)执行,可以。

所以插件监听根会话的 `turn/end`,再通过 `androidBridge` 服务(`@dsh-android/plugin-device`)调用设备工具 `adb_shell`。

> **这会绕过 dsh 的审批流。** 直接调桥意味着发通知不弹审批卡——否则每条通知都要你点一次"允许",就没法用了。
> 插件只执行一条由它自己拼好的固定命令(`cmd notification post …`);来自外部的只有标题前缀(你的配置)和回答预览,两者都做了单引号转义。它不会执行你或模型写的命令。

## Behaviour / 行为

- 只通知根会话;子 Agent 的结束汇报给父会话,不单独通知。
- 标题带结束原因:完成 / 出错 / 已停止 / 达上限 / 已中断。
- 正文带用时;打开预览后,再带上回答开头。
- 固定 tag `dsh_turn`:新通知替换上一条,不堆一屏。
- 通知图标是 DSH 的鲸鱼:随包带 `icon-notification.jpg`,以 `data:base64` 下发,不依赖外部路径
  (取自 DSH-Android 应用图标,该仓库 Apache-2.0)。同一张图也用 `-I` 下发,所以**展开通知后右侧
  会显示鲸鱼缩略图**。`customIcon: false` 两个都不带,退回系统默认图标。
- 优雅降级:没有桥、Shizuku 没跑、或会话模式排除了该工具 → 跳过通知,不抛错、不打扰对话;
  但引擎日志里会留**一条** warn(只写一次,不逐轮刷),好让你分清是"Shizuku 掉了"还是"插件坏了"。

## Privacy / 隐私

**预览默认关闭**(0.2.0 起)。通知在锁屏上是可见的,把模型回答的开头放上去,等于把里面的东西
(聊天、成绩、体检)也放上去。觉得锁屏够私密,再把 `includePreview` 打开。

打开后也只取 `type: "text"` 块:模型的 `reasoning` 思考块永远不会进通知。

## Config / 配置

字段 | 默认 | 说明
--- | --- | ---
`enabled` | `true` | 总开关
`title` | `🐋 DSH` | 标题前缀
`notifyCompleted` / `notifyError` / `notifyBlocked` / `notifyMaxTokens` / `notifyAborted` | 开/开/开/开/关 | 哪些结束原因要通知
`customIcon` | `true` | 用 DSH 鲸鱼作小图标与展开后的大图
`includePreview` | `false` | 附上回答开头(锁屏可见)
`previewChars` | `100` | 预览字数上限
`minSeconds` | `60` | 只服务长任务:短于这么多秒的轮次不通知,普通聊天不烦你

## Install (phone) / 安装

1. DSH → 扩展 / 插件 → 添加插件
2. 输入 npm 名、tarball 链接,或本地 `.zip` 路径
3. 按提示重启引擎(应用会在空闲时自动重启)

## Limitations / 限制

- 需要 Shizuku 在运行。安装时不需要,但没有它就不会有通知。
- 通知以 `shell` 身份发出,所以图标是安卓机器人,通道是系统的 `Shell command`(importance 3):
  进通知栏并响一声,但**不是横幅**——想要横幅,在系统设置里给该通道打开「悬浮通知」。
- 会话模式必须包含 `system` 设备组,否则调用被拒、跳过(引擎日志里有一条 warn)。
- 只在轮次真正结束时通知;plugin-guard 的续跑会让轮次继续运行,所以不会提前报"完成"。

## Maintenance / 维护

**低频维护。** DSH-Android 和引擎都动得快(几周里走了一串 release candidate),遇到破坏性变更时,
这个插件可能要等到有人反馈才跟上。issue 有空会看;能不能修,取决于能否复现。

MIT 授权,不提供担保。如果 App 以后长出自己的通知能力,这个插件就该被它取代。

## Development / 开发

```sh
node --check index.js          # 语法
node test/unit.mjs             # 逻辑、事件结构、Markdown 清洗
node <dsh-plugin-guide>/bin/dsh-plugin-dev.js check --cwd .   # 契约检查
```

`stripMarkdown`、`previewOf`、`humanDuration`、`shouldNotify`、`buildCommand` 都是纯函数并已导出,便于测试。
