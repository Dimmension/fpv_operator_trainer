# FPV Operator Trainer

Веб-система для диагностики и тренировки профессионально важных качеств операторов БПЛА.

Реализованы первые уровни двух диагностических модулей:

1. **Оценка уровня осмотрительности** — последовательный поиск чисел 1–25 в
   таблице 5×5 за пять минут.
2. **Определение объёма внимания** — один раунд запоминания пяти фигур в
   матрице 5×5 с экспозицией 3 секунды.

Приложение сохраняет попытки, отдельные действия, результаты раундов и историю
демонстрационного оператора. Выбор уровней и авторизация в текущую версию не входят.

## Запуск через Docker

Требуются Docker и Docker Compose.

```bash
cp .env.example .env
docker compose up --build
```

После запуска доступны:

- приложение — <http://localhost:8080>;
- OpenAPI/Swagger — <http://localhost:8000/docs>;
- проверка API — <http://localhost:8000/api/v1/health>.

Миграции Alembic выполняются автоматически при старте backend. Рабочие данные
хранятся в PostgreSQL volume `fpv_postgres_data`.

## Локальная разработка

Сначала запустите PostgreSQL:

```bash
docker compose up -d database
```

Backend:

```bash
cd backend
uv sync
uv run alembic upgrade head
uv run uvicorn app.main:app --reload
```

Frontend в другом терминале:

```bash
cd frontend
npm install
npm run generate:api
npm run dev
```

Адрес PostgreSQL по умолчанию:
`postgresql+asyncpg://fpv:fpv@localhost:5432/fpv_trainer`. Его можно изменить
переменной `DATABASE_URL`.

## Проверки

```bash
cd backend
uv run ruff check .
uv run pytest

cd ../frontend
npm run lint
npm run test
npm run build
npm run test:e2e
```

Интеграционные и браузерные тесты могут использовать одноразовую SQLite-БД,
чтобы запускаться без установленного PostgreSQL. Runtime и Docker-конфигурация
приложения используют PostgreSQL.

## Документация

- [Технологический стек](docs/technology-stack.md)
- [Схема базы данных](docs/database.dbml)
