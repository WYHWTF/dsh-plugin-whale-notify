# Changelog

## 0.2.1 — unreleased

- The notification icon is now the DSH whale instead of the Android robot. `cmd notification post`
  accepts `-i <iconspec>`; a cross-package resource reference (`@pkg:drawable/name`) is refused by
  the system (`invalid icon`), and the app is a vector adaptive icon with no bitmap, so the whale
  ships as a small JPEG inside the package and is sent as `data:base64`.
- New `customIcon` switch (default `true`).
- The whale is now also the **large icon** (`-I`): the expanded notification shows it as a
  thumbnail on the right, instead of only the status-bar `-i` icon. Measured on the test device —
  `-I 'data:base64,…'` is accepted and `dumpsys notification` reports
  `android.largeIcon=Icon(typ=DATA len=2039)`; without `-I` the extra is absent.
- Configuration problems are no longer silent. When the `androidBridge` capability bridge is not
  there (Shizuku not running, or a mode without the `system` tool group), the plugin writes **one**
  `warn` line to the engine log — at start-up and on the first skipped notification, not once per
  turn — instead of hiding behind `info`. Failed posts also say out loud that only the `shell` uid
  can post a notification, so "Shizuku is down" can be told apart from "the plugin is broken".
- README (all five languages) now states the scope up front: **supported on vivo, other brands use
  with caution**, plus a **30-second self-check** command that lets anyone prove whether their own
  phone can post the notification before blaming the plugin.

## 0.2.0

- **Breaking-ish:** `includePreview` now defaults to `false`. A notification preview is visible on
  the lock screen; showing model output there by default is a privacy leak. Turn it on in the
  plugin settings if you want it.
- Description and README state the tested device (vivo V2617A / Android 16) and that other vendors
  are untested.

- `minSeconds` now defaults to **60**: the plugin targets long tasks, so ordinary chat turns stay
  silent. Still configurable (set `0` to be notified about every turn).
- README and the store description now state the actual point: it decouples the length of a task
  from the length of your attention.
## 0.1.2

- Strip Markdown from the preview (fenced code, inline backticks, bold/italic, links, headings and
  bullets). The shade renders none of it, so the raw markers were noise. Code blocks are dropped
  entirely.
- `previewOf()` joins whole lines up to the character cap instead of slicing at an arbitrary
  character, and collapses runs of whitespace inside a line.

## 0.1.1

- Fix: the preview was always empty. The real shape of an assistant message in the session log is
  `data.message.content`, not `data.content`.
- The preview only takes `type: "text"` blocks, so `type: "reasoning"` (the model's thinking) never
  reaches the notification.

## 0.1.0

- First version: on a root session's `turn/end`, post one notification through `androidBridge` →
  `adb_shell` (Shizuku). Title carries the end reason, body carries the elapsed time.
