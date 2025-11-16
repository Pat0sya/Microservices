# Микросервисная архитектура

Проект реализован как набор независимых микросервисов, каждый со своим HTTP API.

## Микросервисы

### 1. Авторизация (Auth) - Порт 3501
**Работает с PostgreSQL:** ✅ Да

**Эндпоинты:**
- `POST /auth/register` - Регистрация нового пользователя
- `POST /auth/login` - Вход в систему
- `GET /auth/me` - Получение информации о текущем пользователе
- `POST /auth/refresh` - Обновление токена

**HTTP-взаимодействия:**
- При регистрации вызывает сервис Profile для создания профиля пользователя

---

### 2. Профиль (Profile) - Порт 3502
**Работает с PostgreSQL:** ✅ Да

**Эндпоинты:**
- `GET /profiles/me` - Получение профиля текущего пользователя
- `PUT /profiles/me` - Обновление профиля
- `GET /profiles/me/cart` - Получение корзины пользователя
- `POST /profiles/me/cart` - Добавление товара в корзину
- `DELETE /profiles/me/cart` - Очистка корзины
- `GET /profiles/me/addresses` - Получение адресов
- `POST /profiles/me/addresses` - Добавление адреса

---

### 3. Товар + Заказ (Product + Order) - Порт 3505
**Работает с PostgreSQL:** ✅ Да

**Эндпоинты для товаров:**
- `GET /products` - Список всех товаров
- `POST /products` - Создание нового товара
- `GET /products/:id` - Получение товара по ID

**Эндпоинты для заказов:**
- `POST /orders` - Создание нового заказа
- `GET /orders` - Список заказов текущего пользователя
- `GET /orders/:id` - Получение заказа по ID
- `POST /orders/:id/pay` - Оплата заказа
- `POST /orders/:id/cancel` - Отмена заказа
- `POST /orders/:id/received` - Подтверждение получения заказа
- `POST /orders/:id/status` - Обновление статуса заказа (внутренний)

**HTTP-взаимодействия:**
- При оплате заказа (`POST /orders/:id/pay`) вызывает:
  - Inventory для резервирования товара
  - Payments для обработки платежа (через вложенную функцию `processPayment`)
  - Shipping для создания доставки
  - Notifications для отправки уведомлений

**Вложенная функция:**
- В эндпоинте `POST /orders/:id/pay` используется вложенная функция `processPayment()`, которая:
  - Выполняет HTTP-запросы к микросервису Payments для обработки платежа
  - При ошибке платежа вызывает микросервис Notifications для отправки уведомления

---

### 4. Уведомления (Notifications) - Порт 3508
**Работает с PostgreSQL:** ✅ Да

**Эндпоинты:**
- `POST /notify` - Отправка уведомления
- `GET /notify/logs` - Получение логов уведомлений
- `GET /notify/user/:userId` - Получение уведомлений пользователя
- `DELETE /notify/:id` - Удаление уведомления

---

### 5. Оплата (Payment) - Порт 3506
**Работает с PostgreSQL:** ✅ Да

**Эндпоинты:**
- `POST /payments/charge` - Обработка платежа
- `GET /payments/:id` - Получение информации о платеже
- `GET /payments/order/:orderId` - Получение платежей по заказу
- `POST /payments/refund` - Возврат платежа

---

### 6. Доставка (Delivery/Shipping) - Порт 3507
**Работает с PostgreSQL:** ✅ Да

**Эндпоинты:**
- `POST /shipping/quote` - Получение стоимости доставки
- `POST /shipping/fulfill` - Создание отправки
- `GET /shipping/track/:trackingId` - Отслеживание отправки
- `POST /shipping/advance` - Переход к следующему этапу доставки

**HTTP-взаимодействия:**
- При изменении статуса доставки вызывает:
  - Orders для обновления статуса заказа
  - Notifications для отправки уведомлений

---

### 7. Изображения (Images) - Порт 3509
**Работает с PostgreSQL:** ❌ Нет (файловое хранилище)

**Эндпоинты:**
- `POST /images/upload` - Загрузка изображения
- `GET /images/:id` - Получение изображения по ID
- `GET /images` - Список всех изображений
- `DELETE /images/:id` - Удаление изображения

