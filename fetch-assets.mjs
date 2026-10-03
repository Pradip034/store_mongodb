// Build-time helper only. The running store serves bundled photographs locally.
import { writeFileSync } from 'node:fs';
const pages = [
  ['tomatoes', 'https://unsplash.com/photos/red-tomatoes-on-green-leaves-jF62cuCoGWQ'],
  ['pepper', 'https://unsplash.com/photos/a-close-up-of-a-pile-of-black-pepper-fyaSkCXtlOQ'],
  ['carrots', 'https://unsplash.com/photos/closeup-photo-of-bunch-of-orange-carrots-yNB8niq1qCk'],
  ['honey', 'https://unsplash.com/photos/clear-glass-jar-with-orange-liquid-zuj7kbZNcUk'],
  ['lentils', 'https://unsplash.com/photos/a-pile-of-red-lentils-sitting-on-top-of-a-table-szIFVLRH-4s']
];
for (const [name, page] of pages) {
  const html = await (await fetch(page)).text();
  const url = html.match(/https:\/\/images\.unsplash\.com\/photo-[a-zA-Z0-9-]+/)?.[0];
  if (!url) throw new Error(`No image URL found: ${page}`);
  const response = await fetch(url + '?auto=format&fit=crop&w=1000&q=85&fm=jpg');
  if (!response.ok) throw new Error(`Image download failed: ${name}`);
  writeFileSync(new URL(`./public/images/${name}.jpg`, import.meta.url), Buffer.from(await response.arrayBuffer()));
  console.log(name, url, response.headers.get('content-type'));
}
const turmeric = await fetch('https://cdn.pixabay.com/photo/2017/11/02/18/55/turmeric-2912134_1280.jpg');
if (!turmeric.ok) throw new Error('Turmeric download failed');
writeFileSync(new URL('./public/images/turmeric.jpg', import.meta.url), Buffer.from(await turmeric.arrayBuffer()));
