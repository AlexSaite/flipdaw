Ниже — сводка "минного поля" на 9 сентября 2026 г. Окно «последние 3 месяца» (≈ 9 июня – 9 сентября 2026) покрыто, ключевые supply chain-кампании, по которым **нет CVE и нет патчей вообще** (это отдельный класс от классических CVE), вынесены в первую таблицу — они приоритетны именно потому, что CVE-сканеры их не видят.

## Почему это важно именно для ИИ-агента

За последние 9 месяцев вредоносные кампании целенаправленно сместились в сторону ИИ-инструментария: из 59 отслеженных кампаний 14 целились в ИИ-агентов, MCP-серверы, `.cursorrules`/`CLAUDE.md`/SessionStart hooks Claude Code и расширения VS Code.【turn2fetch1】【turn6fetch0】 Ключевой вывод отчёта Phoenix Security: **во всех 59 кампаниях за два года не было назначено ни одного CVE во время активной эксплуатации** — CVE-сканеры слепы к 100 % таких случаев, угроза живёт в доверии к пакету, а не в дефекте кода.【turn2fetch0】【turn6fetch0】 Это значит, что для вашего агента мало обновлять базу CVE — нужна отдельная блокировка по точным `name@version` IOC.

## 1. Активные supply chain-кампании (без CVE, IOC-блокировка по имени и версии)

| Пакет | Кампании | Затронутые версии | Статус патча | Действие |
|---|---|---|---|---|
| `keyv` | ChainDrop / Shai-Hulud 2.0 (4 авг 2026) | `6.0.0` | Патча нет — чистые версии выпущены ранее | Пин к `5.x`, удалить 6.0.0, ротация всех токенов |
| `flat-cache` | ChainDrop | `6.1.24` | Патча нет | Пин к предыдущей версии |
| `file-entry-cache` | ChainDrop | `11.1.6` | Патча нет | Даунгрейд |
| `cacheable-request` | ChainDrop | `13.0.20` | Патча нет | Даунгрейд |
| `cacheable`, `@cacheable/memory`, `@cacheable/net`, `@cacheable/node-cache`, `@cacheable/utils` | ChainDrop | `2.5.1`, `2.2.1`, `2.1.1`, `3.1.2` | Патча нет | Даунгрейд |
| `cache-manager` | ChainDrop | `7.2.10` | Патча нет | Даунгрейд |
| `ecto` | ChainDrop | `5.0.1` | Патча нет | Даунгрейд |
| + **433 других пакета**, 2 212 версий | ChainDrop, 4 авг 2026 | точные версии в списке StepSecurity | нет | Сверить lockfile по полному списку IOCs【turn3fetch0】 |

**Характер атаки:** через `preinstall` скачивается Bun-рантайм, запускается обфусцированный 710-КБ второй стейдж, ворует npm/GitHub/AWS/Kubernetes-токены и **устанавливает persistence в Claude Code, VS Code и GitHub Copilot**. Публикация шла через OIDC Trusted Publishing с валидной SLSA-attestation — то есть проверка provenance не помогает.【turn3fetch0】【turn0search13】

## 2. Кампании из того же окна / сразу перед ним — «новые обходы защит»

| Кампания | Дата | Экосистема | Обход защиты | Пакеты | Патч |
|---|---|---|---|---|---|
| **Miasma Wave 2 / Phantom Gyp** | 2–3 июня 2026 | npm | `binding.gyp` (SHA-256 `ef641e956f91d501b748085996303c96a64d67f63bfeef0dda175e5aa19cca90`) выполняется через `node-gyp rebuild` и **обходит `--ignore-scripts` и все lifecycle-мониторы** | 57 пакетов, 286 версий | нет |
| **IronWorm** | июнь 2026 | npm | Компилированный 976-КБ Rust ELF-бинарь с eBPF-руткитом и Tor C2; целенаправленно сканирует ключи **Anthropic, OpenAI, Gemini, Cohere, Mistral, Groq, Perplexity, xAI**; самораспространение через OIDC-федерацію без stored-токена | 37 пакетов, 9 организаций | нет |
| **TrapDoor** | 22–26 мая 2026 | npm + PyPI + Crates.io | Отравление `.cursorrules` и `CLAUDE.md` **zero-width Unicode**-инструкциями; PR в `browser-use`, `langchain-ai/langchain`, `langflow-ai/langflow` | 34 пакета, 384+ версии | нет |
| **Mini Shai-Hulud (SAP CAP)** | апрель–май 2026 | npm | **Claude Code SessionStart hooks + VS Code `tasks.json` folderOpen** — persistence, переживает деинсталляцию пакета | ~1 800 repos-exfiltrators | нет |
| **MEGALODON_CI** | 18 мая 2026 | GitHub Actions | 5 718 malicious workflow-коммитов в 5 561 репозиториях, backdoor через `workflow_dispatch` | 5 561 репо | нет |
| **Laravel-Lang tag-redirect** | 22 мая 2026 | Packagist | GitHub fork tag-redirect — официальный репо выглядит чистым, но Composer тянет инъекцию | 233 версии, 700+ downstream | нет |

Полный timeline и фингерпринты — в отчёте Phoenix Security MPI【turn2fetch0】【turn3fetch0】【turn4fetch0】【turn6fetch0】.

## 3. Классические CVE без патча (June–September 2026 и краевые случаи)

