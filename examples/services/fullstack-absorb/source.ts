/**
 * v5.4 "Domains Unified" — Source TypeScript Service
 *
 * This Express + Prisma service is the input for the absorb_typescript
 * MCP tool. Run `absorb_typescript` on this file to see the output
 * in absorbed.holo.
 */

import express from 'express';
import { PrismaClient } from '@prisma/client';
import { CircuitBreaker } from 'opossum';
import { Queue, Worker } from 'bullmq';

const app = express();
const prisma = new PrismaClient();

// Circuit breaker for external payment API
const paymentBreaker = new CircuitBreaker(
  async (orderId: string, amount: number) => {
    const response = await fetch('https://payments.example.com/charge', {
      method: 'POST',
      body: JSON.stringify({ orderId, amount }),
    });
    return response.json();
  },
  { timeout: 5000, errorThresholdPercentage: 50 }
);

// Background job queue
const notificationQueue = new Queue('order-notifications');

// ── Routes ──────────────────────────────────────────────────────────────────

app.get('/orders', async (req, res) => {
  const orders = await prisma.order.findMany({
    include: { items: true },
    orderBy: { createdAt: 'desc' },
  });
  res.json(orders);
});

app.get('/orders/:id', async (req, res) => {
  const order = await prisma.order.findUnique({
    where: { id: req.params.id },
    include: { items: true },
  });
  if (!order) return res.status(404).json({ error: 'Not found' });
  res.json(order);
});

app.post('/orders', async (req, res) => {
  const { customerId, items } = req.body;
  const total = items.reduce(
    (sum: number, item: { price: number; quantity: number }) =>
      sum + item.price * item.quantity,
    0
  );

  const order = await prisma.order.create({
    data: { customerId, total, status: 'pending', items: { create: items } },
    include: { items: true },
  });

  // Charge via payment circuit breaker
  const payment = await paymentBreaker.fire(order.id, total);
  if (payment.success) {
    await prisma.order.update({
      where: { id: order.id },
      data: { status: 'paid' },
    });
  }

  // Queue notification
  await notificationQueue.add('order-created', { orderId: order.id });

  res.status(201).json(order);
});

// ── Queue Worker ────────────────────────────────────────────────────────────

const worker = new Worker('order-notifications', async (job) => {
  console.log(`Sending notification for order ${job.data.orderId}`);
});

app.listen(3000, () => console.log('Order service running on :3000'));
