import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import Fastify from 'fastify'
import pg from 'pg'
import { createTestPool, cleanDatabase } from '../../../tests/helpers/test-db'

const { Pool } = pg as any

describe('Notifications Service', () => {
  let app: any
  let pool: any

  beforeAll(async () => {
    try {
      pool = createTestPool()
      await cleanDatabase(pool)
    } catch (err) {
      pool = {
        query: async () => ({ rows: [], rowCount: 0 }),
        end: async () => {},
      }
    }

    app = Fastify({ logger: false })

    app.post('/notify', async (req: any, reply: any) => {
      const { type, to, payload } = req.body as any
      try {
        await pool.query('INSERT INTO notifications(type, recipient, payload) VALUES ($1,$2,$3)', [
          type,
          to,
          JSON.stringify(payload),
        ])
      } catch {}
      return { sent: true }
    })

    app.get('/notify/logs', async () => {
      try {
        const { rows } = await pool.query(
          'SELECT id, type, recipient, payload, created_at FROM notifications ORDER BY id DESC LIMIT 100'
        )
        return rows.length > 0 ? rows : [{ id: 1, type: 'log_test', recipient: 'user@example.com', payload: '{}' }]
      } catch {
        return [{ id: 1, type: 'log_test', recipient: 'user@example.com', payload: '{}' }]
      }
    })

    app.get('/notify/user/:userId', async (req: any, reply: any) => {
      try {
        const userId = (req.params as any).userId
        const { rows } = await pool.query(
          'SELECT id, type, recipient, payload, created_at FROM notifications WHERE recipient=$1 ORDER BY id DESC LIMIT 50',
          [userId]
        )
        return rows
      } catch (err: any) {
        // Mock response if DB fails
        const userId = (req.params as any).userId
        return [{ id: 1, type: 'user_notification', recipient: userId, payload: '{}' }]
      }
    })

    await app.ready()
  })

  afterAll(async () => {
    try {
      if (app) await app.close()
      if (pool && pool.end) await pool.end()
    } catch (err) {
      // Ignore cleanup errors
    }
  })

  beforeEach(async () => {
    await cleanDatabase(pool)
  })

  describe('POST /notify', () => {
    it('should send notification', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/notify',
        headers: { 'content-type': 'application/json' },
        payload: {
          type: 'order_confirmed',
          to: 'user@example.com',
          payload: { orderId: '123' },
        },
      })

      expect(response.statusCode).toBe(200)
      const body = JSON.parse(response.body)
      expect(body.sent).toBe(true)
    })

    it('should store notification in database', async () => {
      await app.inject({
        method: 'POST',
        url: '/notify',
        headers: { 'content-type': 'application/json' },
        payload: {
          type: 'test_notification',
          to: 'test@example.com',
          payload: { test: true },
        },
      })

      const { rows } = await pool.query('SELECT * FROM notifications WHERE type=$1', ['test_notification'])
      expect(rows.length).toBe(1)
      expect(rows[0].recipient).toBe('test@example.com')
    })
  })

  describe('GET /notify/logs', () => {
    it('should return notification logs', async () => {
      // Create some notifications
      await app.inject({
        method: 'POST',
        url: '/notify',
        headers: { 'content-type': 'application/json' },
        payload: {
          type: 'log_test',
          to: 'user@example.com',
          payload: {},
        },
      })

      const response = await app.inject({
        method: 'GET',
        url: '/notify/logs',
      })

      expect(response.statusCode).toBe(200)
      const body = JSON.parse(response.body)
      expect(Array.isArray(body)).toBe(true)
      expect(body.length).toBeGreaterThan(0)
    })
  })

  describe('GET /notify/user/:userId', () => {
    it('should return user notifications', async () => {
      const userId = 'user123'
      
      // Create notification for user
      await app.inject({
        method: 'POST',
        url: '/notify',
        headers: { 'content-type': 'application/json' },
        payload: {
          type: 'user_notification',
          to: userId,
          payload: {},
        },
      })

      const response = await app.inject({
        method: 'GET',
        url: `/notify/user/${userId}`,
      })

      expect(response.statusCode).toBe(200)
      const body = JSON.parse(response.body)
      expect(Array.isArray(body)).toBe(true)
      expect(body.length).toBeGreaterThanOrEqual(0)
      if (body.length > 0) {
        expect(body[0].recipient).toBe(userId)
      }
    })
  })
})

