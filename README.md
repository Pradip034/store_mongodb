# Health Partner — MongoDB edition

Complete store with photos/videos, product detail pages, customer reviews, cart, WhatsApp order links, Razorpay payments, header contact links and admin order fulfillment (In Process / Delivered / Rejected).

## Run locally

Install Node.js 24 or newer, including npm. In this folder:

```sh
npm install
node setup.mjs
```

Edit the generated `.env` file. For MongoDB Atlas, paste the connection string provided by Atlas (replace the database user's password with its URL-encoded value):

```dotenv
MONGODB_URI=mongodb+srv://DATABASE_USER:ENCODED_PASSWORD@YOUR_CLUSTER.mongodb.net/?retryWrites=true&w=majority
MONGODB_DB=health_partner
WHATSAPP_NUMBER=917550095485
```

Create an Atlas database user with read/write access to this database and allow your computer/server outbound IP in Atlas Network Access. Do not share the connection string or commit `.env`. The default local URI requires MongoDB to be installed and running locally; Node.js alone does not supply a MongoDB server.

```sh
npm start
```

Open http://localhost:3000 ; admin http://localhost:3000/admin ; orders http://localhost:3000/admin/orders. Setup prints a generated admin password. Change ADMIN_EMAIL and ADMIN_PASSWORD in `.env` as needed. Change both PORT and APP_ORIGIN if using a different port.

## Storage and hosting

The application uses the official MongoDB Node driver. MongoDB stores products, orders, reviews, fulfillment status and expiring admin sessions. Unique checkout tokens prevent duplicate order creation. Session credentials remain valid across restarts, expire after eight hours and are invalidated when the configured admin email/password changes.

Photos and videos STILL use the local `uploads/` directory. Use persistent disk for uploads or mount persistent storage and set UPLOADS_DIR. MongoDB Atlas does not store these files. Cloudinary/S3 media integration is not included. Preserve uploads during updates and back them up. Only one app instance is recommended because uploads and request rate limits are local.

For production set NODE_ENV=production, HOST=0.0.0.0, APP_ORIGIN to the exact public HTTPS origin, and configure MongoDB plus a persistent UPLOADS_DIR. Do not include a path such as /store in APP_ORIGIN: this application serves from the domain root. Terminate HTTPS at the hosting proxy. Set the service port as required by the hosting provider. The included Dockerfile installs the driver and starts the server; configure environment variables and a writable persistent uploads volume externally.

Set SEED_DEMO=false before the FIRST launch to start without sample products. DEMO_CATALOG=false hides the sample-catalogue notice after replacing sample products. Changes to seed.mjs do not overwrite existing records.

## Bring over existing SQLite records (optional)

1. Stop the old app and back up its data and uploads folders.
2. Install dependencies and configure `.env` in this new project, but do not start the new app yet. Use a new, empty MongoDB database for migration.
3. Run:

```sh
node --env-file=.env migrate-sqlite.mjs "../health-partner-store/data/store.sqlite"
```

4. Copy the old uploads folder into this project (or your configured UPLOADS_DIR), then start the new app.

The importer is read-only against SQLite and inserts missing IDs only. It preserves order/payment states and delivery statuses. It does not overwrite existing MongoDB records or copy sessions. If interrupted, rerun with both apps stopped. The importer requires Node.js 24's built-in SQLite support; the running MongoDB app does not use SQLite. Keep backups until you have compared product, order, review and media records.

## Orders and payments

Submitting checkout saves an order before returning its WhatsApp link or payment details. Customers must tap Send in WhatsApp. A saved WhatsApp order does not prove a message was sent or a payment made. Automatic WhatsApp confirmations are not included.

Configure RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET and RAZORPAY_WEBHOOK_SECRET for payment support. Leave blank to disable online payment. Test with test-mode keys before going live. The webhook is /api/payments/webhook and supports payment.captured and order.paid. Configure automatic payment capture. Delivery status is independent of payment status; rejecting an order does not issue a refund. DELIVERY_FEE and FREE_DELIVERY_ABOVE are in paise (4000 = INR 40). Admin shows the latest 200 orders.

Reviews are public, unverified visitor submissions. Images support JPG/PNG/WebP up to 3 MB; videos MP4/WebM up to 30 MB. MP4/H.264 is recommended. Watch video starts muted in the catalogue. Source photo credits: ASSETS.md.

## Tests

```sh
npm test
```

Pure validation tests run without a database. The full HTTP integration test requires MONGODB_TEST_URI and otherwise reports a skip. It creates and deletes a uniquely named hp_test_* database; use a local/test deployment with permission to create/drop test databases, not production credentials.

PowerShell:

```powershell
$env:MONGODB_TEST_URI='mongodb://127.0.0.1:27017'
npm test
```

Integration coverage: authentication/origin checks, media uploads, reviews, order creation and retry handling, mocked payment verification, fulfillment updates and restart persistence. No real payment is made.

Alternatively, run `node test/run-isolated.mjs` to download a temporary MongoDB server and run the full test suite automatically. This requires internet access and can download a large server binary on first run. It uses a separate temporary database and stops the test server afterward.

Driver documentation: https://www.mongodb.com/docs/drivers/node/current/
