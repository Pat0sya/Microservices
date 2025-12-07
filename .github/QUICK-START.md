# Быстрый старт CI/CD

## Шаг 1: Настройка DockerHub (для Auth Service)

1. Зарегистрируйтесь на [DockerHub](https://hub.docker.com/)
2. Создайте Access Token: Account Settings → Security → New Access Token
3. В GitHub: Settings → Secrets and variables → Actions → New repository secret:
   - `DOCKERHUB_USERNAME` = ваш username
   - `DOCKERHUB_TOKEN` = созданный токен
4. В файле `.github/workflows/auth-dockerhub.yml` замените:
   ```yaml
   DOCKER_IMAGE: YOUR_DOCKERHUB_USERNAME/auth-service
   ```
   на ваш реальный username

## Шаг 2: Настройка Yandex Cloud (для Search Service)

1. Установите Yandex Cloud CLI:
   ```bash
   curl -sSL https://storage.yandexcloud.net/yandexcloud-yc/install.sh | bash
   yc init
   ```

2. Получите OAuth токен:
   - Перейдите в [IAM консоль](https://console.cloud.yandex.ru/iam)
   - Создайте OAuth токен
   - Или используйте: `yc config get token`

3. Получите Folder ID:
   ```bash
   yc resource-manager folder list
   ```

4. Создайте сервисный аккаунт:
   ```bash
   yc iam service-account create --name ci-cd-sa
   SA_ID=$(yc iam service-account get --name ci-cd-sa --format json | jq -r '.id')
   echo "Service Account ID: $SA_ID"
   ```

5. Назначьте роли:
   ```bash
   yc resource-manager folder add-access-binding YOUR_FOLDER_ID \
     --role serverless.containers.editor \
     --subject serviceAccount:$SA_ID
   
   yc resource-manager folder add-access-binding YOUR_FOLDER_ID \
     --role container-registry.images.pusher \
     --subject serviceAccount:$SA_ID
   ```

6. В GitHub: Settings → Secrets and variables → Actions → New repository secret:
   - `YC_OAUTH_TOKEN` = ваш OAuth токен
   - `DATABASE_URL` = строка подключения к БД (например: `postgres://user:pass@host:5432/db`)

7. В файле `.github/workflows/search-yandex-cloud.yml` замените:
   ```yaml
   YC_FOLDER_ID: YOUR_YANDEX_CLOUD_FOLDER_ID
   YC_SERVICE_ACCOUNT_ID: YOUR_SERVICE_ACCOUNT_ID
   ```
   на реальные значения из шага 3 и 4

## Шаг 3: Проверка

После настройки секретов:

1. Сделайте commit и push изменений в `services/auth/` или `services/search/`
2. Перейдите в GitHub → Actions
3. Должны запуститься соответствующие workflows

## Что дальше?

- После успешного выполнения workflow для Auth Service, образ будет доступен в DockerHub
- После успешного выполнения workflow для Search Service, контейнер будет развёрнут в Yandex Cloud и получит публичный URL

