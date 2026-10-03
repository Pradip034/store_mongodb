// Optional one-time importer. The live application does not use SQLite.
import { DatabaseSync } from 'node:sqlite';
import { MongoClient } from 'mongodb';
import { existsSync } from 'node:fs';
import path from 'node:path';
const source = process.argv[2];
if (!source || !existsSync(source)) throw new Error('Usage: node --env-file=.env migrate-sqlite.mjs /path/to/store.sqlite');
if (!process.env.MONGODB_URI) throw new Error('Set MONGODB_URI in .env first.');
const sqlite = new DatabaseSync(path.resolve(source), { readOnly: true });
const client = new MongoClient(process.env.MONGODB_URI);
try {
  await client.connect(); const db=client.db(process.env.MONGODB_DB || 'health_partner');
  // Run with both stores stopped. Repeated runs only insert missing records.
  await db.collection('products').createIndex({id:1},{unique:true});
  await db.collection('orders').createIndex({id:1},{unique:true});
  await db.collection('orders').createIndex({token:1},{unique:true});
  await db.collection('reviews').createIndex({id:1},{unique:true});
  const tables = new Set(sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r=>r.name));
  let inserted=0;
  for (const [index,row] of sqlite.prepare('SELECT body FROM products ORDER BY rowid').all().entries()) {
    const product=JSON.parse(row.body); const result=await db.collection('products').updateOne({id:product.id},{$setOnInsert:{...product,created:index}},{upsert:true}); inserted+=result.upsertedCount;
  }
  const statuses = new Map(tables.has('order_fulfillment') ? sqlite.prepare('SELECT * FROM order_fulfillment').all().map(r=>[r.order_id,r.status]) : []);
  for (const row of sqlite.prepare('SELECT * FROM orders').all()) {
    const order={id:row.id,token:row.token,state:row.state,body:JSON.parse(row.body),created:row.created,fulfillment:statuses.get(row.id)||'in_process'};
    if(row.gateway_id) order.gateway_id=row.gateway_id;
    const result=await db.collection('orders').updateOne({id:row.id},{$setOnInsert:order},{upsert:true}); inserted+=result.upsertedCount;
  }
  if(tables.has('reviews')) for(const row of sqlite.prepare('SELECT * FROM reviews').all()) {
    const result=await db.collection('reviews').updateOne({id:row.id},{$setOnInsert:{...row}},{upsert:true}); inserted+=result.upsertedCount;
  }
  await db.collection('meta').updateOne({_id:'seeded'},{$set:{value:'1'}},{upsert:true});
  console.log(`Imported ${inserted} missing records. Source database unchanged. Copy uploads separately; sign in again in the new app.`);
} finally { sqlite.close(); await client.close(); }
