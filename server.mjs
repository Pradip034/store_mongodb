import http from 'node:http';
import { MongoClient } from 'mongodb';
import { randomBytes, randomUUID, scryptSync, timingSafeEqual, createHmac, createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import seed from './seed.mjs';
import { setServers } from 'node:dns/promises';

setServers(['8.8.8.8', '1.1.1.1']);

const root = path.dirname(fileURLToPath(import.meta.url));
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const str = (value, max, field) => {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) fail(400, `Invalid ${field}.`);
  return value.trim();
};
const integer = (v, min, max, field) => {
  if (!Number.isSafeInteger(v) || v < min || v > max) fail(400, `Invalid ${field}.`);
  return v;
};
export function verifySignature(message, signature, secret) {
  if (!secret || typeof signature !== 'string' || !/^[a-f0-9]{64}$/i.test(signature)) return false;
  return timingSafeEqual(createHmac('sha256', secret).update(message).digest(), Buffer.from(signature, 'hex'));
}
export function validateProduct(p) {
  const image = p.image ? str(p.image, 300, 'image') : '';
  const video = p.video ? str(p.video, 300, 'video') : '';
  if (video && !/^\/uploads\/[a-zA-Z0-9_-]+\.(mp4|webm)$/.test(video)) fail(400, 'Upload an MP4 or WebM video.');
  if (!image && !video) fail(400, 'Upload a photograph or video.');
  if (image && !/^\/(?:images|uploads)\/[a-zA-Z0-9_-]+\.(?:jpg|jpeg|png|webp)$/.test(image)) fail(400, 'Upload a JPG, PNG or WebP product image.');
  const price = integer(p.price, 100, 10000000, 'price');
  const mrp = integer(p.mrp, price, 10000000, 'MRP');
  if (typeof p.available !== 'boolean') fail(400, 'Invalid availability.');
  return { name: str(p.name, 100, 'name'), description: str(p.description, 5000, 'description'), category: str(p.category, 40, 'category'), unit: str(p.unit, 40, 'unit'), price, mrp, image, video, available: p.available };
}
export function priceCart(items, products, deliveryFee, freeAbove) {
  if (!Array.isArray(items) || !items.length || items.length > 40) fail(400, 'Your cart must contain 1–40 products.');
  const seen = new Set();
  const lines = items.map(item => {
    if (!item || seen.has(item.id)) fail(400, 'Invalid or duplicate cart item.');
    seen.add(item.id);
    const p = products.find(p => p.id === item.id && p.available);
    if (!p) fail(409, 'An item is no longer available. Refresh your cart.');
    const quantity = integer(item.quantity, 1, 50, 'quantity');
    return { id: p.id, name: p.name, unit: p.unit, price: p.price, quantity, total: p.price * quantity };
  });
  const subtotal = lines.reduce((s, l) => s + l.total, 0);
  if (subtotal > 10000000) fail(400, 'Please contact the store for bulk orders.');
  const delivery = subtotal >= freeAbove ? 0 : deliveryFee;
  return { lines, subtotal, delivery, total: subtotal + delivery };
}

