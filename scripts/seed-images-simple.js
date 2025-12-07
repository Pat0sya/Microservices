#!/usr/bin/env node
/**
 * Скрипт для загрузки original.png в микросервис images
 * и обновления всех продуктов в БД с дефолтной картинкой
 */

const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const pg = require('pg');

const DB_URL = process.env.DATABASE_URL || 'postgresql://app:app@localhost:5432/app';
const IMAGES_STORAGE = process.env.IMAGES_STORAGE || path.join(__dirname, '../images-storage');

async function copyImageToStorage(imagePath) {
  // Создаем директорию для изображений
  if (!fs.existsSync(IMAGES_STORAGE)) {
    fs.mkdirSync(IMAGES_STORAGE, { recursive: true });
  }

  // Генерируем ID для изображения
  const imageId = randomUUID();
  const destPath = path.join(IMAGES_STORAGE, `${imageId}.png`);
  
  // Копируем файл
  fs.copyFileSync(imagePath, destPath);
  console.log(`✅ Изображение скопировано в images-storage: ${imageId}.png`);
  
  return imageId;
}

async function main() {
  const imagePath = path.join(__dirname, '../original.png');
  
  if (!fs.existsSync(imagePath)) {
    console.error('❌ Файл original.png не найден в корне проекта');
    process.exit(1);
  }

  console.log('📤 Копирование изображения в images-storage...');
  
  // Копируем файл напрямую в images-storage
  // Микросервис images может читать файлы напрямую из этой директории
  const imageId = await copyImageToStorage(imagePath);

  // Подключаемся к БД
  const pool = new pg.Pool({ connectionString: DB_URL });
  
  try {
    // Обновляем все продукты без image_id с дефолтной картинкой
    const { rows } = await pool.query(
      `UPDATE products 
       SET image_id = $1 
       WHERE image_id IS NULL
       RETURNING id, name`,
      [imageId]
    );
    
    console.log(`✅ Обновлено ${rows.length} продуктов с дефолтным изображением`);
    
    // Проверяем, сколько всего продуктов
    const countResult = await pool.query('SELECT COUNT(*) as count FROM products');
    const totalProducts = parseInt(countResult.rows[0].count);
    
    // Проверяем, сколько продуктов имеют image_id
    const withImageResult = await pool.query('SELECT COUNT(*) as count FROM products WHERE image_id IS NOT NULL');
    const productsWithImage = parseInt(withImageResult.rows[0].count);
    
    console.log(`   Всего продуктов в БД: ${totalProducts}`);
    console.log(`   Продуктов с изображением: ${productsWithImage}`);
    
    await pool.end();
    console.log('✨ Готово! Продукты без изображения теперь имеют дефолтную картинку.');
  } catch (error) {
    console.error('❌ Ошибка при обновлении БД:', error.message);
    await pool.end();
    process.exit(1);
  }
}

main().catch(error => {
  console.error('❌ Критическая ошибка:', error);
  process.exit(1);
});


