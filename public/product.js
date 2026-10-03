const $ = id => document.getElementById(id);
const make = (tag, text) => { const e = document.createElement(tag); if (text !== undefined) e.textContent = text; return e; };
const id = location.pathname.split('/')[2];
const endpoint = '/api/products/' + encodeURIComponent(id) + '/reviews';
async function api(url, data) {
  const res = await fetch(url, data ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) } : {});
  const result = await res.json(); if (!res.ok) throw new Error(result.error || 'Unable to load data.'); return result;
}
function reviews(data) {
  $('rating-summary').textContent = data.count ? `★ ${data.average.toFixed(1)} / 5 · ${data.count} review${data.count === 1 ? '' : 's'}` : 'No reviews yet';
  $('review-list').replaceChildren();
  if (!data.count) $('review-list').append(make('p', 'No reviews yet. Be the first to share your experience.'));
  for (const r of data.reviews) {
    const card = make('article'); card.className = 'review-card';
    card.append(make('strong', r.name), make('p', '★'.repeat(r.rating) + '☆'.repeat(5 - r.rating) + ' · ' + new Date(r.created).toLocaleDateString()), make('p', r.comment));
    $('review-list').append(card);
  }
}
$('review-form').onsubmit = async e => {
  e.preventDefault(); $('submit-review').disabled = true; $('review-status').textContent = 'Submitting…';
  try { const data = Object.fromEntries(new FormData(e.target)); data.rating = Number(data.rating); reviews(await api(endpoint, data)); e.target.reset(); $('review-status').textContent = 'Thank you! Your review has been published.'; }
  catch (err) { $('review-status').textContent = err.message; }
  finally { $('submit-review').disabled = false; }
};
async function init() {
  try {
    const products = await api('/api/products'), p = products.find(p => p.id === id);
    if (!p) throw new Error('This product is no longer available.');
    document.title = p.name + ' | Health Partner'; $('name').textContent = p.name; $('meta').textContent = `${p.category} / ${p.unit}`;
    const money = n => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(n / 100);
    $('price').textContent = money(p.price); if (p.mrp > p.price) $('price').append(make('del', money(p.mrp)));
    $('description').textContent = p.description;
    if (p.image) { const img = make('img'); img.src = p.image; img.alt = p.name; $('gallery').append(img); }
    if (p.video) { const video = make('video'); video.src = p.video; video.controls = true; video.playsInline = true; video.preload = 'metadata'; if (p.image) video.poster = p.image; video.setAttribute('aria-label', p.name + ' product video'); $('gallery').append(video); }
    $('add').disabled = !p.available; $('add').textContent = p.available ? 'Add to cart +' : 'Currently unavailable';
    $('add').onclick = () => {
      try {
        let saved = {}; try { saved = JSON.parse(localStorage.getItem('hp-cart') || '{}'); } catch {}
        if (!saved || typeof saved !== 'object' || Array.isArray(saved)) saved = {};
        const quantity = Number.isInteger(saved[id]) && saved[id] > 0 ? saved[id] : 0;
        saved[id] = Math.min(50, quantity + 1); localStorage.setItem('hp-cart', JSON.stringify(saved));
        $('cart-status').textContent = quantity >= 50 ? 'Maximum 50 units per product.' : 'Added to your basket. Return to the store to checkout.';
      } catch { $('cart-status').textContent = 'Your browser could not save the basket. Please enable site storage.'; }
    };
    $('detail').hidden = false; $('page-status').hidden = true;
    try { reviews(await api(endpoint)); } catch (err) { $('review-status').textContent = err.message; }
  } catch (err) { $('page-status').textContent = err.message; }
}
init();
