#!/usr/bin/env node
/**
 * Простой скрипт для копирования изображения в images-storage
 * и обновления продуктов в БД
 */

const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const pg = require('pg');

const DB_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/microservices';
const IMAGES_STORAGE = process.env.IMAGES_STORAGE || path.join(__dirname, '../images-storage');

async function main() {
  const imagePath = path.join(__dirname, '../original.png');
  
  if (!fs.existsSync(imagePath)) {
    console.error('❌ Файл original.png не найден в корне проекта');
    process.exit(1);
  }

  // Создаем директорию для изображений
  if (!fs.existsSync(IMAGES_STORAGE)) {
    fs.mkdirSync(IMAGES_STORAGE, { recursive: true });
  }

  // Генерируем ID для изображения
  const imageId = randomUUID();
  const destPath = path.join(IMAGES_STORAGE, `${imageId}.png`);
  
  // Копируем файл
  fs.copyFileSync(imagePath, destPath);
  console.log(`✅ Изображение скопировано: ${imageId}.png`);

  // Подключаемся к БД
  const pool = new pg.Pool({ connectionString: DB_URL });
  
  try {
    // Обновляем первые 20 продуктов с image_id
    const { rows } = await pool.query(
      `UPDATE products 
       SET image_id = $1 
       WHERE id IN (
         SELECT id FROM products ORDER BY id LIMIT 20
       )
       RETURNING id, name`,
      [imageId]
    );
    
    console.log(`✅ Обновлено ${rows.length} продуктов с изображением`);
    console.log('   Продукты:', rows.map(r => r.name).join(', '));
    
    await pool.end();
    console.log('✨ Готово!');
  } catch (error) {
    console.error('❌ Ошибка при обновлении БД:', error.message);
    await pool.end();
    process.exit(1);
  }
}

main();

