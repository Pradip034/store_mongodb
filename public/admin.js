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
async function loadOrders() {
  const orders = await api('/api/admin/orders'); $('orders').replaceChildren();
  if (!orders.length) $('orders').append(el('p', 'empty', 'Your orders will appear here.'));
  for (const o of orders) { const card = el('article', 'order-card'); card.append(el('h3', '', `${o.customer.name} · ${money(o.total)}`), el('span', `order-status ${o.state}`, o.state.replaceAll('_', ' ')), el('p', 'help', `${new Date(o.created).toLocaleString('en-IN')} · ${o.id}`), el('p', '', o.lines.map(l => `${l.name} (${l.unit}) × ${l.quantity} — ${money(l.total)}`).join('\n')), el('p', '', `Delivery: ${money(o.delivery)}`), el('p', '', `${o.customer.phone}\n${o.customer.address}`)); 
    const label = el('label', 'fulfillment-control', 'Order status'), select = el('select');
    for (const [value, text] of [['in_process', 'In Process'], ['delivered', 'Delivered'], ['rejected', 'Rejected']]) { const option = el('option', '', text); option.value = value; select.append(option); }
    select.value = o.fulfillment || 'in_process';
    const saved = el('p', 'help'); saved.setAttribute('role', 'status');
    select.onchange = async () => {
      select.disabled = true; saved.textContent = 'Saving…';
      try { await api('/api/admin/orders/' + o.id + '/status', 'PUT', { status: select.value }); o.fulfillment = select.value; saved.textContent = 'Saved: ' + select.selectedOptions[0].textContent; }
      catch (e) { select.value = o.fulfillment || 'in_process'; saved.textContent = e.message; }
      finally { select.disabled = false; }
    };
    label.append(select); card.append(label, saved); $('orders').append(card); }
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
