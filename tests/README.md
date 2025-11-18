# Тестирование

Проект покрыт unit, интеграционными и E2E тестами.

## Структура тестов

```
tests/
├── helpers/          # Вспомогательные функции для тестов
│   ├── test-db.ts    # Утилиты для работы с тестовой БД
│   ├── test-server.ts # Утилиты для создания тестовых серверов
│   └── jwt-helper.ts # Утилиты для работы с JWT
├── integration/      # Интеграционные тесты
│   ├── auth-profile.integration.test.ts
│   └── order-payment.integration.test.ts
└── e2e/              # E2E тесты
    └── full-checkout-flow.e2e.test.ts

services/
└── */src/
    └── *.test.ts     # Unit тесты для каждого сервиса
```

## Запуск тестов

### Все тесты
```bash
npm test
```

### Только unit тесты
```bash
npm test -- --run services/
```

### Только интеграционные тесты
```bash
npm run test:integration
```

### С покрытием кода
```bash
npm run test:coverage
```

### В режиме watch
```bash
npm run test:watch
```

## Требования

1. **PostgreSQL** должен быть запущен и доступен на `localhost:5432`
2. Тестовая БД: `app_test` (или используйте переменную окружения `TEST_DATABASE_URL`)

### Настройка тестовой БД

```bash
# Создать тестовую БД
createdb app_test

# Или использовать существующую БД
export TEST_DATABASE_URL=postgres://user:password@localhost:5432/app_test
```

## Типы тестов

### Unit тесты

Покрывают отдельные сервисы и их эндпоинты:
- `services/auth/src/index.test.ts` - тесты Auth сервиса
- `services/profile/src/index.test.ts` - тесты Profile сервиса
- `services/orders/src/index.test.ts` - тесты Product+Order сервиса
- `services/payments/src/index.test.ts` - тесты Payments сервиса
- `services/shipping/src/index.test.ts` - тесты Shipping сервиса
- `services/notifications/src/index.test.ts` - тесты Notifications сервиса
- `services/images/src/index.test.ts` - тесты Images сервиса
- `services/search/src/index.test.ts` - тесты Search сервиса
- `services/inventory/src/index.test.ts` - тесты Inventory сервиса
- `services/gateway/src/index.test.ts` - тесты Gateway сервиса

### Интеграционные тесты

Проверяют взаимодействие между сервисами:
- `auth-profile.integration.test.ts` - регистрация пользователя и создание профиля
- `order-payment.integration.test.ts` - создание заказа, оплата и уведомления

### E2E тесты

Полный пользовательский сценарий:
- `full-checkout-flow.e2e.test.ts` - полный цикл от регистрации до оплаты заказа

## Покрытие

После запуска `npm run test:coverage` отчет будет доступен в `coverage/index.html`.

## Примечания

- Тесты используют изолированную тестовую БД
- Каждый тест очищает БД перед выполнением
- Mock'и используются для HTTP-взаимодействий между сервисами
- Тесты не требуют запущенных Docker контейнеров (кроме БД)

