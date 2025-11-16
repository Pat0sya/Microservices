import Fastify from 'fastify';
import { z } from 'zod';
import pg from 'pg';

const { Pool } = pg as any;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const app = Fastify({ logger: true });
const logs: any[] = [];
const port = Number(process.env.PORT || 3008);

app.get('/health', async () => ({ status: 'ok', service: 'notifications' }));

const notifySchema = z.object({ type: z.string().min(1), to: z.string().min(1), payload: z.any() });
app.post('/notify', async (req, reply) => {
  const parsed = notifySchema.safeParse(req.body);
  if (!parsed.success) return reply.code(400).send({ error: 'Invalid input', details: parsed.error.flatten() });
  const entry = { ts: Date.now(), ...parsed.data };
  logs.push(entry);
  try { await pool.query('insert into notifications(type, recipient, payload) values ($1,$2,$3)', [entry.type, entry.to, entry.payload]); } catch {}
  app.log.info({ event: 'notify', ...entry }, 'sent notification');
  return { sent: true };
});

app.get('/notify/logs', async () => {
  try {
    const { rows } = await pool.query('select id, type, recipient, payload, created_at from notifications order by id desc limit 100');
    return rows;
  } catch {
    return logs.slice(-100);
  }
});

// Получение уведомлений для конкретного пользователя
app.get('/notify/user/:userId', async (req, reply) => {
  const userId = (req.params as any).userId as string;
  try {
    const { rows } = await pool.query(
      'select id, type, recipient, payload, created_at from notifications where recipient=$1 order by id desc limit 50',
      [userId]
    );
    return rows;
  } catch (err: any) {
    app.log.error({ err }, 'Error fetching user notifications');
    return reply.code(500).send({ error: 'Failed to fetch notifications' });
  }
});

// Удаление уведомления
app.delete('/notify/:id', async (req, reply) => {
  const id = (req.params as any).id as string;
  try {
    const { rowCount } = await pool.query('delete from notifications where id=$1', [Number(id)]);
    if (!rowCount) {
      return reply.code(404).send({ error: 'Notification not found' });
    }
    return { deleted: true, id };
  } catch (err: any) {
    app.log.error({ err }, 'Error deleting notification');
    return reply.code(500).send({ error: 'Failed to delete notification' });
  }
});

async function start() {
  try {
    const address = await app.listen({ port, host: '0.0.0.0' });
    app.log.info({ address }, 'listening');
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();

