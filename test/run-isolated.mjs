import { MongoMemoryServer } from 'mongodb-memory-server-core';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mongo=await MongoMemoryServer.create();
try {
  const child=spawn(process.execPath,['--test','test/store.test.mjs'],{cwd:root,stdio:'inherit',env:{...process.env,MONGODB_TEST_URI:mongo.getUri()}});
  process.exitCode=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',code=>resolve(code ?? 1));});
} finally { await mongo.stop(); }
