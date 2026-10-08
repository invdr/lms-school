# Проверки проекта

Основная ветка — `develop`, remote — `origin` (`invdr/lms-school`). 8 октября 2026 владелец отменил прежнее решение об отключении GitHub Actions. Deploy и публикация образов остаются отдельными ручными решениями.

## Быстрый локальный gate

Нужны Node.js 24 с Corepack и Python 3.10+. Первый запуск:

```sh
python3 -m venv .venv-checks
.venv-checks/bin/pip install -r tools/requirements-checks.txt
corepack yarn install --frozen-lockfile
corepack yarn hooks:install
```

Перед каждым push:

```sh
bash tools/check-quick.sh
```

Gate включает `git diff --check`, синтаксис Python/JSON/YAML/TOML, маркеры конфликтов, Ruff, проверки выбора packaging job на настоящей Git-истории и 85 frontend-тестов в 21 файле. Vitest использует максимум два worker; DOM запускается только там, где нужен. Docker и production build перед обычным push не запускаются.

Hook `.githooks/pre-push` проверяет чистое дерево и отправляемый HEAD. Не обходить его через `--no-verify`. Если checkout содержит чужие незакоммиченные изменения, работать и отправлять feature-ветку из отдельного worktree.

При изменении backend выполнить релевантные integration-тесты, например:

```sh
bash tools/check-backend.sh lms.tests.api.test_payments lms.tests.security.test_auth
```

Без аргументов `check-backend.sh` запускает весь набор. Runner отклоняет пустой прогон и пропуски тестов, даже если Bench завершился с кодом 0. Не использовать `--skip-test-records`: в Frappe 16 это может дать успешный выход без выполнения тестов.

## CI и release gates

Один workflow `.github/workflows/checks.yml`, один Linux runner, без матриц. Push запускает проверки всех веток; PR-события нужны только для внешних fork, поскольку внутренние PR уже проверяются push-прогоном. `workflow_dispatch` позволяет повторить диагностику. Повторный push отменяет предыдущий прогон той же ветки.

Обязательные проверки:

1. Быстрый gate.
2. Linux production build текущего checkout.
3. Полный backend integration и security/contract набор: реальные контроллеры, пользователи и отдельная MariaDB, 363 метода в 36 тестовых файлах плюс общий `test_helpers.py`.
4. Короткий HTTP smoke: Frappe ping, серверная страница портала и доступность опубликованных JS/CSS production-ассетов. Это не браузерный E2E.
5. При изменениях упаковки — Docker build тестового runtime с текущими исходниками и зависимостями, а также валидация Compose. `docker/check.Containerfile` проверяет установку в том же закреплённом Bench runtime; образ не публикуется и не является новой конфигурацией deploy.

Селектор `tools/ci-changes.py` сравнивает всю feature-ветку от merge-base с `origin/develop`, включая удаления и перемещения. Он не использует только последний push или ограниченные event path filters: изменение зависимости продолжает требовать build после следующего source-only push и отмены предыдущего workflow. На release-ветках `develop`/`master`/`main` сравниваются предыдущий и текущий commit; для первого push выбирается build. Ошибка определения diff блокирует workflow.

Docker build выбирается для `docker/**`, workflow и `tools/**`, обоих package/lock-файлов, `pyproject.toml`, `MANIFEST.in`, `.dockerignore` и Vite runtime/build-конфигурации. Actions закреплены по SHA, `permissions: contents: read`, checkout без сохранения credentials. CI не получает production secrets, не публикует образы и не выполняет deploy. Frappe/Payments закреплены в `tools/framework-revisions.env`; Bench image — по digest. БД/Redis создаются отдельно и удаляются после прогона. Внешние gateways/календарные API замоканы тестами, платёжные данные изолированы.

Перед merge требуются успешные проверки **точного итогового feature commit**. Пропуск основного job для внутреннего PR не заменяет успешный push-run этого commit. После merge перед deploy требуется успешный CI **точного основного commit**. При недоступном CI выполнить полный локальный прогон и три браузерных сценария ниже на соответствующем commit. Падения и пропуски не считаются успехом. В этой задаче merge/deploy не выполняются.

## Полный локальный прогон

Для диагностики и недоступного CI:

```sh
bash tools/check-local.sh
```

Команда выполняет quick gate, production build, Docker packaging/Compose, весь backend набор и HTTP smoke. Диагностический полный прогон всегда проверяет упаковку, чтобы fallback при недоступном CI не пропускал release gate. Не повторять тяжёлый прогон после успешного CI без конкретной причины. Coverage и проценты покрытия не используются как критерий полезности тестов.

При `LMS_LOCAL_CHECKS=1` только build-time импорт `sites/common_site_config.json` заменяется на `tools/local-site-config.json`. Обычная deploy-сборка использует настоящий конфиг сайта.

Docker checks работают в проекте `albadr-tests`, используют игнорируемые `.local-tests/bench`, `.local-tests/cache` и отдельный том `albadr-tests_test-db` с таблицами, чувствительными к регистру. Сайт — `lms.test`, `allow_tests=true`, `mute_emails=true`. Перед прогоном текущие исходники копируются заново, удалённые тесты удаляются и из Bench-копии, framework pins и зависимости сверяются/обновляются даже на уже запущенном Bench, схема мигрируется. Обязательный Frappe email CSS bundle собирается и в CI: регистрационные fixtures рендерят письма при выключенной отправке. CI не собирает полный Desk (`LMS_TEST_ASSETS=0`); локально он доступен для браузера. После смены framework pin оба asset-маркера сбрасываются; подготовка ассетов выполняется и на тёплом Bench.

