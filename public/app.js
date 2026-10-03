const $ = id => document.getElementById(id);
const money = n => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(n / 100);
const make = (tag, className, text) => { const el = document.createElement(tag); if (className) el.className = className; if (text !== undefined) el.textContent = text; return el; };
let products = [], config, category = 'All', busy = false, checkoutToken = null, checkoutMethod = null;
let cart = {};
try { const saved = JSON.parse(localStorage.getItem('hp-cart') || '{}'); if (saved && typeof saved === 'object' && !Array.isArray(saved)) for (const [id, qty] of Object.entries(saved)) if (Number.isInteger(qty) && qty > 0 && qty <= 50) cart[id] = qty; } catch {}
let pending; try { pending = JSON.parse(localStorage.getItem('hp-pending') || 'null'); } catch {}
async function api(url, data) { const response = await fetch(url, data ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) } : {}); const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Request failed.'); return result; }
function save() { try { localStorage.setItem('hp-cart', JSON.stringify(cart)); } catch {} $('cart-count').textContent = Object.values(cart).reduce((s, q) => s + q, 0); }
let toastTimer;
function toast(text) { $('toast').textContent = text; $('toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').hidden = true, 2600); }
function change(id, delta) { cart[id] = Math.max(0, Math.min(50, (cart[id] || 0) + delta)); if (!cart[id]) delete cart[id]; checkoutToken = null; save(); renderCart(); }
function renderProducts() {
  const query = $('search').value.toLowerCase().trim();
  const shown = products.filter(p => (category === 'All' || p.category === category) && `${p.name} ${p.description}`.toLowerCase().includes(query));
  $('products').replaceChildren(); $('product-count').textContent = `${shown.length} fresh picks`;
  for (const p of shown) {
    const card = make('article', 'product'), art = make('div', 'product-image'), cover = make('a', 'product-cover'), img = make(p.image ? 'img' : 'video');
    const detailsUrl = '/products/' + encodeURIComponent(p.id);
    cover.href = detailsUrl; cover.setAttribute('aria-label', 'View ' + p.name + ' details');
    img.src = p.image || p.video; if (!p.image) { img.muted = true; img.preload = 'metadata'; img.playsInline = true; } img.alt = p.name; img.loading = 'lazy';
    cover.append(img); art.append(cover);
    if (p.video) {
      const player = p.image ? make('video') : img;
      player.className = 'product-player'; player.muted = true; player.defaultMuted = true;
      player.setAttribute('muted', ''); player.playsInline = true; player.setAttribute('playsinline', '');
      player.preload = 'metadata'; player.src = p.video;
      player.setAttribute('aria-label', p.name + ' video');
      if (p.image) { player.poster = p.image; player.hidden = true; art.append(player); }
      const watch = make('button', 'video-badge', '▶ Watch video');
      watch.type = 'button'; watch.setAttribute('aria-label', 'Play video of ' + p.name);
      watch.onclick = () => {
        for (const other of document.querySelectorAll('.product-player')) if (other !== player) { other.autoplay = false; other.pause(); }
        // Keep playback inside the click gesture and reuse the already loaded video.
        player.hidden = false; player.controls = true; player.muted = true; player.autoplay = true;
        art.replaceChildren(player); player.focus();
        player.play().catch(err => {
          if (err.name === 'AbortError') return;
          toast('Video could not start. Check your connection or try an MP4 with H.264 video.');
        });
      };
      art.append(watch);
    }
    if (p.mrp > p.price) art.append(make('span', 'discount', `${Math.round((1 - p.price / p.mrp) * 100)}% OFF`));
    const content = make('div', 'product-content'), bottom = make('div', 'product-bottom'), price = make('div', 'price', money(p.price));
    if (p.mrp > p.price) price.append(make('del', '', money(p.mrp)));
    const button = make('button', 'add-button', p.available ? 'Add to cart +' : 'Unavailable'); button.disabled = !p.available; button.setAttribute('aria-label', `Add ${p.name} to cart`);
    button.onclick = () => { change(p.id, 1); toast(`${p.name} added to your basket`); };
    const heading = make('h3'), titleLink = make('a', 'product-title-link', p.name); titleLink.href = detailsUrl; heading.append(titleLink);
    const detailsLink = make('a', 'product-details-link', 'View details & reviews →'); detailsLink.href = detailsUrl;
    const reviewSummary = make('a', 'card-rating', p.reviewCount ? `★ ${Number(p.averageRating).toFixed(1)} / 5 · ${p.reviewCount} review${p.reviewCount === 1 ? '' : 's'}` : '☆ No reviews yet');
    reviewSummary.href = detailsUrl + '#reviews';
    const reviewPreview = make('div', 'card-review');
    if (p.latestReview) {
      const comment = p.latestReview.comment;
      reviewPreview.append(make('p', '', '“' + (comment.length > 140 ? comment.slice(0, 140) + '…' : comment) + '”'), make('small', '', `${p.latestReview.name} · ${p.latestReview.rating}/5 · Unverified purchase`));
    } else reviewPreview.hidden = true;
    bottom.append(price, button); content.append(make('div', 'product-meta', `${p.category} / ${p.unit}`), heading, reviewSummary, make('p', '', p.description.length > 160 ? p.description.slice(0, 160) + '…' : p.description), reviewPreview, detailsLink, bottom); card.append(art, content); $('products').append(card);
  }
  if (!shown.length) $('products').append(make('p', 'empty', 'No products found. Try another category or search.'));
}
function renderCart() {
  $('cart-items').replaceChildren(); let subtotal = 0;
  for (const [id, quantity] of Object.entries(cart)) {
    const p = products.find(p => p.id === id); if (!p) continue;
    subtotal += p.price * quantity;
    const row = make('div', 'cart-row'), img = make(p.image ? 'img' : 'video'); img.src = p.image || p.video; if (!p.image) { img.muted = true; img.preload = 'metadata'; } img.alt = '';
    const info = make('div', 'cart-info'); info.append(make('strong', '', p.name), make('small', '', `${p.unit} · ${money(p.price)}`));
    const qty = make('div', 'quantity'); const minus = make('button', '', '−'), plus = make('button', '', '+'); minus.setAttribute('aria-label', `Remove one ${p.name}`); plus.setAttribute('aria-label', `Add one ${p.name}`); minus.onclick = () => change(id, -1); plus.onclick = () => change(id, 1); plus.disabled = quantity >= 50;
    qty.append(minus, make('span', '', quantity), plus); row.append(img, info, qty); $('cart-items').append(row);
  }
  if (!subtotal) $('cart-items').append(make('p', 'empty', 'Your basket is waiting for something good.'));
  const delivery = !subtotal || subtotal >= config.freeAbove ? 0 : config.deliveryFee;
  $('totals').replaceChildren();
  for (const [name, value] of [['Subtotal', subtotal], ['Delivery', delivery], ['Total', subtotal + delivery]]) { const line = make('div', `summary-line${name === 'Total' ? ' grand' : ''}`); line.append(make('span', '', name), make('span', '', money(value))); $('totals').append(line); }
  $('checkout-form').hidden = !subtotal;
  $('pay-button').disabled = busy || !config.paymentEnabled;
  $('whatsapp-button').disabled = busy || !config.whatsappEnabled;
  $('check-payment').hidden = !pending;
  $('checkout-help').textContent = [config.paymentEnabled ? 'Online payments are processed by Razorpay.' : 'Online payment is not available yet.', config.whatsappEnabled ? 'WhatsApp orders need confirmation from the store.' : 'WhatsApp ordering is not available yet.'].join(' ');
}
function status(text, error = false) { $('checkout-status').textContent = text; $('checkout-status').classList.toggle('error', error); }
function keepPending(value) { pending = value; try { if (value) localStorage.setItem('hp-pending', JSON.stringify(value)); else localStorage.removeItem('hp-pending'); } catch {} $('check-payment').hidden = !value; if (!value) resumeButton.hidden = true; }
function paid(id) { const purchased = pending?.items || []; for (const item of purchased) { cart[item.id] = Math.max(0, (cart[item.id] || 0) - item.quantity); if (!cart[item.id]) delete cart[item.id]; } keepPending(null); checkoutToken = null; save(); renderCart(); status(`Payment confirmed. Thank you!\nYour order reference: ${id}`); }
let razorpayLoader;
const resumeButton = make('button', 'button secondary', 'Resume this payment');
resumeButton.hidden = true;
$('check-payment').after(resumeButton);
async function openPayment(order, customer) {
  await loadRazorpay();
  const token = pending.token;
  const checkout = new window.Razorpay({ key: order.key, amount: order.amount, currency: 'INR', name: 'Let Us Be Your Health Partner', description: 'Your fresh picks', order_id: order.gatewayOrderId, prefill: { name: customer.name, contact: customer.phone }, theme: { color: '#173c2d' }, handler: async response => {
    try { const result = await api('/api/payments/verify', { ...response, id: order.id, token }); paid(result.id); } catch (e) { status(`${e.message} Use “Check pending payment” before trying to pay again.`, true); }
    if (!$('cart-dialog').open) $('cart-dialog').showModal();
  }, modal: { ondismiss: () => { status('Payment window closed. Check the pending payment or resume the same order.'); if (!$('cart-dialog').open) $('cart-dialog').showModal(); } } });
  checkout.on('payment.failed', () => status('Payment did not complete. You can resume this order or check its payment status.', true));
  $('cart-dialog').close(); checkout.open(); status('Complete your payment in the secure payment window.');
}
resumeButton.onclick = async () => { if (!pending?.order) return; resumeButton.disabled = true; try { const result = await api('/api/payments/status', pending); if (result.state === 'paid') paid(result.id); else await openPayment(pending.order, pending.customer); } catch (e) { status(e.message, true); } finally { resumeButton.disabled = false; } };
function loadRazorpay() { if (window.Razorpay) return Promise.resolve(); if (!razorpayLoader) razorpayLoader = new Promise((resolve, reject) => { const script = document.createElement('script'); script.src = 'https://checkout.razorpay.com/v1/checkout.js'; script.onload = resolve; script.onerror = () => { razorpayLoader = null; script.remove(); reject(new Error('Could not load the payment window. Check your connection.')); }; document.head.append(script); }); return razorpayLoader; }
$('checkout-form').oninput = () => checkoutToken = null;
$('checkout-form').onsubmit = async event => {
  event.preventDefault(); if (busy) return;
  const method = event.submitter?.value; if (!method) return;
  if (checkoutMethod !== method) checkoutToken = null;
  checkoutMethod = method;
  if (method === 'razorpay' && pending) { status('You have a pending payment. Use “Check pending payment” before starting another checkout.', true); return; }
  busy = true; renderCart(); status('Preparing your order…'); $('whatsapp-link').hidden = true;
  try {
    if (method === 'razorpay') await loadRazorpay();
    const customer = Object.fromEntries(new FormData(event.target));
    const items = Object.entries(cart).map(([id, quantity]) => ({ id, quantity }));
    checkoutToken ||= crypto.randomUUID();
    const order = await api('/api/orders', { items, customer, method, token: checkoutToken });
    if (method === 'whatsapp') { $('whatsapp-link').href = order.whatsappUrl; $('whatsapp-link').hidden = false; status(`Your order summary is ready (${money(order.amount)}). Tap below to send it to the store. It has not been paid online.`); }
    else {
      keepPending({ id: order.id, token: checkoutToken, items, order, customer: { name: customer.name, phone: customer.phone } });
      await openPayment(order, customer);
    }
  } catch (e) { checkoutToken = null; status(e.message, true); }
  finally { busy = false; renderCart(); }
};
$('check-payment').onclick = async () => {
  if (!pending) return; $('check-payment').disabled = true; status('Checking payment…');
  try { const result = await api('/api/payments/status', pending); if (result.state === 'paid') paid(result.id); else { status('No captured payment yet. Resume this same order below. If money was debited, wait and check again or contact the store with order ' + pending.id + '.'); resumeButton.hidden = !pending.order; } } catch (e) { status(e.message, true); } finally { $('check-payment').disabled = false; }
};
$('open-cart').onclick = () => { if (!config) return; renderCart(); $('cart-dialog').showModal(); };
$('close-cart').onclick = () => $('cart-dialog').close();
$('cart-dialog').onclick = event => { if (event.target === $('cart-dialog')) { const r = event.target.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) event.target.close(); } };
$('search').oninput = renderProducts;
async function init() {
  try {
    [config, products] = await Promise.all([api('/api/config'), api('/api/products')]);
    for (const id of Object.keys(cart)) if (!products.some(p => p.id === id && p.available)) delete cart[id];
    $('demo-note').hidden = !config.demo; $('delivery-banner').textContent = config.deliveryFee === 0 ? 'Free delivery on every order' : `Free delivery from ${money(config.freeAbove)}`;
    for (const name of ['All', ...new Set(products.map(p => p.category))]) { const button = make('button', '', name); button.setAttribute('aria-pressed', name === category); button.onclick = () => { category = name; for (const sibling of $('categories').children) sibling.setAttribute('aria-pressed', sibling === button); renderProducts(); }; $('categories').append(button); }
    $('load-status').hidden = true; save(); renderProducts(); renderCart(); if (pending) toast('You have a pending payment. Open your basket to check it.');
  } catch (e) { $('load-status').textContent = `${e.message} Please refresh to try again.`; }
}
init();
