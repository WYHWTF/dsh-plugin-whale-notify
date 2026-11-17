// dsh-plugin-whale-notify — 一轮任务结束时推一条 🐋 通知（DSH-Android 专用）
//
// 为什么这么实现（机型事实，见 docs/ENGINE-CONTRACT.md §3 与本机实测）：
//   1. App 只有一个通知通道 `engine`（Agent 引擎，importance=2、SILENT、ONGOING），
//      它是给前台服务保活用的，不是消息通道。
//   2. 引擎跑在 App 的 :engine 进程里，以 App 身份执行
//      `cmd notification post` 会被系统拒绝：error: permission denied: callingUid=…（实测）。
//   3. 但以 shell 身份（Shizuku）执行同一个命令是通的（实测 exit 0）。
//   → 所以：监听根会话的 `turn/end`，再走 capability 桥调用设备工具 `adb_shell` 发通知。
//      桥是 @dsh-android/plugin-device 提供的 `androidBridge` 服务（可选服务，用 ctx.get 取）。
//
// 依赖与降级：没有 androidBridge、Shizuku 未运行、或调用被会话模式挡掉 → 跳过通知，不抛错、不打扰对话；
//   但会往引擎日志写一条 warn（连续多次只写一次），让人能分清「Shizuku 掉了」和「插件坏了」。
import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

export const name = 'whale-notify'
// 只用可选服务（androidBridge），所以不必 inject；缺了它插件照样加载。

/** 通知 tag：同一个 tag 会替换上一条，避免通知栏堆一屏。 */
const TAG = 'dsh_turn'

const KIND_LABEL = {
  completed: '完成',
  error: '出错',
  blocked: '已停止',
  'max-tokens': '达上限',
  aborted: '已中断',
}

const DEFAULTS = {
  enabled: true,
  title: '🐋 DSH',
  customIcon: true,
  notifyCompleted: true,
  notifyError: true,
  notifyBlocked: true,
  notifyMaxTokens: true,
  notifyAborted: false,
  includePreview: false,
  previewChars: 100,
  minSeconds: 60,
}

/**
 * 通知图标：包内自带的 DSH 鲸鱼位图（取自 DSH-Android 应用图标，仓库 Apache-2.0）。
 * 以 data:base64 形式随命令下发，不依赖任何外部路径；读不到就不带 -i，退回系统默认图标。
 */
function loadIconUri() {
  try {
    const bytes = readFileSync(new URL('./icon-notification.jpg', import.meta.url))
    return bytes.length > 0 ? 'data:base64,' + bytes.toString('base64') : undefined
  } catch {
    return undefined
  }
}
const ICON_URI = loadIconUri()

/**
 * profile 里的插件不在引擎的 node_modules 下，裸标识符解析不到 @deepseek-ai/*（实测），
 * 所以先试裸导入，失败再按 DSH_HOME 找到引擎目录直接指向文件。都失败就用默认值、不给配置表单。
 */
function engineSchemaEntry() {
  const home = process.env.DSH_HOME
  if (typeof home !== 'string' || home === '') return undefined
  const engineRoot = join(home, '..', 'engine')
  let versions
  try {
    versions = readdirSync(engineRoot)
  } catch {
    return undefined
  }
  for (const version of versions) {
    for (const entry of ['lib/index.mjs', 'lib/index.cjs']) {
      const candidate = join(engineRoot, version, 'node_modules', '@deepseek-ai', 'schemastery', entry)
      if (existsSync(candidate)) return candidate
    }
  }
  return undefined
}

let Schema
try {
  ({ default: Schema } = await import('@deepseek-ai/schemastery'))
} catch {}
if (Schema === undefined) {
  const entry = engineSchemaEntry()
  if (entry !== undefined) {
    try {
      ({ default: Schema } = await import(pathToFileURL(entry).href))
    } catch {}
  }
}

