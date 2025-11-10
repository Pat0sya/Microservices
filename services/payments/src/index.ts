import Fastify from 'fastify';
import { z } from 'zod';
import pg from 'pg';

const { Pool } = pg as any;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const app = Fastify({ logger: true });
const port = Number(process.env.PORT || 3006);

app.get('/health', async () => ({ status: 'ok', service: 'payments' }));

const chargeSchema = z.object({
  paymentId: z.coerce.string().min(1),
  amount: z.coerce.number().positive(),
  currency: z.coerce.string().min(1),
  orderId: z.union([z.string(), z.number()]).transform(v=>String(v)).optional(),
});
app.post('/payments/charge', async (req, reply) => {
  const parsed = chargeSchema.safeParse(req.body);
  if (!parsed.success) return reply.code(400).send({ error: 'Invalid input', details: parsed.error.flatten() });
  const { paymentId, amount, currency } = parsed.data as any;
  // Simulate success for even ids and failure for odd (simple determinism)
  const ok = Number(paymentId.replace(/\D/g, '').slice(-1) || '0') % 2 === 0;
  const status = ok ? 'captured' : 'failed';
  try {
    await pool.query('insert into payments(payment_id, amount, currency, status, order_id) values ($1,$2,$3,$4,$5)', [paymentId, amount, currency, status, parsed.data.orderId ? Number(parsed.data.orderId) : null]);
  } catch {}
  if (!ok) return reply.code(402).send({ status: 'failed' });
  return { status: 'captured' };
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

