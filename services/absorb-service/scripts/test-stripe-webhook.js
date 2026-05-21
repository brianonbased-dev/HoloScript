import crypto from 'crypto';
import http from 'http';

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || 'whsec_test_secret';
const payload = JSON.stringify({
  id: "evt_test_123",
  type: "checkout.session.completed",
  data: {
    object: {
      id: "cs_test_123",
      object: "checkout.session",
      payment_status: "paid",
      metadata: {
        userId: "test-user-admin",
        amountCents: "5000"
      }
    }
  }
});

// Generate Stripe signature
// signature format: v1, t=<timestamp>
const timestamp = Math.floor(Date.now() / 1000);
const signedPayload = `${timestamp}.${payload}`;
const signature = crypto.createHmac('sha256', webhookSecret).update(signedPayload).digest('hex');
const stripeSignatureHeader = `t=${timestamp},v1=${signature}`;

console.log('Sending Test Webhook to http://localhost:3005/api/credits/webhook/stripe...');

const options = {
  hostname: 'localhost',
  port: 3005,
  path: '/api/credits/webhook/stripe',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
    'stripe-signature': stripeSignatureHeader
  }
};

const req = http.request(options, (res) => {
  let data = '';
  res.on('data', chunk => {
    data += chunk;
  });
  res.on('end', () => {
    console.log(`Response Status: ${res.statusCode}`);
    console.log(`Response Body: ${data}`);
    if (res.statusCode === 200) {
      console.log('✅ Webhook processed successfully!');
      process.exit(0);
    } else {
      console.error('❌ Webhook processing failed!');
      process.exit(1);
    }
  });
});

req.on('error', error => {
  console.error('❌ Request Error:', error.message);
  process.exit(1);
});

req.write(payload);
req.end();
