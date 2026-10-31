const $ = id => document.getElementById(id);
const form = $('product-form');
const money = n => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(n / 100);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
let currentVideo = '', videoPreviewUrl = '';
let currentImage = '', products = [], previewUrl = '';
async function api(url, method = 'GET', data) {
  const response = await fetch(url, { method, ...(data ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) } : {}) });
  const result = await response.json();
  if (response.status === 401) { $('login-section').hidden = false; $('dashboard').hidden = true; }
  if (!response.ok) throw new Error(result.error || 'Request failed.'); return result;
}
function status(text, error = false) { $('admin-status').textContent = text; $('admin-status').classList.toggle('error', error); }
function reset() { currentVideo = ''; if (videoPreviewUrl) URL.revokeObjectURL(videoPreviewUrl); videoPreviewUrl = ''; $('video-preview').pause(); $('video-preview').removeAttribute('src'); $('video-preview').hidden = true; form.reset(); form.elements.id.value = ''; currentImage = ''; if (previewUrl) URL.revokeObjectURL(previewUrl); previewUrl = ''; $('image-preview').hidden = true; $('editor-title').textContent = 'Add a product'; }
async function loadProducts() {
  products = await api('/api/products'); $('admin-products').replaceChildren();
  if (!products.length) $('admin-products').append(el('p', 'empty', 'Add your first product using the form.'));
  for (const p of products) {
    const row = el('div', 'admin-product'), img = el(p.image ? 'img' : 'video'); img.src = p.image || p.video; img.alt = p.name; if (!p.image) { img.muted = true; img.preload = 'metadata'; }
    const info = el('div'); info.append(el('strong', '', p.name), el('small', '', `${money(p.price)} / ${p.unit} · ${p.available ? 'Available' : 'Unavailable'}`));
    const actions = el('div', 'admin-actions'), edit = el('button', '', 'Edit'), remove = el('button', 'danger', 'Delete');
    edit.onclick = () => { reset(); for (const key of ['id', 'name', 'description', 'category', 'unit']) form.elements[key].value = p[key]; form.elements.price.value = (p.price / 100).toFixed(2); form.elements.mrp.value = (p.mrp / 100).toFixed(2); form.elements.available.checked = p.available; currentVideo = p.video || ''; $('video-preview').src = currentVideo; $('video-preview').hidden = !currentVideo; currentImage = p.image; $('image-preview').src = p.image; $('image-preview').hidden = !p.image; $('editor-title').textContent = 'Edit product'; form.scrollIntoView({ behavior: 'smooth', block: 'start' }); form.elements.name.focus({ preventScroll: true }); };
    remove.onclick = async () => { if (!confirm(`Delete ${p.name}? Existing order records will be retained.`)) return; remove.disabled = true; try { await api(`/api/admin/products/${p.id}`, 'DELETE'); if (form.elements.id.value === p.id) reset(); await loadProducts(); status('Product deleted.'); } catch (e) { status(e.message, true); remove.disabled = false; } };
    actions.append(edit, remove); row.append(img, info, actions); $('admin-products').append(row);
  }
}
let orders = [], orderTab = 'in_process';
const statusNames = { in_process: 'In Process', delivered: 'Delivered', rejected: 'Rejected' };
const paymentNames = { paid: 'Paid online', awaiting_payment: 'Online payment pending', whatsapp_pending: 'WhatsApp order (payment as arranged with the store)' };
const paymentShort = { paid: 'Paid', awaiting_payment: 'Awaiting payment', whatsapp_pending: 'WhatsApp', creating: 'Incomplete', failed: 'Failed' };
// Customers type phone numbers freely; WhatsApp needs digits with the country code (India by default).
function whatsappNumber(phone) {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return '91' + digits;
  if (digits.length === 11 && digits.startsWith('0')) return '91' + digits.slice(1);
  return digits.length >= 11 && digits.length <= 15 ? digits : '';
}
function invoiceMessage(o) {
  return [`Hello ${o.customer.name}, thank you for shopping with Let Us Be Your Health Partner!`, 'Your order has been delivered. Here is your invoice.', '',
    `*Invoice ${o.number}*`, 'Issued by: Aranya Global, Kolkata - 700079', `Date: ${new Date(o.created).toLocaleDateString('en-IN')}`, `Order: ${o.id}`, '',
    ...o.lines.map(l => `${l.name} (${l.unit}) × ${l.quantity} = ${money(l.total)}`), '',
    `Subtotal: ${money(o.subtotal)}`, `Delivery: ${o.delivery ? money(o.delivery) : 'Free'}`, `*Total: ${money(o.total)}*`, `Payment: ${paymentNames[o.state] || o.state.replaceAll('_', ' ')}`, '',
    `Delivered to: ${o.customer.address}`, '', 'We hope to serve you again soon!'].join('\n');
}
async function loadOrders() { orders = await api('/api/admin/orders'); renderOrders(); }
function renderOrders() {
  $('orders').replaceChildren();
  for (const tab of document.querySelectorAll('.order-tabs [role=tab]')) {
    const selected = tab.dataset.status === orderTab;
    tab.setAttribute('aria-selected', selected); tab.tabIndex = selected ? 0 : -1;
    tab.querySelector('span').textContent = orders.filter(o => o.fulfillment === tab.dataset.status).length;
  }
  $('orders').setAttribute('aria-labelledby', 'tab-' + orderTab);
  const shown = orders.filter(o => o.fulfillment === orderTab);
  if (!shown.length) { $('orders').append(el('p', 'empty', `No ${statusNames[orderTab].toLowerCase()} orders.`)); return; }
  const sheet = el('div', 'orders-sheet'), table = el('table', 'orders-table'), thead = el('thead'), head = el('tr'), tbody = el('tbody');
  for (const title of ['#', 'Date', 'Invoice no.', 'Customer', 'Phone', 'Items', 'Total', 'Payment', 'Status', 'Invoice']) { const th = el('th', title === 'Total' ? 'num' : '', title); th.scope = 'col'; head.append(th); }
  thead.append(head);
  shown.forEach((o, index) => {
    const row = el('tr'), completed = !['creating', 'failed'].includes(o.state), created = new Date(o.created);
    const when = el('td', 'nowrap'); when.append(el('strong', '', created.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })), el('small', '', created.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })));
    const customer = el('td', 'customer-cell'); customer.title = o.customer.address; customer.append(el('strong', '', o.customer.name), el('small', '', o.customer.address));
    const phone = el('td', 'nowrap'), call = el('a', '', o.customer.phone); call.href = 'tel:' + o.customer.phone.replace(/[^\d+]/g, ''); phone.append(call);
    const items = el('td', 'items-cell', o.lines.map(l => `${l.name} × ${l.quantity}`).join(', '));
    items.title = o.lines.map(l => `${l.name} (${l.unit}) × ${l.quantity} — ${money(l.total)}`).concat(`Delivery: ${o.delivery ? money(o.delivery) : 'Free'}`).join('\n');
    const payment = el('td'); payment.append(el('span', `pill ${o.state}`, paymentShort[o.state] || o.state.replaceAll('_', ' ')));
    const select = el('select', 'status-select'); select.setAttribute('aria-label', `Order status for ${o.customer.name}`);
    for (const [value, text] of Object.entries(statusNames)) { const option = el('option', '', text); option.value = value; select.append(option); }
    select.value = o.fulfillment;
    select.onchange = async () => {
      select.disabled = true; status('Saving…');
      try { await api('/api/admin/orders/' + o.id + '/status', 'PUT', { status: select.value }); o.fulfillment = select.value; renderOrders(); status(`Order for ${o.customer.name} moved to ${statusNames[o.fulfillment]}.`); }
      catch (e) { select.value = o.fulfillment; status(e.message, true); select.disabled = false; }
    };
    const statusCell = el('td'); statusCell.append(select);
    const actions = el('td', 'actions-cell');
    if (completed) { const pdf = el('a', 'sheet-link', 'PDF'); pdf.href = `/api/admin/orders/${encodeURIComponent(o.id)}/invoice.pdf`; pdf.target = '_blank'; pdf.rel = 'noopener'; pdf.title = 'View or download the invoice PDF'; actions.append(pdf); }
    if (completed && o.fulfillment === 'delivered') {
      const number = whatsappNumber(o.customer.phone);
      if (number) { const send = el('a', 'sheet-link whatsapp', 'WhatsApp'); send.href = `https://wa.me/${number}?text=${encodeURIComponent(invoiceMessage(o))}`; send.target = '_blank'; send.rel = 'noopener noreferrer'; send.title = 'Send the invoice to the customer on WhatsApp'; actions.append(send); }
      else actions.append(el('small', '', 'Invalid phone for WhatsApp'));
    }
    if (!actions.children.length) actions.append(el('small', '', '—'));
    row.append(el('td', 'muted', String(index + 1)), when, el('td', 'nowrap mono', o.number || '—'), customer, phone, items, el('td', 'num nowrap', money(o.total)), payment, statusCell, actions);
    tbody.append(row);
  });
  table.append(thead, tbody); sheet.append(table); $('orders').append(sheet);
}
for (const tab of document.querySelectorAll('.order-tabs [role=tab]')) {
  tab.onclick = () => { orderTab = tab.dataset.status; status(''); renderOrders(); };
  tab.onkeydown = e => {
    const tabs = [...document.querySelectorAll('.order-tabs [role=tab]')], i = tabs.indexOf(tab);
    const next = { ArrowRight: tabs[(i + 1) % tabs.length], ArrowLeft: tabs[(i + tabs.length - 1) % tabs.length] }[e.key];
    if (next) { e.preventDefault(); next.click(); next.focus(); }
  };
}
const ordersPage = location.pathname === '/admin/orders';
document.querySelector('.admin-layout').hidden = ordersPage;
document.querySelector('.admin-orders').hidden = !ordersPage;
if (ordersPage) { document.querySelector('.admin-top h1').textContent = 'Manage your orders.'; document.title = 'Orders | Store Admin'; }
async function dashboard() { $('login-section').hidden = true; $('dashboard').hidden = false; if (ordersPage) await loadOrders(); else await loadProducts(); }
$('login-form').onsubmit = async e => { e.preventDefault(); $('login-button').disabled = true; $('login-status').textContent = ''; try { await api('/api/admin/login', 'POST', Object.fromEntries(new FormData(e.target))); e.target.reset(); await dashboard(); } catch (err) { $('login-status').textContent = err.message; } finally { $('login-button').disabled = false; } };
$('logout').onclick = async () => { try { await api('/api/admin/logout', 'POST'); $('dashboard').hidden = true; $('login-section').hidden = false; $('orders').replaceChildren(); reset(); } catch (e) { status(e.message, true); } };
$('reset-product').onclick = reset;
$('refresh-orders').onclick = async () => { try { await loadOrders(); status('Orders refreshed.'); } catch (e) { status(e.message, true); } };
$('image-file').onchange = () => { const file = $('image-file').files[0]; if (previewUrl) URL.revokeObjectURL(previewUrl); previewUrl = ''; if (!file) { $('image-preview').hidden = !currentImage; if (currentImage) $('image-preview').src = currentImage; return; } if (file.size > 3 * 1024 * 1024 || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { status('Choose a JPG, PNG or WebP image smaller than 3 MB.', true); $('image-file').value = ''; return; } previewUrl = URL.createObjectURL(file); $('image-preview').src = previewUrl; $('image-preview').hidden = false; };
$('video-file').onchange = () => {
  const file = $('video-file').files[0];
  if (videoPreviewUrl) URL.revokeObjectURL(videoPreviewUrl);
  videoPreviewUrl = '';
  if (file && (!['video/mp4', 'video/webm'].includes(file.type) || file.size > 30 * 1024 * 1024)) { $('video-file').value = ''; status('Choose an MP4 or WebM video up to 30 MB.', true); }
  const valid = $('video-file').files[0];
  if (valid) { videoPreviewUrl = URL.createObjectURL(valid); $('remove-video').checked = false; }
  $('video-preview').src = videoPreviewUrl || currentVideo;
  $('video-preview').hidden = !(videoPreviewUrl || currentVideo);
};
form.onsubmit = async e => {
  e.preventDefault(); $('save-product').disabled = true; status('Saving product…');
  try {
    const values = Object.fromEntries(new FormData(form)); const file = $('image-file').files[0];
    const price = Math.round(Number(values.price) * 100), mrp = Math.round(Number(values.mrp) * 100);
    if (mrp < price) throw new Error('MRP must be at least the selling price.');
    if (file) { const response = await fetch('/api/admin/upload', { method: 'POST', headers: { 'Content-Type': file.type }, body: file }); const result = await response.json(); if (!response.ok) throw new Error(result.error); currentImage = result.image; }
    if ($('remove-video').checked) currentVideo = '';
    const videoFile = $('video-file').files[0];
    if (videoFile) { const response = await fetch('/api/admin/upload', { method: 'POST', headers: { 'Content-Type': videoFile.type }, body: videoFile }); const result = await response.json(); if (!response.ok) throw new Error(result.error); currentVideo = result.url; }
    if (!currentImage && !currentVideo) throw new Error('Please upload a photograph or video.');
    const id = values.id; await api(`/api/admin/products${id ? '/' + id : ''}`, id ? 'PUT' : 'POST', { name: values.name, description: values.description, category: values.category, unit: values.unit, price, mrp, available: form.elements.available.checked, image: currentImage, video: currentVideo });
    reset(); await loadProducts(); status('Product saved. It is now updated on the storefront.');
  } catch (e) { status(e.message, true); } finally { $('save-product').disabled = false; }
};
api('/api/admin/session').then(dashboard).catch(e => { if (!e.message.includes('sign in')) $('login-status').textContent = e.message; });