---

### 8. Поиск (Search) - Порт 3510
**Работает с PostgreSQL:** ✅ Да

**Эндпоинты:**
- `GET /search/products` - Поиск товаров
- `GET /search/orders` - Поиск заказов
- `POST /search` - Универсальный поиск

---

### 9. Склад (Inventory) - Порт 3504
**Работает с PostgreSQL:** ✅ Да

**Эндпоинты:**
- `GET /inventory/:productId` - Получение остатка товара
- `POST /inventory/set` - Установка остатка
- `POST /inventory/reserve` - Резервирование товара
- `POST /inventory/commit` - Подтверждение резервирования
- `POST /inventory/release` - Освобождение резервирования

---

## Gateway - Порт 3500

API Gateway маршрутизирует запросы к соответствующим микросервисам:
- `/api/auth/*` → Auth
- `/api/profiles/*` → Profile
- `/api/products/*` → Product+Order
- `/api/orders/*` → Product+Order
- `/api/payments/*` → Payment
- `/api/shipping/*` → Delivery
- `/api/notify/*` → Notifications
- `/api/images/*` → Images
- `/api/search/*` → Search
- `/api/inventory/*` → Inventory

---

## Типичные сценарии взаимодействия

### Сценарий 1: Создание и оплата заказа

1. **Клиент** → `POST /api/orders` → **Product+Order**
   - Product+Order создает заказ в БД со статусом `created_unpaid`

2. **Клиент** → `POST /api/orders/:id/pay` → **Product+Order**
   - Product+Order вызывает **Inventory** для резервирования товара
   - Product+Order вызывает вложенную функцию `processPayment()`, которая:
     - Выполняет HTTP-запрос к **Payments** для обработки платежа
     - При ошибке вызывает **Notifications** для уведомления
   - Product+Order вызывает **Shipping** для создания доставки
   - Product+Order вызывает **Notifications** для отправки подтверждения

### Сценарий 2: Регистрация пользователя

1. **Клиент** → `POST /api/auth/register` → **Auth**
   - Auth создает пользователя в БД
   - Auth выполняет HTTP-запрос к **Profile** для создания профиля
   - Auth возвращает данные пользователя

2. **Клиент** → `POST /api/auth/login` → **Auth**
   - Auth проверяет credentials и возвращает JWT токен

### Сценарий 3: Отслеживание доставки

1. **Клиент** → `GET /api/shipping/track/:trackingId` → **Delivery**
   - Delivery возвращает текущий статус и этапы доставки

2. **Система** → `POST /api/shipping/advance` → **Delivery**
   - Delivery обновляет статус в БД
   - Delivery вызывает **Orders** для обновления статуса заказа
   - Delivery вызывает **Notifications** для уведомления пользователя

---

## Запуск проекта

### Через Docker Compose:
```bash
docker-compose up --build
```

### Локально:
```bash
npm install
npm run build
npm run dev
```

---

## База данных

Все сервисы, работающие с PostgreSQL, используют общую базу данных `app` с различными таблицами:
- `users` - пользователи (Auth)
- `profiles`, `addresses`, `cart` - профили (Profile)
- `products` - товары (Product+Order)
- `orders` - заказы (Product+Order)
- `payments` - платежи (Payment)
- `shipments`, `shipment_stages` - доставка (Delivery)
- `notifications` - уведомления (Notifications)
- `stock`, `reservations` - склад (Inventory)

Схема БД находится в `db/init/001_schema.sql`.

---

## Особенности реализации

1. **Вложенная функция с HTTP-запросом:**
   - В сервисе Product+Order, в эндпоинте `POST /orders/:id/pay`, используется вложенная функция `processPayment()`, которая выполняет HTTP-запросы к микросервисам Payments и Notifications.

2. **HTTP-взаимодействия между сервисами:**
   - Auth → Profile (при регистрации)
   - Product+Order → Inventory, Payments, Shipping, Notifications (при оплате заказа)
   - Delivery → Orders, Notifications (при изменении статуса доставки)

3. **Работа с PostgreSQL:**
   - Большинство сервисов работают с PostgreSQL для хранения данных
   - Подключение настраивается через переменную окружения `DATABASE_URL`
