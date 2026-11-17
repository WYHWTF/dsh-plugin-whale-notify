# dsh-plugin-whale-notify 🐋

> **Scope: proven on vivo only — other brands, use with caution.**

One notification when a turn ends, for **DSH-Android** (DeepSeek Harness running on a phone).

The point is not the notification; it is what the notification does to your attention.

A turn can think and call tools for minutes. The app has no "done" notification of its own, so the
only way to know whether the agent finished is to come back and look — which means long tasks are
only usable if you sit there, or if you keep interrupting whatever else you were doing.

This decouples the length of the task from the length of your attention: start it, walk away, get
pinged once, come back. Turns shorter than `minSeconds` (60 s by default) stay silent, so ordinary
chat does not nag you.

## Compatibility

> **vivo: supported. Other brands: use with caution.**
>
> The only phone this was actually tested on is a **vivo V2617A (PD2617) / OriginOS 16.0 /
> Android 16 (SDK 36)**. Xiaomi, OPPO, HUAWEI, HONOR, Samsung, OnePlus and everything else are
> **untested**: they handle notification channels, silent modes and background policy
> differently, and the plugin may post nothing there at all. Please don't install it on those
> expecting it to work — and don't report "it's broken" before running the self-check below.
> The code path is identical on every Android; the vendor policy is not.

| | |
|---|---|
| Tested on | **vivo V2617A (PD2617)**, OriginOS 16.0, Android 16 (SDK 36) |
| Tested with | DSH-Android 0.3.11, engine 0.2.1-rc.5, Shizuku 13.5 (adb mode) |
| Other vendors | **use with caution** — untested, may post nothing (see the self-check) |
| Requirements | Shizuku running (see below), the conversation's mode must offer the `system` tool group |

### 30-second self-check (any Android phone)

In the end the plugin just runs this one command as the `shell` uid:

    cmd notification post -S bigtext -t 'self check' dsh_turn 'if this shows up, this phone can do it'

Run it once — ask the agent to call `adb_shell` with that command, or use a Shizuku terminal.

- A notification appears → this phone is fine, install away.
- Nothing appears, or you get an error → paste it into an issue. That tells us something about
  *that* ROM; it is not proof that the plugin is broken.


## Why it goes through Shizuku

Measured on the device above:

- The app owns exactly **one** notification channel, `engine` (Agent 引擎, importance 2, silent,
  ongoing). It keeps the foreground service alive; it is not a message channel.
- The engine runs in the app's `:engine` process. `cmd notification post` executed with the app's
  uid is refused by Android: `permission denied: callingUid=…`.
- The same command executed as `shell` (Shizuku) works.

So the plugin listens for a root session's `turn/end` and calls the device capability `adb_shell`
through the `androidBridge` service (`@dsh-android/plugin-device`).

> **This bypasses dsh's approval flow.** Calling the bridge directly means the notification is
> posted without an approval card — otherwise every notification would need a tap, which defeats
> the purpose. The plugin executes exactly one fixed command (`cmd notification post …`) that it
> builds itself; the only pieces that come from outside are the title prefix (your config) and the
> answer preview, and both are single-quote escaped. It never runs a command you or the model
> wrote.

## Behaviour

- Root sessions only; sub-agent turns report to their parent and are not notified.
- Title carries the end reason: 完成 / 出错 / 已停止 / 达上限 / 已中断.
- Body carries the elapsed time, plus a preview of the answer if you enable it.
- One tag (`dsh_turn`), so a new notification replaces the previous one.
- The notification icon is the DSH whale, shipped in the package as `icon-notification.jpg` and
  sent as `data:base64` so it needs no external path (taken from the DSH-Android app icon, the
  repository is Apache-2.0). The same bitmap is also passed as `-I`, so the expanded notification
  shows the whale as a large thumbnail on the right. `customIcon: false` turns both off and falls
  back to the system default.
- Graceful degradation: no bridge, no Shizuku, or a mode that excludes the tool → the notification
  is skipped. Nothing is thrown, the conversation is not disturbed, and the engine log gets **one**
  `warn` line (once, not every turn) so you can tell "Shizuku is down" from "the plugin is broken".

## Privacy

**The preview is off by default** since 0.2.0. A notification is visible on the lock screen, so
showing the beginning of the model's answer there leaks whatever was in it (messages, grades,
health data). Turn `includePreview` on if your lock screen is private enough.

When the preview is on, only `type: "text"` blocks are used: the model's `reasoning` blocks never
reach the notification.

## Config

Field | Default | Meaning
--- | --- | ---
`enabled` | `true` | Master switch
`title` | `🐋 DSH` | Notification title prefix
`notifyCompleted` / `notifyError` / `notifyBlocked` / `notifyMaxTokens` / `notifyAborted` | `true` / `true` / `true` / `true` / `false` | Which end reasons notify
`customIcon` | `true` | Use the DSH whale as the small icon and the expanded large icon
`includePreview` | `false` | Append the beginning of the answer (visible on the lock screen)
`previewChars` | `100` | Preview length cap
`minSeconds` | `60` | Only long tasks: shorter turns stay silent, so chat does not nag you

## Install (phone)

1. DSH → 扩展 / 插件 → 添加插件.
2. Enter the npm spec, the tarball URL, or a local `.zip` path.
3. Restart the engine when prompted (the app restarts it automatically once idle).

## Limitations

- Needs Shizuku running. It is not required at install time, but no notification appears without it.
- The notification is posted as `shell`, so the icon is the Android robot and the channel is the
  system's `Shell command` (importance 3): it lands in the shade and sounds, but it is **not a
  heads-up banner** unless you switch that channel to 悬浮通知 in Android settings.
- The conversation's mode must include the `system` device group, otherwise the call is refused
  and skipped (a single `warn` lands in the engine log).
- `turn/end` is only reported when the turn really ends; plugin-guard's continuation nudge keeps a
  turn running, so no premature "done".

## Maintenance

Maintained at a **low frequency**: DSH-Android and the harness move fast (the engine went through
several release candidates in weeks), so this may lag behind a breaking change until someone
reports it. Issues are read when there is time; fixes depend on being able to reproduce.

MIT licensed, no warranty. If the app later grows a real notification capability, this plugin
should be replaced by it.

## Development

```sh
node --check index.js          # syntax
node test/unit.mjs             # logic, event shapes, Markdown stripping
node <dsh-plugin-guide>/bin/dsh-plugin-dev.js check --cwd .   # contract checks
```

`stripMarkdown`, `previewOf`, `humanDuration`, `shouldNotify` and `buildCommand` are pure and
exported for testing.