| CVE / ID | Пакет | CVSS | Что происходит | Статус патча |
|---|---|---|---|---|
| CVE-2026-12772, -12795, -127**x** | `litellm` (PyPI) | 7.1 / 6.9 / – | Insufficient Session Expiration, Missing Auth; **в версии 1.94–1.97 патча нет**, GitHub issue открыт 1 авг 2026, LiteLLM не выпустил fix-релиз | нет【turn3search5】【turn0search5】 |
| CVE-2026-45829 | `chromadb` (PyPI, Python FastAPI server) | **10.0** | RCE до авторизации через `trust_remote_code` + произвольный `model_name` из HuggingFace; unpatched в 1.5.9 (latest на момент отчёта, май 2026) | нет【turn0search7】 |
| CVE-2026-44484 | `pytorch-lightning` (PyPI) | 9.8 | Компромисс версий 2.6.2 и 2.6.3 с credential-harvester | фикс-версии нет; mitigation — пин к `2.6.1`【turn0search6】 |
| CVE-2026-33017 | `langflow` (PyPI) | 9.3 | Unauthenticated RCE, эксплойт в wild через 20 часов; **v1.8.2 формально "fixed", но JFrog подтверждает — уязвимость всё ещё эксплуатируема**; патч обещан в 1.9.0 (не вышла) | нет / частично【turn0search5】 |
| gerapy | `gerapy` (PyPI) | — | Missing Authentication; fixed-версия **не опубликована** в PyPI, правка только в master | нет【turn3search3】 |
| CVE-2026-48934 | Node.js | HIGH | **Incomplete fix** — повторное открытие после июльского релиза; высокий севери́ти | частично【turn0search11】 |

## 4. Сигнатуры «мин» для вашей карты — grep-паттерны

Что проверить в lockfile, workspace и agent-конфигах агента прямо сейчас:

- **`binding.gyp`** в npm-пакете, который не использует native addons — маркер Phantom Gyp. `grep -rn "binding.gyp"` по lockfile.【turn6fetch0】
- **`bun`** в нестандартных путях (`/tmp/bun`, `~/bun`) — маркер Mini Shai-Hulud / Miasma / ChainDrop.【turn8fetch0】
- **`.vscode/tasks.json`** с `runOn: "folderOpen"`, `reveal: never`, `echo: false`.【turn8fetch0】
- **`~/.claude/settings.json` SessionStart hooks**, `CLAUDE.md`, `.cursorrules` — искать **zero-width Unicode**: U+200B, U+200C, U+200D, U+FEFF.【turn8fetch0】
- **Строки "Shai-Hulud"**, **"Miasma: The Spreading Blight"** в GitHub-репозиториях под вашими аккаунтами (exfil-репо).【turn8fetch0】
- **Процесс Tor** с CI-раннера или dev-машины — высокий маркер IronWorm.【turn8fetch0】
- База IOCs для автоматической блокировки: **Phoenix MPI** (`phxintel.security/package.html`, 657 пакетов), **StepSecurity OSS Security Feed**, **Aikido, Socket, DataDog Security Labs** — все обновляются в реальном времени.【turn8fetch0】【turn3fetch0】

## 5. Готовые команды для пополнения карты

```bash
# OSV-Scanner — фильтр "no fix available"
osv-scanner --lockfile=package-lock.json --format=json | jq '.results[] | select(.packages[].vulnerabilities[]?.severity[0].type == "CRITICAL")'

# Сверка lockfile с Phoenix MPI IOC set
# (экспорт JSON с phxintel.security/package.html, далее jq-сопоставление name@version)

# TrapDoor / Miasma / ChainDrop по known IOCs
grep -rn "binding.gyp" **/node_modules/** 2>/dev/null
grep -rn "Miasma: The Spreading Blight" .git/ ../ --include="*.json" 2>/dev/null
find . -name "bun" -not -path "*/node_modules/bun-*" 2>/dev/null
```

OSV-Scanner V2 (Google, Apache 2.0) поддерживает 20+ экосистем и даёт машину-читаемый JSON для интеграции в пайплайн агента.【turn0search12】【turn4search7】 Carbon14 — неплохая дополнительная агрегированная лента no-fix CVE.【turn0search10】

## 6. Что читать/подключать, чтобы карта не устарела

- **OSV.dev** — фильтр по `ecosystem`, `severity=CRITICAL`, `fix available=no`【turn0search10】【turn0search11】
- **GitHub Advisory Database** — фильтр ` CWE + no patch`【turn0search10】
- **StepSecurity OSS Security Feed** — live-список IOCs атак в реальном времени【turn3fetch0】
- **Phoenix MPI** — behavioral-скоринг пакетов без CVE【turn2fetch1】【turn6fetch0】
- **Socket.dev**, **Aikido**, **DataDog Security Labs**, **Snyk** — независимые каналы исследования malicious-пакетов【turn3search0】【turn3search13】

**Практический минимум для вашего агента:** (1) пин GitHub Actions к полным SHA, (2) `npm ci --ignore-scripts` как частичная мера — **не спасает от Phantom Gyp**, (3) `pnpm 11+` с cooldown в 1 день для новых релизов — блокирует worm-распространение того же дня, (4) поведенческий скан зависимостей в дополнение к CVE-сканеру, (5) аудит `.cursorrules`/`CLAUDE.md`/`.vscode/tasks.json` перед каждым запуском.【turn8fetch0】【turn2fetch1】