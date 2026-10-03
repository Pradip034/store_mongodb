import { existsSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
if (existsSync('.env')) {
  console.log('.env already exists; edit it to change your settings. Nothing was overwritten.');
} else {
  const password = randomBytes(18).toString('base64url');
  writeFileSync('.env', `PORT=3000\nHOST=127.0.0.1\nAPP_ORIGIN=http://localhost:3000\nNODE_ENV=development\nADMIN_EMAIL=admin@example.com\nADMIN_PASSWORD=${password}\nWHATSAPP_NUMBER=917550095485\nMONGODB_URI=mongodb://127.0.0.1:27017\nMONGODB_DB=health_partner\nSEED_DEMO=true\nRAZORPAY_KEY_ID=\nRAZORPAY_KEY_SECRET=\nRAZORPAY_WEBHOOK_SECRET=\nDELIVERY_FEE=4000\nFREE_DELIVERY_ABOVE=49900\nDEMO_CATALOG=true\n`, { mode: 0o600 });
  console.log(`Created .env. Keep it private.\nAdmin email: admin@example.com\nAdmin password: ${password}\nRun: node --env-file=.env server.mjs\nThen open http://localhost:3000`);
}
