-- Добавляем поле image_id в таблицу products, если его еще нет
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'products' AND column_name = 'image_id'
  ) THEN
    ALTER TABLE products ADD COLUMN image_id text;
  END IF;
END $$;

