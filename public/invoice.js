const $ = id => document.getElementById(id);
const money = n => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(n / 100);
const make = (tag, className, text) => { const el = document.createElement(tag); if (className) el.className = className; if (text !== undefined) el.textContent = text; return el; };
const id = location.pathname.split('/')[2];
const payment = { paid: 'Paid online', awaiting_payment: 'Online payment pending', whatsapp_pending: 'To be paid on confirmation (WhatsApp order)' };
const fulfillment = { in_process: 'In process', delivered: 'Delivered', rejected: 'Rejected' };
async function load() {
  const response = await fetch('/api/admin/orders/' + encodeURIComponent(id) + '/invoice');
  const result = await response.json();
  if (!response.ok) throw new Error(response.status === 401 ? 'Sign in to the store admin to view this invoice.' : result.error || 'Invoice could not be loaded.');
  return result;
}
function render(o) {
  document.title = `Invoice ${o.number} | Health Partner`;
  $('invoice-number').textContent = o.number;
  $('invoice-date').textContent = new Date(o.created).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
  $('store-details').textContent = [o.store.name, o.store.phone, o.store.website].filter(Boolean).join('\n');
  $('customer-details').textContent = [o.customer.name, o.customer.phone, o.customer.address].join('\n');
  $('payment-details').textContent = [payment[o.state] || o.state.replaceAll('_', ' '), o.paymentId ? `Payment ID: ${o.paymentId}` : '', `Order status: ${fulfillment[o.fulfillment] || o.fulfillment}`].filter(Boolean).join('\n');
  $('order-ref').textContent = o.id;
  for (const l of o.lines) {
    const row = make('tr');
    row.append(make('td', '', l.name), make('td', '', l.unit), make('td', 'num', money(l.price)), make('td', 'num', l.quantity), make('td', 'num', money(l.total)));
    $('invoice-lines').append(row);
  }
  for (const [name, value, cls] of [['Subtotal', o.subtotal], ['Delivery', o.delivery], ['Total', o.total, 'grand']]) {
    const row = make('tr', cls || ''), label = make('th', 'num', name);
    label.scope = 'row'; label.colSpan = 4;
    row.append(label, make('td', 'num', value ? money(value) : name === 'Delivery' ? 'Free' : money(0)));
    $('invoice-totals').append(row);
  }
  $('invoice-status').hidden = true; $('invoice').hidden = false;
}
$('print').onclick = () => print();
load().then(render).catch(e => { $('invoice-status').textContent = e.message; $('invoice-status').classList.add('error'); });
