-- Скрипт для добавления изображений к продуктам
-- Запускать после seed-products и после загрузки изображения через seed-images.js
-- Этот файл не выполняется автоматически, только вручную

-- Пример: обновить первые 20 продуктов с image_id
-- UPDATE products SET image_id = 'YOUR_IMAGE_ID_HERE' WHERE id IN (SELECT id FROM products ORDER BY id LIMIT 20);