export const Config = Schema?.object({
  enabled: Schema.boolean().default(DEFAULTS.enabled).description('启用通知'),
  title: Schema.string().default(DEFAULTS.title).description('通知标题前缀'),
  customIcon: Schema.boolean().default(DEFAULTS.customIcon).description('用 DSH 鲸鱼图标（关闭则用系统默认图标）'),
  notifyCompleted: Schema.boolean().default(DEFAULTS.notifyCompleted).description('正常完成时通知'),
  notifyError: Schema.boolean().default(DEFAULTS.notifyError).description('出错时通知'),
  notifyBlocked: Schema.boolean().default(DEFAULTS.notifyBlocked).description('被拦下（预算/归档）时通知'),
  notifyMaxTokens: Schema.boolean().default(DEFAULTS.notifyMaxTokens).description('触到输出上限时通知'),
  notifyAborted: Schema.boolean().default(DEFAULTS.notifyAborted).description('你手动停止时也通知'),
  includePreview: Schema.boolean().default(DEFAULTS.includePreview).description('正文附上回答开头'),
  previewChars: Schema.natural().default(DEFAULTS.previewChars).description('预览字数上限'),
  minSeconds: Schema.natural().default(DEFAULTS.minSeconds).description('短于这么多秒的对话不通知'),
})

