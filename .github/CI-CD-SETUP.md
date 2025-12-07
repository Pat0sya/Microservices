# Инструкция по настройке CI/CD

Этот документ описывает настройку непрерывной интеграции и доставки для сервисов проекта.

## Обзор

В проекте настроены два CI/CD pipeline:

1. **Auth Service** → DockerHub (публикация образа)
2. **Search Service** → Yandex Cloud Serverless Containers (развёртывание)

## 1. Настройка Auth Service → DockerHub

### Требуемые секреты GitHub

Добавьте следующие секреты в настройках репозитория GitHub (Settings → Secrets and variables → Actions):

- `DOCKERHUB_USERNAME` - ваш username в DockerHub
- `DOCKERHUB_TOKEN` - токен доступа DockerHub (можно создать в Account Settings → Security → New Access Token)

### Настройка DockerHub образа

В файле `.github/workflows/auth-dockerhub.yml` замените:

```yaml
DOCKER_IMAGE: YOUR_DOCKERHUB_USERNAME/auth-service
```

на ваш реальный username, например:

```yaml
DOCKER_IMAGE: myusername/auth-service
```

### Как это работает

- При push в ветки `main` или `develop` (или изменении файлов сервиса auth) автоматически:
  1. Собирается Docker образ
  2. Публикуется в DockerHub с тегами (latest, branch name, commit SHA)

## 2. Настройка Search Service → Yandex Cloud

### Требуемые секреты GitHub

Добавьте следующие секреты:

- `YC_OAUTH_TOKEN` - OAuth токен Yandex Cloud (можно получить через `yc init` или в [IAM консоли](https://console.cloud.yandex.ru/iam))
- `DATABASE_URL` - строка подключения к базе данных PostgreSQL (например: `postgres://user:password@host:5432/database`)

### Настройка переменных окружения

В файле `.github/workflows/search-yandex-cloud.yml` замените:

```yaml
YC_FOLDER_ID: YOUR_YANDEX_CLOUD_FOLDER_ID
YC_SERVICE_ACCOUNT_ID: YOUR_SERVICE_ACCOUNT_ID
```

на реальные значения:

1. **YC_FOLDER_ID** - ID папки в Yandex Cloud (можно получить через `yc resource-manager folder list`)
2. **YC_SERVICE_ACCOUNT_ID** - ID сервисного аккаунта с правами:
   - `serverless.containers.editor` - для создания/обновления контейнеров
   - `container-registry.images.pusher` - для публикации образов

### Создание сервисного аккаунта для Serverless Container

```bash
# Создать сервисный аккаунт
yc iam service-account create --name ci-cd-sa

# Получить ID сервисного аккаунта (нужен для YC_SERVICE_ACCOUNT_ID)
SA_ID=$(yc iam service-account get --name ci-cd-sa --format json | jq -r '.id')
echo "Service Account ID: $SA_ID"

# Назначить роли для работы с Serverless Containers
yc resource-manager folder add-access-binding YOUR_FOLDER_ID \
  --role serverless.containers.editor \
  --subject serviceAccount:$SA_ID

# Назначить роль для публикации образов в Container Registry
yc resource-manager folder add-access-binding YOUR_FOLDER_ID \
  --role container-registry.images.pusher \
  --subject serviceAccount:$SA_ID
```

**Важно:** `YC_SERVICE_ACCOUNT_ID` в workflow должен быть равен `$SA_ID` из команды выше.

### Как это работает

- При push в ветки `main` или `develop` (или изменении файлов сервиса search) автоматически:
  1. Собирается Docker образ
  2. Публикуется в Yandex Container Registry
  3. Создаётся или обновляется Serverless Container в Yandex Cloud
  4. Контейнер получает публичный URL для доступа

## Локальная проверка

### Проверка сборки Auth Service

```bash
docker build -f services/auth/Dockerfile -t auth-service:test .
docker run -p 3501:3501 -e PORT=3501 auth-service:test
```

### Проверка сборки Search Service

```bash
docker build -f services/search/Dockerfile -t search-service:test .
docker run -p 3510:3510 \
  -e PORT=3510 \
  -e DATABASE_URL=postgres://user:pass@host:5432/db \
  search-service:test
```

## Структура файлов

```
.github/
  workflows/
    auth-dockerhub.yml          # CI/CD для Auth → DockerHub
    search-yandex-cloud.yml     # CI/CD для Search → Yandex Cloud
services/
  auth/
    Dockerfile                  # Dockerfile для Auth сервиса
  search/
    Dockerfile                  # Dockerfile для Search сервиса
```

## Troubleshooting

### DockerHub: Authentication failed
- Проверьте правильность `DOCKERHUB_USERNAME` и `DOCKERHUB_TOKEN`
- Убедитесь, что токен имеет права на публикацию

### Yandex Cloud: Permission denied
- Проверьте, что сервисный аккаунт имеет необходимые роли
- Убедитесь, что `YC_FOLDER_ID` указан правильно

### Yandex Cloud: Container Registry not found
- Убедитесь, что реестр создан: `yc container registry list`
- Проверьте права доступа к реестру

## Дополнительные ресурсы

- [DockerHub Documentation](https://docs.docker.com/docker-hub/)
- [Yandex Cloud Serverless Containers](https://cloud.yandex.ru/docs/serverless-containers/)
- [Yandex Cloud Container Registry](https://cloud.yandex.ru/docs/container-registry/)

