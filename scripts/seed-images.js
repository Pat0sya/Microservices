#!/usr/bin/env node
/**
 * Скрипт для копирования изображения в images-storage
 * и обновления продуктов в БД с image_id
 */

const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const pg = require('pg');

const DB_URL = process.env.DATABASE_URL || 'postgresql://app:app@localhost:5432/app';
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
    // Проверяем, есть ли продукты
    const countResult = await pool.query('SELECT COUNT(*) as count FROM products');
    const productCount = parseInt(countResult.rows[0].count);
    
    if (productCount === 0) {
      console.log('📦 Создаю тестовые продукты с изображениями...');
      // Создаем 20 продуктов с image_id
      for (let i = 1; i <= 20; i++) {
        await pool.query(
          `INSERT INTO products(name, price, seller_id, image_id) 
           VALUES ($1, $2, $3, $4) 
           ON CONFLICT DO NOTHING`,
          [`Product ${i}`, (50 + i * 9.73).toFixed(2), 1, imageId]
        );
        // Создаем stock для продукта
        await pool.query(
          `INSERT INTO stock(product_id, qty) 
           VALUES ((SELECT id FROM products WHERE name = $1), $2) 
           ON CONFLICT (product_id) DO NOTHING`,
          [`Product ${i}`, 10 + (i % 5) * 5]
        );
      }
      console.log(`✅ Создано 20 продуктов с изображениями`);
    } else {
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
      if (rows.length > 0) {
        console.log('   Продукты:', rows.slice(0, 5).map(r => r.name).join(', '), rows.length > 5 ? '...' : '');
      }
    }
    
    await pool.end();
    console.log('✨ Готово! Теперь первые 20 продуктов имеют изображения.');
  } catch (error) {
    console.error('❌ Ошибка при обновлении БД:', error.message);
    await pool.end();
    process.exit(1);
  }
}

main();
