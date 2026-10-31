// Builds a one-or-more page A4 invoice PDF using the standard Helvetica fonts, so no PDF library is needed.
export const issuer = { name: 'Aranya Global', lines: ['Kolkata - 700079', 'West Bengal, India'], brand: 'Let Us Be Your Health Partner' };

const regular = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584];
const bold = [278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584];
// Characters outside Latin-1 that WinAnsiEncoding still supports.
const winAnsi = { '€': 0x80, '‚': 0x82, '„': 0x84, '…': 0x85, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97, '™': 0x99 };
const clean = text => String(text ?? '').replaceAll('₹', 'Rs. ').replace(/\s+/g, ' ').trim();
const encode = text => Buffer.from([...clean(text)].map(c => winAnsi[c] ?? (c.charCodeAt(0) <= 0xff ? c.charCodeAt(0) : 63)));
const width = (text, size, isBold) => [...clean(text)].reduce((sum, c) => { const code = c.charCodeAt(0); return sum + ((code >= 32 && code <= 126 ? (isBold ? bold : regular)[code - 32] : 556)); }, 0) * size / 1000;
const literal = text => '(' + encode(text).toString('latin1').replace(/[\\()]/g, m => '\\' + m) + ')';
const rgb = hex => [0, 2, 4].map(i => (parseInt(hex.slice(1 + i, 3 + i), 16) / 255).toFixed(3)).join(' ');
const money = n => 'Rs. ' + (n / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function wrap(text, size, isBold, max) {
  const lines = []; let line = '';
  for (const word of clean(text).split(' ')) {
    const next = line ? line + ' ' + word : word;
    if (width(next, size, isBold) <= max || !line) line = next; else { lines.push(line); line = word; }
  }
  if (line) lines.push(line);
  return lines.flatMap(l => { const parts = []; while (width(l, size, isBold) > max && l.length > 1) { let cut = l.length - 1; while (cut > 1 && width(l.slice(0, cut), size, isBold) > max) cut--; parts.push(l.slice(0, cut)); l = l.slice(cut); } parts.push(l); return parts; });
}

export function invoicePdf(inv) {
  const W = 595.28, H = 841.89, M = 42, forest = '#173c2d', lime = '#d7ed8b', ink = '#20382a', muted = '#687466', line = '#dfe4da', paper = '#f4f6ef';
  const pages = []; let ops;
  const text = (x, y, value, { size = 10, isBold = false, color = ink, align = 'left' } = {}) => {
    const dx = align === 'right' ? x - width(value, size, isBold) : align === 'center' ? x - width(value, size, isBold) / 2 : x;
    ops.push(`BT /${isBold ? 'F2' : 'F1'} ${size} Tf ${rgb(color)} rg ${dx.toFixed(2)} ${(H - y).toFixed(2)} Td ${literal(value)} Tj ET`);
  };
  const rect = (x, y, w, h, fill) => ops.push(`${rgb(fill)} rg ${x.toFixed(2)} ${(H - y - h).toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f`);
  const rule = (x1, y, x2, color = line, lw = 0.8) => ops.push(`${rgb(color)} RG ${lw} w ${x1.toFixed(2)} ${(H - y).toFixed(2)} m ${x2.toFixed(2)} ${(H - y).toFixed(2)} l S`);
  const newPage = () => { ops = []; pages.push(ops); };

  const date = new Date(inv.created).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
  const payment = { paid: 'Paid online', awaiting_payment: 'Online payment pending', whatsapp_pending: 'WhatsApp order' }[inv.state] || clean(inv.state).replaceAll('_', ' ');
  const status = { in_process: 'In process', delivered: 'Delivered', rejected: 'Rejected' }[inv.fulfillment] || inv.fulfillment;

  newPage();
  // Header band
  rect(0, 0, W, 112, forest);
  text(M, 46, issuer.name, { size: 24, isBold: true, color: '#ffffff' });
  text(M, 66, issuer.brand, { size: 10, color: lime });
  text(M, 84, issuer.lines.join('  |  '), { size: 9, color: '#dae4d9' });
  if (inv.store?.phone) text(M, 98, `Call / WhatsApp: ${inv.store.phone}`, { size: 9, color: '#dae4d9' });
  text(W - M, 50, 'INVOICE', { size: 26, isBold: true, color: lime, align: 'right' });
  text(W - M, 72, inv.number, { size: 10, isBold: true, color: '#ffffff', align: 'right' });
  text(W - M, 88, `Date: ${date}`, { size: 9, color: '#dae4d9', align: 'right' });

  // Parties
  let y = 146; const col = (W - 2 * M) / 2;
  text(M, y, 'ISSUED BY', { size: 8, isBold: true, color: muted }); text(M + col + 10, y, 'BILLED & DELIVERED TO', { size: 8, isBold: true, color: muted });
  const from = [issuer.name, ...issuer.lines, inv.store?.phone ? 'Phone: ' + inv.store.phone : ''].filter(Boolean);
  const to = [inv.customer.name, ...wrap(inv.customer.address, 10, false, col - 20), 'Phone: ' + inv.customer.phone];
  from.forEach((l, i) => text(M, y + 18 + i * 14, l, { size: 10, isBold: i === 0 }));
  to.forEach((l, i) => text(M + col + 10, y + 18 + i * 14, l, { size: 10, isBold: i === 0 }));
  y += 18 + Math.max(from.length, to.length) * 14 + 10;

  // Order details strip
  rect(M, y, W - 2 * M, 40, paper);
  const details = [['Invoice no.', inv.number], ['Order reference', inv.id.slice(0, 18) + (inv.id.length > 18 ? '…' : '')], ['Payment', payment], ['Order status', status]];
  const dw = (W - 2 * M) / details.length;
  details.forEach(([k, v], i) => { text(M + 10 + i * dw, y + 15, k.toUpperCase(), { size: 7, isBold: true, color: muted }); text(M + 10 + i * dw, y + 30, v, { size: 9, isBold: true }); });
  y += 62;

  // Items table
  const cols = [{ x: M + 8, w: 22, title: '#' }, { x: M + 32, w: 200, title: 'Item' }, { x: M + 238, w: 64, title: 'Pack' }, { x: W - M - 150, title: 'Unit price', right: true }, { x: W - M - 92, title: 'Qty', right: true }, { x: W - M - 8, title: 'Amount', right: true }];
  const tableHead = () => { rect(M, y, W - 2 * M, 24, forest); for (const c of cols) text(c.x, y + 16, c.title.toUpperCase(), { size: 8, isBold: true, color: '#ffffff', align: c.right ? 'right' : 'left' }); y += 24; };
  tableHead();
  inv.lines.forEach((l, i) => {
    const nameLines = wrap(l.name, 10, false, cols[1].w - 6), h = 10 + nameLines.length * 13;
    if (y + h > H - 150) { newPage(); y = M; tableHead(); }
    if (i % 2) rect(M, y, W - 2 * M, h, paper);
    text(cols[0].x, y + 16, String(i + 1), { size: 9, color: muted });
    nameLines.forEach((n, j) => text(cols[1].x, y + 16 + j * 13, n, { size: 10 }));
    text(cols[2].x, y + 16, wrap(l.unit, 9, false, cols[2].w)[0], { size: 9, color: muted });
    text(cols[3].x, y + 16, money(l.price), { size: 10, align: 'right' });
    text(cols[4].x, y + 16, String(l.quantity), { size: 10, align: 'right' });
    text(cols[5].x, y + 16, money(l.total), { size: 10, isBold: true, align: 'right' });
    y += h; rule(M, y, W - M);
  });

  // Totals
  if (y > H - 170) { newPage(); y = M; }
  y += 14; const tx = W - M - 220;
  for (const [k, v] of [['Subtotal', money(inv.subtotal)], ['Delivery', inv.delivery ? money(inv.delivery) : 'Free']]) { text(tx, y + 10, k, { size: 10, color: muted }); text(W - M - 8, y + 10, v, { size: 10, align: 'right' }); y += 20; }
  rect(tx - 10, y, W - M - tx + 10, 32, lime);
  text(tx, y + 21, 'Total amount', { size: 11, isBold: true, color: forest }); text(W - M - 8, y + 21, money(inv.total), { size: 13, isBold: true, color: forest, align: 'right' });
  y += 56;
  if (inv.paymentId) { text(M, y, `Payment ID: ${inv.paymentId}`, { size: 9, color: muted }); y += 14; }

  // Footer on every page
  pages.forEach((p, i) => { ops = p; rule(M, H - 64, W - M); text(M, H - 46, `Thank you for shopping with ${issuer.brand}.`, { size: 9, isBold: true, color: forest }); text(M, H - 32, 'This is a computer-generated invoice and does not require a signature.', { size: 8, color: muted }); text(W - M, H - 32, `Page ${i + 1} of ${pages.length}`, { size: 8, color: muted, align: 'right' }); });

  // Assemble the PDF objects: 1 catalog, 2 pages, 3-4 fonts, then a page + content pair per page.
  const objects = [];
  const kids = pages.map((_, i) => `${5 + i * 2} 0 R`).join(' ');
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[2] = `<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`;
  objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
  objects[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';
  pages.forEach((p, i) => {
    const stream = Buffer.from(p.join('\n'), 'latin1');
    objects[5 + i * 2] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${6 + i * 2} 0 R >>`;
    objects[6 + i * 2] = Buffer.concat([Buffer.from(`<< /Length ${stream.length} >>\nstream\n`, 'latin1'), stream, Buffer.from('\nendstream', 'latin1')]);
  });
  const chunks = [Buffer.from('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n', 'latin1')]; const offsets = []; let size = chunks[0].length;
  for (let n = 1; n < objects.length; n++) {
    offsets[n] = size;
    const body = Buffer.isBuffer(objects[n]) ? objects[n] : Buffer.from(objects[n], 'latin1');
    const chunk = Buffer.concat([Buffer.from(`${n} 0 obj\n`, 'latin1'), body, Buffer.from('\nendobj\n', 'latin1')]);
    chunks.push(chunk); size += chunk.length;
  }
  const xref = [`xref\n0 ${objects.length}\n0000000000 65535 f \n`, ...offsets.slice(1).map(o => String(o).padStart(10, '0') + ' 00000 n \n')].join('');
  chunks.push(Buffer.from(`${xref}trailer\n<< /Size ${objects.length} /Root 1 0 R /Info << /Title ${literal('Invoice ' + inv.number)} /Producer (Aranya Global) >> >>\nstartxref\n${size}\n%%EOF\n`, 'latin1'));
  return Buffer.concat(chunks);
}
