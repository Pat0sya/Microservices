import pg from 'pg'

const { Pool } = pg as any

// Test database connection - use main DB for tests
export function createTestPool() {
  return new Pool({
    connectionString: process.env.TEST_DATABASE_URL || process.env.DATABASE_URL || 'postgres://app:app@localhost:5432/app',
    max: 1,
  })
}

// Clean database before tests
export async function cleanDatabase(pool: any) {
  const tables = [
    'notifications',
    'shipment_stages',
    'shipments',
    'payments',
    'orders',
    'reservations',
    'stock',
    'cart',
    'addresses',
    'profiles',
    'products',
    'users',
  ]
  
  for (const table of tables) {
    try {
      await pool.query(`TRUNCATE TABLE ${table} CASCADE`)
    } catch (err) {
      // Table might not exist, ignore
    }
  }
}

// Setup test data
export async function setupTestData(pool: any) {
  try {
    // Create test user
    const userRes = await pool.query(
      'INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3) RETURNING id',
      ['test@example.com', '$argon2id$v=19$m=65536,t=3,p=4$test', 'user']
    )
    const userId = userRes.rows?.[0]?.id || 1

    // Create test product
    const productRes = await pool.query(
      'INSERT INTO products (name, price) VALUES ($1, $2) RETURNING id',
      ['Test Product', 99.99]
    )
    const productId = productRes.rows?.[0]?.id || 1

    // Create test stock
    try {
      await pool.query(
        'INSERT INTO stock (product_id, qty) VALUES ($1, $2)',
        [productId, 10]
      )
    } catch (err) {
      // Ignore if stock table doesn't exist or mock pool doesn't support
    }

    return { userId, productId }
  } catch (err) {
    // Return mock data if DB fails
    return { userId: 1, productId: 1 }
  }
}

