# dsh-plugin-whale-notify 🐋

> **Alcance: probado solo en vivo — otras marcas, úsalo con precaución.**

Una notificación cuando termina un turno, para **DSH-Android** (DeepSeek Harness en el teléfono).

La app no tiene notificación propia de "tarea terminada", así que sin esto hay que mirar la
pantalla de DSH para saber si el agente acabó.

## Compatibility

> **vivo: compatible. Otras marcas: úsalo con precaución.**
>
> El único teléfono realmente probado es un **vivo V2617A (PD2617) / OriginOS 16.0 /
> Android 16 (SDK 36)**. Xiaomi, OPPO, HUAWEI, HONOR, Samsung, OnePlus y el resto **no están
> probados**: gestionan los canales de notificación, el modo silencioso y la política de segundo
> plano de otra manera, y puede que no muestren nada. No lo instales esperando que funcione, y no
> reportes "no funciona" antes de hacer la autocomprobación de abajo: la ruta del código es la
> misma en todos los Android, la política del fabricante no.

| | |
|---|---|
| Probado en | **vivo V2617A (PD2617)**, OriginOS 16.0, Android 16 (SDK 36) |
| Probado con | DSH-Android 0.3.11, motor 0.2.1-rc.5, Shizuku 13.5 (modo adb) |
| Otras marcas | **precaución** — sin probar, puede no mostrar nada |
| Requisitos | Shizuku en marcha, y el modo de la conversación debe ofrecer el grupo `system` |

### Autocomprobación de 30 segundos (cualquier Android)

Al final el plugin solo ejecuta este comando como uid `shell`:

    cmd notification post -S bigtext -t 'prueba' dsh_turn 'si aparece esto, este teléfono puede'

Ejecútalo una vez (pide al agente que use `adb_shell`, o usa un terminal de Shizuku).

- Aparece una notificación → el teléfono vale, instálalo.
- No aparece, o da error → pégalo en un issue. Eso habla de *esa* ROM, no prueba que el plugin
  esté roto.


## Why it goes through Shizuku

La app solo tiene un canal de notificación, `engine` (importancia 2, silencioso, permanente), que
mantiene vivo el servicio en primer plano. Publicar con el uid de la app es rechazado por Android
(`permission denied: callingUid=…`); con el uid de `shell` (Shizuku) funciona. Por eso el plugin
escucha `turn/end` de la sesión raíz y llama a `adb_shell` a través de `androidBridge`.

> Esto **omite el flujo de aprobación** de dsh. El plugin ejecuta un único comando fijo
> (`cmd notification post …`) que construye él mismo; el título y la vista previa van escapados.

## Behaviour

- Solo sesiones raíz; los subagentes informan a su padre.
- El título lleva el motivo: 完成 / 出错 / 已停止 / 达上限 / 已中断.
- El cuerpo lleva el tiempo transcurrido y, si lo activas, una vista previa de la respuesta.
- Una sola etiqueta (`dsh_turn`): la nueva notificación reemplaza la anterior.
- Degradación elegante: sin puente, sin Shizuku o con un modo que excluya la herramienta, no hace
  nada; el registro del motor recibe **una** línea `warn` (una vez, no en cada turno) para distinguir
  "se cayó Shizuku" de "el plugin está roto".

## Privacy

La vista previa está **desactivada por defecto** (desde 0.2.0): la notificación se ve en la
pantalla de bloqueo. Cuando la activas, solo se usan los bloques `type: "text"`; los bloques
`reasoning` nunca llegan a la notificación.

## Config

`enabled`, `title`, `notifyCompleted`, `notifyError`, `notifyBlocked`, `notifyMaxTokens`,
`notifyAborted`, `includePreview` (por defecto `false`), `previewChars`, `minSeconds`.

## Install (phone)

DSH → Extensiones / Plugins → Añadir plugin → introduce el nombre npm, la URL del tarball o la ruta
de un `.zip` local → reinicia el motor cuando se te pida.

## Limitations

- Requiere Shizuku en ejecución.
- La notificación se publica como `shell`: icono del robot de Android y canal `Shell command`
  (importancia 3) — aparece en la barra y suena, pero no es un banner salvo que actives «悬浮通知».
- El modo de la conversación debe incluir el grupo `system`.

## Maintenance

Mantenimiento de **baja frecuencia**; puede quedarse atrás ante un cambio incompatible hasta que
alguien lo reporte. Licencia MIT, sin garantía.

## Development

```sh
node --check index.js
node test/unit.mjs
```