Если порт занят: `ALBADR_TEST_PORT=18081 bash tools/check-local.sh`. Остановка сервисов:

```sh
docker compose -p albadr-tests -f docker/tests.compose.yml stop
```

Для существующего локального тестового Bench:

```sh
LMS_BENCH_DIR=/absolute/path/to/frappe-bench LMS_TEST_SITE=lms.test \
  LMS_TEST_URL=http://127.0.0.1:8000 bash tools/check-local.sh
```

Native сервер должен быть запущен на указанном loopback URL и обслуживать тот же тестовый Bench; smoke передаёт выбранное `*.test` имя в Host. `LMS_TEST_URL` обязателен, иначе fallback останавливается до тяжёлых проверок. Его `apps/lms` должен указывать на этот checkout; Payments/LMS и актуальные зависимости установлены, Frappe email/Desk assets собраны, схема предварительно мигрирована, имя сайта — только `*.test`. Native Bench подготавливается владельцем; автоматическое закрепление framework и обновление dependency hash выполняется Docker-runner. Docker поддерживает только свой `lms.test`. Нельзя запускать проверки на школьном сайте или заменять БД моками Frappe.

## Три коротких E2E-сценария

Использовать только встроенный браузер Codex, отдельный локальный сайт и тестовые учётные записи. Подготовить данные через backend: один приватный курс с двумя текстовыми уроками, зачисленный ученик и преподаватель. Каждый сценарий независим, без фиксированных задержек и критериев на CSS-классы/точные переводы. При Docker-прогоне сервер — `http://localhost:18080`.

1. **Вход:** войти учеником, открыть `/lms/courses`, убедиться, что обучение доступно; выйти и проверить отказ гостю в приватном курсе.
2. **Обучение:** войти зачисленным учеником, открыть первый урок, завершить и перезагрузить; прогресс сохранён, второй урок открывается.
3. **Сохранение курса:** преподаватель меняет название тестового курса, сохраняет, перезагружает и видит новое название; восстановить исходное.

Записать фактические результаты. HTTP smoke и backend-тесты не объявлять браузерным E2E.

## Аудит покрытия

| Проверки | Решение и оставшееся покрытие |
| --- | --- |
| 11 прежних workflows | Удалены upstream release/POT/asset-commit/title-автоматизации и дублирующие frontend/backend/UI/lint workflows; заменены одним `checks.yml`. |
| Codecov, semantic-release, commitlint, Mergify, CI-only helpers | Удалены: не проверяют работу школы, часть направлена на upstream `frappe/lms`. |
| 79 frontend-наборов | 58 файлов удалены; 21 оставлен. Убраны исходный текст, разметка/подписи, очевидные helpers, повторяющие реализацию моки. Сохранены XSS sanitizer, видео/условия прогресса, quiz-навигация/retry, autosave recovery и два контракта сохранения через настоящий frappe-ui resource, CodeBox XSS/storage, безопасность HTML-paste и 18 Raven data-safety/concurrency/recovery сценариев. Оставлены короткие PDF worker/concurrency, chapter identity/SCORM recovery, coupon child-row save, cross-day booking и Billing checkout/error контракты. Сохранены приватность платёжных вложений по умолчанию и маршрутизация всех evaluator writes через ownership-checked endpoints. Для Chapter/Billing/evaluator используется настоящий frappe-ui resource с замещением только fetcher; это выявило необработанный validation rejection в Billing, исправленный существующим submitResource. Quiz/autosave группы сокращены до 13 важных регрессий: backend не покрывает клиентские гонки. |
| Два длинных Cypress-сценария/фикстуры/плагины | Удалены вместе с конфигурацией и зависимостями. Заменены тремя независимыми сценариями встроенного браузера. |
| 41 пустой backend-файл | Физически удалены классы с `pass`; общий helper сохранён и используется реальными integration-тестами. |
| Source/content/style tests и Fake payment controller | Удалены проверки переводов/demo/signup/PDF/widgets, внутренних флагов и простых helpers; Fake-controller заменён mock внешней gateway-границы и проверкой настоящей платежной записи. |
| Backend-дубли | Убраны повторы parser/timezone/helper assertions и benchmark с порогом 200 мс. Сохранены реальные индексы, paging endpoints, timezone/booking integration и проверка нештатного входа. |
| Полезный backend | Сохранены права/IDOR, quiz/assignment, транзакции/конкурентные записи прогресса, каскадные удаления, деньги/купоны/повторные callbacks, recovery, участники, Raven, SCORM/XXE/zip-slip, HTML/EditorJS и внешние календарные контракты. |

Удалённые сценарии не скрыты через skip/exclude. Включён существующий security regression JSON/Text sanitization; сопутствующее исправление сохраняет безопасный EditorJS JSON после второго прохода Frappe. Малое изменение `LearningSearch.build_index` сохраняет аргументы обновлённого framework API и позволяет миграцию закреплённой Frappe 16. Остальные незакоммиченные изменения приложения/переводов/школьных данных сохранены в исходном checkout и не входят в feature-ветку.

Фактические команды, время, review и CI run зафиксированы в `docs/CURRENT_HANDOFF.md`.