export async function createApp(env = process.env) {
  const origin = new URL(env.APP_ORIGIN || 'http://localhost:3000').origin;
  const production = env.NODE_ENV === 'production';
  if (production && !origin.startsWith('https://')) throw new Error('APP_ORIGIN must use HTTPS in production.');
  const password = env.ADMIN_PASSWORD || '';
  if (password.length < 16 || password.startsWith('replace-')) throw new Error('Set a unique ADMIN_PASSWORD (16+ characters), or run node setup.mjs.');
  const salt = randomBytes(16);
  const passwordHash = scryptSync(password, salt, 64);
  const email = (env.ADMIN_EMAIL || 'admin@example.com').toLowerCase();
  const uploadsDir = path.resolve(env.UPLOADS_DIR || path.join(root, 'uploads'));
  mkdirSync(uploadsDir, { recursive: true });
  if (!env.MONGODB_URI) throw new Error('Set MONGODB_URI in .env to your MongoDB connection string.');
  const client = new MongoClient(env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  let db;
  try {
    await client.connect(); db = client.db(env.MONGODB_DB || 'health_partner');
    await Promise.all([
      db.collection('products').createIndex({ id: 1 }, { unique: true }),
      db.collection('orders').createIndex({ id: 1 }, { unique: true }),
      db.collection('orders').createIndex({ token: 1 }, { unique: true }),
      db.collection('orders').createIndex({ gateway_id: 1 }, { unique: true, partialFilterExpression: { gateway_id: { $type: 'string' } } }),
      db.collection('orders').createIndex({ created: -1 }),
      db.collection('reviews').createIndex({ id: 1 }, { unique: true }),
      db.collection('reviews').createIndex({ product_id: 1, created: -1 }),
      db.collection('sessions').createIndex({ hash: 1 }, { unique: true }),
      db.collection('sessions').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })
    ]);
    if (!await db.collection('meta').findOne({ _id: 'seeded' })) {
      if (env.SEED_DEMO !== 'false') for (const [index, p] of seed.entries()) await db.collection('products').updateOne({ id: p.id }, { $setOnInsert: { ...p, created: index } }, { upsert: true });
      await db.collection('meta').updateOne({ _id: 'seeded' }, { $set: { value: '1' } }, { upsert: true });
    }
  } catch (error) { await client.close(); throw error; }
  const products = () => db.collection('products').find({}, { projection: { _id: 0, created: 0 } }).sort({ created: 1, _id: 1 }).toArray();
  const sessionVersion = createHash('sha256').update(email + ':' + password).digest('hex');
  const reviewSummary = async productId => {
    const [summary] = await db.collection('reviews').aggregate([{ $match: { product_id: productId } }, { $group: { _id: null, count: { $sum: 1 }, average: { $avg: '$rating' } } }]).toArray();
    return { count: summary?.count || 0, average: summary?.average || null };
  };
  const deliveryFee = integer(Number(env.DELIVERY_FEE ?? 4000), 0, 1000000, 'delivery fee');
  const freeAbove = integer(Number(env.FREE_DELIVERY_ABOVE ?? 49900), 0, 10000000, 'free delivery threshold');
  const whatsapp = /^\d{8,15}$/.test(env.WHATSAPP_NUMBER || '') ? env.WHATSAPP_NUMBER : '';
  const paymentEnabled = Boolean(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET);
  const limits = new Map();
  function rate(req, bucket, max) {
    const now = Date.now();
    for (const [k, v] of limits) if (v.until < now) limits.delete(k);
    const key = `${req.socket.remoteAddress}:${bucket}`;
    const entry = limits.get(key) || { count: 0, until: now + 60000 };
    if (++entry.count > max) fail(429, 'Too many requests. Please wait a minute.');
    limits.set(key, entry);
  }
  const cookieHash = req => createHash('sha256').update((req.headers.cookie || '').match(/(?:^|;\s*)hp_session=([a-zA-Z0-9_-]+)/)?.[1] || '').digest('hex');
  async function admin(req) {
    const session = await db.collection('sessions').findOne({ hash: cookieHash(req), version: sessionVersion });
    if (!session || session.expires < Date.now()) fail(401, 'Please sign in as admin.');
  }
  async function body(req, max = 65536) {
    const chunks = []; let size = 0;
    for await (const chunk of req) { size += chunk.length; if (size > max) fail(413, 'File or request exceeds the allowed size.'); chunks.push(chunk); }
    return Buffer.concat(chunks);
  }
  async function json(req) {
    if (!req.headers['content-type']?.startsWith('application/json')) fail(415, 'Expected JSON.');
    try { const result = JSON.parse((await body(req)).toString()); if (!result || typeof result !== 'object' || Array.isArray(result)) fail(400, 'Expected a JSON object.'); return result; } catch (e) { if (e.status) throw e; fail(400, 'Invalid JSON.'); }
  }
  async function gateway(route, options = {}) {
    let response;
    try {
      response = await fetch(`https://api.razorpay.com/v1/${route}`, { ...options, signal: AbortSignal.timeout(15000), headers: { Authorization: `Basic ${Buffer.from(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`).toString('base64')}`, 'Content-Type': 'application/json' } });
    } catch { fail(502, 'Payment provider is unavailable. Please try again shortly.'); }
    if (!response.ok) fail(502, 'Payment provider rejected the request. Please contact the store.');
    return response.json();
  }
  async function settle(row, payment) {
    const order = row.body;
    if (payment.order_id !== row.gateway_id || payment.amount !== order.total || payment.currency !== 'INR' || payment.status !== 'captured') fail(409, 'Payment is not captured yet. Please check again shortly.');
    if (row.state !== 'paid') await db.collection('orders').updateOne({ id: row.id }, { $set: { state: 'paid', 'body.paymentId': payment.id } });
  }
  const send = (res, status, value) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); };
  const server = http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-Frame-Options', 'DENY');
    // Razorpay Standard Checkout inserts its overlay styles dynamically.
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' https://checkout.razorpay.com; style-src 'self' 'unsafe-inline'; media-src 'self' blob:; img-src 'self' data: blob: https://*.razorpay.com; connect-src 'self' https://*.razorpay.com; frame-src https://*.razorpay.com; form-action 'self'; base-uri 'self'; object-src 'none'");
    if (production) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
    try {
      const url = new URL(req.url, origin); const route = url.pathname;
      if (!['GET', 'HEAD', 'POST', 'PUT', 'DELETE'].includes(req.method)) fail(405, 'Method not allowed.');
      if (!['GET', 'HEAD'].includes(req.method) && route !== '/api/payments/webhook' && req.headers.origin !== origin) fail(403, 'Request origin does not match APP_ORIGIN.');
      if (route.startsWith('/api/')) rate(req, 'api', 180);
      if (route === '/api/config' && req.method === 'GET') return send(res, 200, { title: 'Let Us Be Your Health Partner', deliveryFee, freeAbove, whatsappEnabled: !!whatsapp, paymentEnabled, demo: env.DEMO_CATALOG !== 'false' });
      if (route === '/api/products' && req.method === 'GET') {
        const catalogue = await products();
        const summaries = new Map((await db.collection('reviews').aggregate([{ $group: { _id: '$product_id', count: { $sum: 1 }, average: { $avg: '$rating' } } }]).toArray()).map(r => [r._id, r]));
        return send(res, 200, await Promise.all(catalogue.map(async p => ({ ...p, reviewCount: summaries.get(p.id)?.count || 0, averageRating: summaries.get(p.id)?.average || null, latestReview: await db.collection('reviews').findOne({ product_id: p.id }, { sort: { created: -1, _id: -1 }, projection: { _id: 0, name: 1, rating: 1, comment: 1 } }) }))));
      }
      const reviewId = route.match(/^\/api\/products\/([a-zA-Z0-9-]+)\/reviews$/)?.[1];
      if (reviewId && ['GET', 'POST'].includes(req.method)) {
        if (!await db.collection('products').findOne({ id: reviewId })) fail(404, 'Product not found.');
        if (req.method === 'POST') {
          rate(req, 'reviews', 3);
          const input = await json(req);
          const name = str(input.name, 80, 'review name'), comment = str(input.comment, 2000, 'review');
          const rating = integer(input.rating, 1, 5, 'rating');
          await db.collection('reviews').insertOne({ id: randomUUID(), product_id: reviewId, name, rating, comment, created: Date.now() });
        }
        const summary = await reviewSummary(reviewId);
        const reviews = await db.collection('reviews').find({ product_id: reviewId }, { projection: { _id: 0, name: 1, rating: 1, comment: 1, created: 1 } }).sort({ created: -1, _id: -1 }).limit(100).toArray();
        return send(res, req.method === 'POST' ? 201 : 200, { ...summary, reviews });
      }
      if (route === '/api/admin/login' && req.method === 'POST') {
        rate(req, 'login', 5);
        const input = await json(req);
        const candidate = typeof input.password === 'string' && input.password.length <= 256 ? input.password : '';
        const valid = timingSafeEqual(scryptSync(candidate, salt, 64), passwordHash);
        if (!valid || String(input.email).toLowerCase() !== email) fail(401, 'Incorrect email or password.');
        const token = randomBytes(32).toString('base64url');
        await db.collection('sessions').deleteMany({ expires: { $lt: Date.now() } });
        await db.collection('sessions').insertOne({ hash: createHash('sha256').update(token).digest('hex'), expires: Date.now() + 8 * 3600000, expiresAt: new Date(Date.now() + 8 * 3600000), version: sessionVersion });
        res.setHeader('Set-Cookie', `hp_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${production ? '; Secure' : ''}`);
        return send(res, 200, { ok: true });
      }
      if (route.startsWith('/api/admin/')) {
        await admin(req);
        if (route === '/api/admin/session' && req.method === 'GET') return send(res, 200, { email });
        if (route === '/api/admin/logout' && req.method === 'POST') {
          await db.collection('sessions').deleteOne({ hash: cookieHash(req) });
          res.setHeader('Set-Cookie', `hp_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${production ? '; Secure' : ''}`);
          return send(res, 200, { ok: true });
        }
        if (route === '/api/admin/upload' && req.method === 'POST') {
          const isVideo = ['video/mp4', 'video/webm'].includes(req.headers['content-type']);
          const data = await body(req, (isVideo ? 30 : 3) * 1024 * 1024);
          let ext;
          if (data.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) ext = 'png';
          else if (data[0] === 255 && data[1] === 216 && data[2] === 255) ext = 'jpg';
          else if (data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WEBP') ext = 'webp';
          else if (req.headers['content-type'] === 'video/mp4' && data.length >= 24 && data.toString('ascii', 4, 8) === 'ftyp') ext = 'mp4';
          else if (req.headers['content-type'] === 'video/webm' && data.subarray(0, 4).equals(Buffer.from('1a45dfa3', 'hex')) && data.subarray(0, 4096).includes(Buffer.from('webm'))) ext = 'webm';
          else fail(400, 'Choose a JPG, PNG, WebP, MP4 or WebM file.');
          if (!['mp4', 'webm'].includes(ext) && data.length > 3 * 1024 * 1024) fail(413, 'Images must be at most 3 MB.');
          const name = `${randomUUID()}.${ext}`;
          writeFileSync(path.join(uploadsDir, name), data, { flag: 'wx' });
          return send(res, 201, { image: `/uploads/${name}`, url: `/uploads/${name}`, type: ['mp4', 'webm'].includes(ext) ? 'video' : 'image' });
        }
        if (route === '/api/admin/products' && req.method === 'POST') {
          const p = { id: randomUUID(), ...validateProduct(await json(req)) };
          await db.collection('products').insertOne({ ...p, created: Date.now() });
          return send(res, 201, p);
        }
        const productId = route.match(/^\/api\/admin\/products\/([a-zA-Z0-9-]+)$/)?.[1];
        if (productId && ['PUT', 'DELETE'].includes(req.method)) {
          if (!await db.collection('products').findOne({ id: productId })) fail(404, 'Product not found.');
          if (req.method === 'DELETE') await db.collection('products').deleteOne({ id: productId });
          else { const p = { id: productId, ...validateProduct(await json(req)) }; await db.collection('products').updateOne({ id: productId }, { $set: p }); }
          return send(res, 200, { ok: true });
        }
        const orderId = route.match(/^\/api\/admin\/orders\/([a-zA-Z0-9-]+)\/status$/)?.[1];
        if (orderId && req.method === 'PUT') {
          const input = await json(req);
          if (!['in_process', 'delivered', 'rejected'].includes(input.status)) fail(400, 'Choose In Process, Delivered or Rejected.');
          if (!await db.collection('orders').findOne({ id: orderId })) fail(404, 'Order not found.');
          await db.collection('orders').updateOne({ id: orderId }, { $set: { fulfillment: input.status, fulfillmentUpdated: Date.now() } });
          return send(res, 200, { ok: true, status: input.status });
        }
        if (route === '/api/admin/orders' && req.method === 'GET') return send(res, 200, (await db.collection('orders').find().sort({ created: -1 }).limit(200).toArray()).map(row => ({ ...row.body, id: row.id, state: row.state, fulfillment: row.fulfillment || 'in_process', created: row.created })));
      }
      if (route === '/api/orders' && req.method === 'POST') {
        rate(req, 'orders', 12);
        const input = await json(req);
        const token = str(input.token, 80, 'checkout token');
        if (!/^[a-f0-9-]{36,80}$/.test(token)) fail(400, 'Invalid checkout token.');
        if (!['whatsapp', 'razorpay'].includes(input.method)) fail(400, 'Invalid payment method.');
        if (input.method === 'whatsapp' && !whatsapp) fail(503, 'The store has not configured WhatsApp ordering yet.');
        if (input.method === 'razorpay' && !paymentEnabled) fail(503, 'Online payments are not configured yet.');
        const existing = await db.collection('orders').findOne({ token });
        if (existing) {
          if (existing.body.method !== input.method) fail(409, 'Start a new checkout when changing payment methods.');
          if (['creating', 'failed'].includes(existing.state)) fail(409, 'Checkout is pending or failed. Start a new checkout in a moment.');
          return send(res, 200, checkoutResponse(existing));
        }
        const customer = { name: str(input.customer?.name, 100, 'customer name'), phone: str(input.customer?.phone, 20, 'phone'), address: str(input.customer?.address, 700, 'delivery address') };
        if (!/^\+?[\d ()-]{8,20}$/.test(customer.phone)) fail(400, 'Enter a valid phone number.');
        const order = { ...priceCart(input.items, await products(), deliveryFee, freeAbove), customer, method: input.method };
        const id = randomUUID();
        await db.collection('orders').insertOne({ id, token, state: 'creating', body: order, created: Date.now(), fulfillment: 'in_process' });
        try {
          if (input.method === 'razorpay') {
            const remote = await gateway('orders', { method: 'POST', body: JSON.stringify({ amount: order.total, currency: 'INR', receipt: id }) });
            await db.collection('orders').updateOne({ id }, { $set: { gateway_id: remote.id, state: 'awaiting_payment' } });
          } else await db.collection('orders').updateOne({ id }, { $set: { state: 'whatsapp_pending' } });
        } catch (e) { await db.collection('orders').updateOne({ id }, { $set: { state: 'failed' } }); throw e; }
        return send(res, 201, checkoutResponse(await db.collection('orders').findOne({ id })));
      }
      function checkoutResponse(row) {
        const order = row.body;
        const money = n => `INR ${(n / 100).toFixed(2)}`;
        const message = ['Hello! I would like to order from Let Us Be Your Health Partner.', `Order: ${row.id}`, ...order.lines.map(l => `${l.name} (${l.unit}) x ${l.quantity}: ${money(l.total)}`), `Delivery: ${money(order.delivery)}`, `Total: ${money(order.total)}`, `Name: ${order.customer.name}`, `Phone: ${order.customer.phone}`, `Address: ${order.customer.address}`, 'Please confirm availability and delivery. This WhatsApp order has not been paid online.'].join('\n');
        return { id: row.id, state: row.state, amount: order.total, key: env.RAZORPAY_KEY_ID || '', gatewayOrderId: row.gateway_id, whatsappUrl: order.method === 'whatsapp' ? `https://wa.me/${whatsapp}?text=${encodeURIComponent(message)}` : undefined };
      }
      if (route === '/api/payments/verify' && req.method === 'POST') {
        const input = await json(req);
        const row = await db.collection('orders').findOne({ id: String(input.id), token: String(input.token) });
        if (!row || !row.gateway_id) fail(404, 'Order not found.');
        if (input.razorpay_order_id !== row.gateway_id || !verifySignature(`${row.gateway_id}|${input.razorpay_payment_id}`, input.razorpay_signature, env.RAZORPAY_KEY_SECRET)) fail(400, 'Invalid payment signature.');
        if (!/^pay_[a-zA-Z0-9]+$/.test(input.razorpay_payment_id)) fail(400, 'Invalid payment ID.');
        await settle(row, await gateway(`payments/${input.razorpay_payment_id}`));
        return send(res, 200, { state: 'paid', id: row.id });
      }
      if (route === '/api/payments/status' && req.method === 'POST') {
        rate(req, 'status', 20);
        const input = await json(req);
        const row = await db.collection('orders').findOne({ id: String(input.id), token: String(input.token) });
        if (!row) fail(404, 'Order not found.');
        if (row.gateway_id && row.state === 'awaiting_payment') {
          const payments = await gateway(`orders/${row.gateway_id}/payments`);
          const captured = payments.items?.find(p => p.status === 'captured');
          if (captured) { await settle(row, captured); row.state = 'paid'; }
        }
        return send(res, 200, { id: row.id, state: row.state });
      }
      if (route === '/api/payments/webhook' && req.method === 'POST') {
        const raw = await body(req);
        if (!verifySignature(raw, req.headers['x-razorpay-signature'], env.RAZORPAY_WEBHOOK_SECRET)) fail(400, 'Invalid webhook signature.');
        let event; try { event = JSON.parse(raw); } catch { fail(400, 'Invalid webhook JSON.'); }
        if (['payment.captured', 'order.paid'].includes(event.event)) {
          const payment = event.payload?.payment?.entity;
          if (!payment?.order_id) fail(400, 'Missing payment.');
          const row = await db.collection('orders').findOne({ gateway_id: payment.order_id });
          if (!row) fail(503, 'Order not yet recorded. Retry webhook.');
          await settle(row, payment);
        }
        return send(res, 200, { ok: true });
      }
      if (route.startsWith('/api/')) fail(404, 'API endpoint not found.');
      if (!['GET', 'HEAD'].includes(req.method)) fail(405, 'Method not allowed.');
      const files = { '/': 'index.html', '/admin': 'admin.html', '/admin/orders': 'admin.html', '/style.css': 'style.css', '/app.js': 'app.js', '/admin.js': 'admin.js', '/product.js': 'product.js' };
      if (/^\/products\/[a-zA-Z0-9-]+$/.test(route)) { if (!(await products()).some(p => p.id === route.split('/')[2])) fail(404, 'Product not found.'); files[route] = 'product.html'; }
      let filename = files[route] ? path.join(root, 'public', files[route]) : null;
      if (/^\/images\/[a-zA-Z0-9_-]+\.(jpg|jpeg|png|webp)$/.test(route)) filename = path.join(root, 'public', route);
      if (/^\/uploads\/[a-zA-Z0-9_-]+\.(jpg|jpeg|png|webp|mp4|webm)$/.test(route)) filename = path.join(uploadsDir, path.basename(route));
      if (!filename || !existsSync(filename)) fail(404, 'Page not found.');
      const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.mp4': 'video/mp4', '.webm': 'video/webm' };
      if (['.mp4', '.webm'].includes(path.extname(filename))) {
        const size = statSync(filename).size;
        res.setHeader('Accept-Ranges', 'bytes');
        if (req.headers.range) {
          const match = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
          let start = match?.[1] ? Number(match[1]) : Math.max(0, size - Number(match?.[2]));
          let end = match?.[1] && match[2] ? Math.min(size - 1, Number(match[2])) : size - 1;
          if (!match || (!match[1] && !match[2]) || !Number.isSafeInteger(start) || start > end || start >= size) { res.writeHead(416, { 'Content-Range': 'bytes */' + size }); return res.end(); }
          res.writeHead(206, { 'Content-Type': types[path.extname(filename)], 'Content-Range': 'bytes ' + start + '-' + end + '/' + size, 'Content-Length': end - start + 1 });
          return res.end(req.method === 'HEAD' ? undefined : readFileSync(filename).subarray(start, end + 1));
        }
      }
      res.writeHead(200, { 'Content-Type': types[path.extname(filename)], 'Content-Length': statSync(filename).size, 'Cache-Control': route === '/admin' ? 'no-store' : 'no-cache' });
      res.end(req.method === 'HEAD' ? undefined : readFileSync(filename));
    } catch (e) {
      if (e.code === 11000) { e.status = 409; e.message = 'This request is already being processed. Retry shortly.'; }
      if (!e.status) console.error('Request failed:', e.name);
      if (!res.headersSent) send(res, e.status || 500, { error: e.status ? e.message : 'Something went wrong. Please try again.' });
      else res.end();
    }
  });
  server.requestTimeout = 30000; server.headersTimeout = 15000;
  server.closeDatabase = () => client.close();
  server.on('close', () => { client.close().catch(() => {}); });
  return server;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = await createApp();
  server.listen(Number(process.env.PORT || 3000), process.env.HOST || '127.0.0.1', () => console.log(`Store ready: ${process.env.APP_ORIGIN || 'http://localhost:3000'} — Admin: /admin`));
}
