# dsh-plugin-whale-notify 🐋

> **Escopo: testado apenas em vivo — outras marcas, use com cautela.**

Uma notificação quando um turno termina, para **DSH-Android** (DeepSeek Harness no celular).

O app não tem notificação própria de "tarefa concluída", então sem isso é preciso ficar olhando a
tela do DSH para saber se o agente terminou.

## Compatibility

> **vivo: funciona. Outras marcas: use com cautela.**
>
> O único aparelho realmente testado é um **vivo V2617A (PD2617) / OriginOS 16.0 /
> Android 16 (SDK 36)**. Xiaomi, OPPO, HUAWEI, HONOR, Samsung, OnePlus e os demais **não foram
> testados**: tratam canais de notificação, modo silencioso e política de segundo plano de outra
> forma, e pode ser que nada apareça. Não instale esperando que funcione, e não abra "não funciona"
> antes da autoverificação abaixo: o caminho do código é o mesmo em todo Android, a política do
> fabricante não.

| | |
|---|---|
| Testado em | **vivo V2617A (PD2617)**, OriginOS 16.0, Android 16 (SDK 36) |
| Testado com | DSH-Android 0.3.11, motor 0.2.1-rc.5, Shizuku 13.5 (modo adb) |
| Outras marcas | **cautela** — não testadas, pode não exibir nada |
| Requisitos | Shizuku em execução, e o modo da conversa precisa oferecer o grupo `system` |

### Autoverificação de 30 segundos (qualquer Android)

No fim o plugin apenas executa este comando como uid `shell`:

    cmd notification post -S bigtext -t 'teste' dsh_turn 'se isto aparecer, este aparelho pode'

Rode uma vez (peça ao agente para usar `adb_shell`, ou use um terminal do Shizuku).

- A notificação aparece → o aparelho serve, pode instalar.
- Não aparece, ou dá erro → cole num issue. Isso fala daquela ROM, não prova que o plugin quebrou.


## Why it goes through Shizuku

O app tem apenas um canal de notificação, `engine` (importância 2, silencioso, permanente), que
mantém o serviço em primeiro plano. Publicar com o uid do app é recusado pelo Android
(`permission denied: callingUid=…`); com o uid de `shell` (Shizuku) funciona. Por isso o plugin
escuta `turn/end` da sessão raiz e chama `adb_shell` via `androidBridge`.

> Isso **ignora o fluxo de aprovação** do dsh. O plugin executa um único comando fixo
> (`cmd notification post …`) montado por ele mesmo; título e prévia passam por escape.

## Behaviour

- Apenas sessões raiz; subagentes reportam ao pai.
- O título traz o motivo: 完成 / 出错 / 已停止 / 达上限 / 已中断.
- O corpo traz o tempo decorrido e, se ativado, uma prévia da resposta.
- Uma única tag (`dsh_turn`): a nova notificação substitui a anterior.
- Degradação elegante: sem ponte, sem Shizuku ou com um modo que exclua a ferramenta, nada acontece;
  o log do motor recebe **uma** linha `warn` (uma vez, não a cada turno) para distinguir
  "o Shizuku caiu" de "o plugin quebrou".

## Privacy

A prévia vem **desativada por padrão** (desde 0.2.0): a notificação aparece na tela de bloqueio.
Quando ativada, apenas blocos `type: "text"` são usados; blocos `reasoning` nunca chegam à notificação.

## Config

`enabled`, `title`, `notifyCompleted`, `notifyError`, `notifyBlocked`, `notifyMaxTokens`,
`notifyAborted`, `includePreview` (padrão `false`), `previewChars`, `minSeconds`.

## Install (phone)

DSH → Extensões / Plugins → Adicionar plugin → informe o nome npm, a URL do tarball ou o caminho de
um `.zip` local → reinicie o motor quando solicitado.

## Limitations

- Requer Shizuku em execução.
- A notificação é publicada como `shell`: ícone do robô do Android e canal `Shell command`
  (importância 3) — aparece na barra e toca, mas não é banner, a menos que ative «悬浮通知».
- O modo da conversa precisa incluir o grupo `system`.

## Maintenance

Manutenção de **baixa frequência**; pode ficar para trás numa mudança incompatível até alguém
relatar. Licença MIT, sem garantia.

## Development

```sh
node --check index.js
node test/unit.mjs
```
