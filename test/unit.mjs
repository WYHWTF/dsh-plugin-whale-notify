// 纯逻辑与事件契约的自测，不依赖 dsh 运行时：
//   node test/unit.mjs
import assert from 'node:assert'
import * as mod from '../index.js'

/** 造一个最简 ctx：记录 bridge 的调用，暴露一个 session/event listener。 */
function harness(config = {}) {
  const calls = []
  let listener
  const ctx = {
    logger: { info() {}, warn(message) { calls.push(['log', message]) } },
    on(event, fn) { if (event === 'session/event') listener = fn },
    effect() { return () => {} },
    get(name) {
      if (name !== 'androidBridge') return undefined
      return {
        connected: true,
        request(method, params) {
          calls.push([method, params])
          return Promise.resolve({ ok: true, content: [{ type: 'text', text: 'posted' }] })
        },
      }
    },
  }
  mod.apply(ctx, { minSeconds: 0, ...config })
  assert.equal(typeof listener, 'function', 'should register a session/event listener')
  return { calls, emit: (session, event) => listener(session, event) }
}

const tick = (ms = 30) => new Promise(resolve => setTimeout(resolve, ms))
const root = { id: 'root-1', header: {} }
const sub = { id: 'sub-1', header: { parentSession: 'root-1' } }

// 1. 正常完成 → 一条通知，标题带原因
{
  const { calls, emit } = harness()
  emit(root, { type: 'turn/start', data: { turn: 1 } })
  emit(root, { type: 'turn/end', data: { reason: { kind: 'completed' } } })
  await tick()
  assert.equal(calls.length, 1, 'one bridge call')
  const [method, params] = calls[0]
  assert.equal(method, 'capability/invoke')
  assert.equal(params.tool, 'adb_shell')
  assert.match(params.args.command, /^cmd notification post -S bigtext -t '🐋 DSH · 完成' -i 'data:base64,/)
  assert.match(params.args.command, / -I 'data:base64,/)
  assert.match(params.args.command, /' dsh_turn '/)
}

// 2. 子 Agent 静默（汇报给父会话）
{
  const { calls, emit } = harness()
  emit(sub, { type: 'turn/start', data: {} })
  emit(sub, { type: 'turn/end', data: { reason: { kind: 'completed' } } })
  await tick()
  assert.equal(calls.length, 0, 'subagent must stay silent')
}

// 3. 手动中断默认不通知
{
  const { calls, emit } = harness()
  emit(root, { type: 'turn/start', data: {} })
  emit(root, { type: 'turn/end', data: { reason: { kind: 'aborted' } } })
  await tick()
  assert.equal(calls.length, 0, 'aborted is silent by default')
}

// 4. 打开预览后取到真实事件结构的文本（data.message.content），并排除 reasoning
{
  const { calls, emit } = harness({ includePreview: true })
  emit(root, { type: 'turn/start', data: { turn: 1 } })
  emit(root, {
    type: 'assistant/message',
    data: {
      turn: 1,
      step: 1,
      message: {
        role: 'assistant',
        content: [
          { type: 'reasoning', text: '先想一想这个方案行不行' },
          { type: 'text', text: '装好了。通知栏看一下 🐋\n第二行细节' },
        ],
      },
    },
  })
  emit(root, { type: 'turn/end', data: { reason: { kind: 'completed' } } })
  await tick()
  const command = calls[0][1].args.command
  assert.ok(command.includes('装好了。通知栏看一下 🐋 第二行细节'), 'preview from data.message.content')
  assert.ok(!command.includes('先想一想'), 'reasoning must never reach the notification')
}

// 5. 预览默认关闭（0.2.0 起：锁屏可见 = 隐私）
{
  const { calls, emit } = harness()
  emit(root, { type: 'turn/start', data: {} })
  emit(root, { type: 'assistant/message', data: { message: { role: 'assistant', content: [{ type: 'text', text: '秘密' }] } } })
  emit(root, { type: 'turn/end', data: { reason: { kind: 'completed' } } })
  await tick()
  assert.ok(!calls[0][1].args.command.includes('秘密'), 'preview off by default')
}

// 6. 单引号转义
{
  const { calls, emit } = harness({ includePreview: true })
  emit(root, { type: 'turn/start', data: {} })
  emit(root, { type: 'assistant/message', data: { message: { content: [{ type: 'text', text: "it's broken, can't fix" }] } } })
  emit(root, { type: 'turn/end', data: { reason: { kind: 'error' } } })
  await tick()
  const command = calls[0][1].args.command
  assert.match(command, /DSH · 出错/)
  assert.ok(command.includes("it'\\''s broken"), 'single quote escaped for sh')
}

// 7. 纯函数
assert.equal(mod.humanDuration(45_000), '45 秒')
assert.equal(mod.humanDuration(135_000), '2 分 15 秒')
assert.equal(mod.humanDuration(3_930_000), '1 时 05 分')
assert.equal(mod.previewOf('a\n\nb   c', 10), 'a b c')
assert.equal(mod.previewOf('参考 [文档](https://x.y) 和 **重点**', 60), '参考 文档 和 重点')
assert.equal(mod.shouldNotify({ notifyAborted: false }, 'aborted'), false)
assert.equal(mod.shouldNotify({ notifyError: true }, 'error'), true)
assert.ok(!mod.previewOf('看这个:\n```bash\nnpm i\n```\n装好了', 60).includes('```'))
assert.ok(!mod.previewOf('**粗体** 和 `代码`', 60).includes('*'))

// 8. 默认 60 秒阈值：短对话不打扰（这是本插件的定位——只服务长任务）
{
  const { calls, emit } = harness({ minSeconds: 60 })
  emit(root, { type: 'turn/start', data: {} })
  emit(root, { type: 'turn/end', data: { reason: { kind: 'completed' } } })
  await tick()
  assert.equal(calls.length, 0, 'quick chat must stay silent under the 60s default')
}

// 9. 默认值本身
assert.equal(mod.apply.toString().includes('minSeconds'), true)

console.log('all tests passed')
