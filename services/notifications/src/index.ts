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