/** 单引号安全：把任意文本塞进 `sh -c` 的一个参数里。 */
export function shellQuote(text) {
  return "'" + String(text).replace(/'/g, "'\\''") + "'"
}

/** 取消息里的纯文本。 */
export function textOf(content) {
  if (!Array.isArray(content)) return ''
  return content.filter(b => b?.type === 'text' && typeof b.text === 'string').map(b => b.text).join('\n').trim()
}

/** 去掉 Markdown 标记：通知栏不渲染 Markdown，留着就是一堆星号和反引号。 */
export function stripMarkdown(text) {
  let s = String(text)
  s = s.replace(/```[\s\S]*?```/g, ' ')
  s = s.replace(/```[^\n]*$/gm, ' ')
  s = s.replace(/`([^`]*)`/g, '$1')
  s = s.replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
  s = s.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
  s = s.replace(/(\*\*|__)(.*?)\1/g, '$2')
  s = s.replace(/~~(.*?)~~/g, '$1')
  s = s.replace(/^[ \t]*(#+|>|[-*+]|[0-9]+\.[ \t])[ \t]+/gm, '')
  return s
}

/** 压成一行预览：洗掉 Markdown，取前几段有内容的文字，拼到字数上限为止。 */
export function previewOf(text, limit) {
  const lines = stripMarkdown(text).split('\n').map(l => l.replace(/\s+/g, ' ').trim()).filter(l => l !== '')
  let out = ''
  for (const line of lines) {
    const next = out === '' ? line : out + ' ' + line
    if (next.length > limit) break
    out = next
  }
  if (out === '') return ''
  return out.length > limit ? out.slice(0, limit) + '…' : out
}
/** 人读的时长。 */
export function humanDuration(ms) {
  const total = Math.max(0, Math.round(ms / 1000))
  if (total < 60) return total + ' 秒'
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  if (minutes < 60) return seconds === 0 ? minutes + ' 分' : minutes + ' 分 ' + seconds + ' 秒'
  const hours = Math.floor(minutes / 60)
  return hours + ' 时 ' + String(minutes % 60).padStart(2, '0') + ' 分'
}

/** 这一轮的结束原因该不该通知。 */
export function shouldNotify(cfg, kind) {
  if (kind === 'completed') return cfg.notifyCompleted
  if (kind === 'error') return cfg.notifyError
  if (kind === 'blocked') return cfg.notifyBlocked
  if (kind === 'max-tokens') return cfg.notifyMaxTokens
  if (kind === 'aborted') return cfg.notifyAborted
  return true
}

/**
 * 组装 `cmd notification post` 命令（纯函数，便于测试）。
 * `-i` 是状态栏小图标，`-I` 是展开后的大图（右侧缩略图）；两者为空就不带，用系统默认图标。
 * 已实测（vivo V2617A / Android 16）：`-I data:base64,…` 会被接受，dumpsys 里能看到
 * `android.largeIcon=Icon(typ=DATA …)`。
 */
export function buildCommand({ title, body, icon, largeIcon }) {
  const parts = ['cmd notification post', '-S bigtext', '-t', shellQuote(title)]
  if (typeof icon === 'string' && icon !== '') parts.push('-i', shellQuote(icon))
  if (typeof largeIcon === 'string' && largeIcon !== '') parts.push('-I', shellQuote(largeIcon))
  parts.push(TAG, shellQuote(body))
  return parts.join(' ')
}

export function apply(ctx, config = {}) {
  const cfg = { ...DEFAULTS, ...(config ?? {}) }
  if (cfg.enabled === false) return

  const log = (level, text) => {
    try {
      const logger = ctx?.logger
      if (typeof logger?.[level] === 'function') logger[level]('[whale-notify] ' + text)
      else if (level !== 'info') process.stderr.write('[whale-notify] ' + level + ': ' + text + '\n')
    } catch {}
  }

  /** 根会话 id → 本轮状态。 */
  const turns = new Map()

  // 桥断了只提示一次：Shizuku 掉线时每轮都刷日志没意义，但一次都不说就等于静默失败。
  let bridgeWarned = false

  const send = async (sessionId, kind, state) => {
    const bridge = ctx.get?.('androidBridge')
    if (typeof bridge?.request !== 'function' || bridge.connected === false) {
      if (!bridgeWarned) {
        bridgeWarned = true
        log('warn', '没有可用的 capability 桥，通知跳过：Shizuku 可能没在运行（打开 Shizuku 点「启动」），或当前会话模式里没有 system 工具组')
      }
      return
    }
    bridgeWarned = false
    const elapsed = state.startedAt === undefined ? undefined : Date.now() - state.startedAt
    if (elapsed !== undefined && cfg.minSeconds > 0 && elapsed < cfg.minSeconds * 1000) {
      log('info', '用时 ' + Math.round(elapsed / 1000) + 's 短于阈值，跳过通知')
      return
    }
    const head = cfg.title + ' · ' + (KIND_LABEL[kind] ?? kind)
    const lines = []
    if (elapsed !== undefined) lines.push('用时 ' + humanDuration(elapsed))
    if (cfg.includePreview && typeof state.last === 'string' && state.last !== '') {
      lines.push(previewOf(state.last, cfg.previewChars))
    }
    const body = lines.length === 0 ? '任务结束' : lines.join('\n')
    const showIcon = cfg.customIcon !== false
    const command = buildCommand({
      title: head,
      body,
      icon: showIcon ? ICON_URI : undefined,
      largeIcon: showIcon ? ICON_URI : undefined,
    })
    try {
      const result = await bridge.request('capability/invoke', {
        sessionId,
        callId: randomUUID(),
        tool: 'adb_shell',
        args: { command, timeout_s: 20 },
        timeoutMs: 15_000,
      }, { timeoutMs: 25_000 })
      if (result?.ok !== true) {
        const code = result?.error?.code ?? 'failed'
        const message = result?.error?.message ?? '未知错误'
        log('warn', '通知未发出（' + code + '）：' + message + '（以 App 身份发会被系统拒绝，只有 shell 身份即 Shizuku 能发）')
      }
    } catch (error) {
      log('warn', '通知未发出：' + (error?.message ?? error))
    }
  }

  ctx.on('session/event', (session, event) => {
    // 子 Agent 的结束汇报给父会话，不单独通知。
    if (session?.header?.parentSession !== undefined) return
    const sessionId = String(session?.id ?? '')
    if (sessionId === '') return
    const type = event?.type

    if (type === 'turn/start') {
      turns.set(sessionId, { startedAt: Date.now(), last: '' })
      return
    }
    if (type === 'assistant/message') {
      const text = textOf(event?.data?.message?.content ?? event?.data?.content)
      if (text === '') return
      const state = turns.get(sessionId) ?? { startedAt: Date.now(), last: '' }
      state.last = text
      turns.set(sessionId, state)
      return
    }
    if (type !== 'turn/end') return

    const state = turns.get(sessionId) ?? {}
    turns.delete(sessionId)
    const kind = String(event?.data?.reason?.kind ?? 'completed')
    if (!shouldNotify(cfg, kind)) return
    void send(sessionId, kind, state)
  })

  log('info', '已启用：标题「' + cfg.title + '」，通道 adb_shell（需要 Shizuku）；配置表单' + (Config === undefined ? '未加载' : '已加载'))
  const bridge0 = ctx.get?.('androidBridge')
  if (typeof bridge0?.request !== 'function' || bridge0.connected === false) {
    log('warn', '启动时没连上 capability 桥：Shizuku 不运行就不会有任何通知（插件本身已正常加载，把 Shizuku 启动起来即可）')
  }
}
