(() => {
  'use strict';

  const CFG = window.STORE_CONFIG || {};
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = (n) => (CFG.CURRENCY_SYMBOL || '₹') + Number(n).toLocaleString('en-IN');
  const isSet = (v) => v && !/^PASTE/.test(v);

  const configured = isSet(CFG.SUPABASE_URL) && isSet(CFG.SUPABASE_ANON_KEY);
  const sb = configured ? window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY) : null;
  const waNumber = isSet(CFG.WHATSAPP_NUMBER) && /^\d{10,15}$/.test(CFG.WHATSAPP_NUMBER) ? CFG.WHATSAPP_NUMBER : '';
  const rzpKey = CFG.RAZORPAY_KEY_ID || '';

  let products = [];
  let filter = 'All';
  let view = 'bag'; // bag | checkout | done
  let doneInfo = null;
  let cart = [];
  try { cart = JSON.parse(localStorage.getItem('cl_cart') || '[]'); } catch { cart = []; }

  const saveCart = () => { try { localStorage.setItem('cl_cart', JSON.stringify(cart)); } catch { /* storage blocked */ } };
  const sizesOf = (p) => (p.sizes || '').split(',').map((s) => s.trim()).filter(Boolean);
  const soldOut = (p) => p.stock !== null && p.stock !== undefined && Number(p.stock) <= 0;
  const maxQty = (p) => (p.stock === null || p.stock === undefined ? 99 : Math.max(0, Number(p.stock)));

  /* ---------- Page setup ---------- */
  const name = CFG.STORE_NAME || 'Cocoa Luxury';
  document.title = name;
  $('#brandName').textContent = name;
  $('#heroName').textContent = name;
  $('#tagline').textContent = CFG.TAGLINE || '';
  $('#copy').textContent = `© ${new Date().getFullYear()} ${name}`;
  if (CFG.INSTAGRAM_URL) $('#igLink').href = CFG.INSTAGRAM_URL; else $('#igLink').hidden = true;

  function showNotice(text) { $('#notice').innerHTML = `<p class="notice">${esc(text)}</p>`; }

  /* ---------- Products ---------- */
  async function loadProducts() {
    if (!sb) {
      showNotice('The store is not connected yet. Add your Supabase details in config.js.');
      return;
    }
    const { data, error } = await sb.from('products').select('*').eq('active', true).order('created_at', { ascending: false });
    if (error) {
      showNotice('Products could not be loaded. Refresh the page to try again.');
      return;
    }
    products = (data || []).map((p) => ({ ...p, price: Number(p.price), images: p.images || [] }));
    reconcileCart();
    renderFilters();
    renderGrid();
    renderCart();
  }

  function renderFilters() {
    const cats = ['All', ...new Set(products.map((p) => p.category).filter(Boolean))];
    if (!cats.includes(filter)) filter = 'All';
    $('#filters').innerHTML = cats.length > 2
      ? cats.map((c) => `<button type="button" class="chip" data-cat="${esc(c)}" aria-pressed="${c === filter}">${esc(c)}</button>`).join('')
      : '';
  }

  function renderGrid() {
    const list = filter === 'All' ? products : products.filter((p) => p.category === filter);
    $('#grid').innerHTML = list.length
      ? list.map((p) => {
          const img = p.images[0];
          return `<button type="button" class="card" data-id="${esc(p.id)}">
            <span class="card-img">${img ? `<img src="${esc(img)}" alt="${esc(p.name)}" loading="lazy">` : ''}${soldOut(p) ? '<span class="tag">Sold out</span>' : ''}</span>
            <span class="card-name">${esc(p.name)}</span>
            <span class="card-meta"><span>${esc(p.category)}</span><span class="price">${money(p.price)}</span></span>
          </button>`;
        }).join('')
      : '<p class="empty">New pieces are on the way. Check back soon.</p>';
  }

  $('#filters').addEventListener('click', (e) => {
    const b = e.target.closest('.chip');
    if (!b) return;
    filter = b.dataset.cat;
    renderFilters();
    renderGrid();
  });
  $('#grid').addEventListener('click', (e) => {
    const c = e.target.closest('.card');
    if (c) openProduct(c.dataset.id);
  });

  /* ---------- Product dialog ---------- */
  function openProduct(id) {
    const p = products.find((x) => x.id === id);
    if (!p) return;
    const sizes = sizesOf(p);
    let size = sizes.length === 1 ? sizes[0] : '';
    const dlg = $('#productDlg');
    const gone = soldOut(p);

    dlg.innerHTML = `
      <button class="x" type="button" data-act="close" aria-label="Close">&times;</button>
      <div class="pd">
        <div>
          ${p.images[0] ? `<img class="main" id="pdMain" src="${esc(p.images[0])}" alt="${esc(p.name)}">` : '<div class="main"></div>'}
          ${p.images.length > 1 ? `<div class="thumbs">${p.images.map((u, i) => `<button type="button" data-i="${i}" aria-label="Photo ${i + 1}" ${i === 0 ? 'aria-current="true"' : ''}><img src="${esc(u)}" alt=""></button>`).join('')}</div>` : ''}
        </div>
        <div class="pd-info">
          <h2>${esc(p.name)}</h2>
          <p class="pd-price">${money(p.price)}</p>
          ${p.description ? `<p class="pd-desc">${esc(p.description)}</p>` : ''}
          ${sizes.length ? `<div><p class="muted" style="margin-bottom:.5rem">Size</p><div class="sizes" role="group" aria-label="Choose a size">${sizes.map((s) => `<button type="button" class="size" data-size="${esc(s)}" aria-pressed="${s === size}">${esc(s)}</button>`).join('')}</div></div>` : ''}
          <p class="msg" id="pdMsg" role="alert"></p>
          <button class="btn btn-gold" type="button" data-act="add" ${gone ? 'disabled' : ''}>${gone ? 'Sold out' : 'Add to bag'}</button>
        </div>
      </div>`;

    dlg.onclick = (e) => {
      if (e.target === dlg) return dlg.close();
      const t = e.target.closest('button');
      if (!t) return;
      if (t.dataset.act === 'close') dlg.close();
      if (t.closest('.thumbs')) {
        $('#pdMain').src = p.images[Number(t.dataset.i)];
        dlg.querySelectorAll('.thumbs button').forEach((b) => b.removeAttribute('aria-current'));
        t.setAttribute('aria-current', 'true');
      }
      if (t.classList.contains('size')) {
        size = t.dataset.size;
        dlg.querySelectorAll('.size').forEach((b) => b.setAttribute('aria-pressed', String(b === t)));
        $('#pdMsg').textContent = '';
      }
      if (t.dataset.act === 'add') {
        if (sizes.length && !size) { $('#pdMsg').textContent = 'Choose a size first.'; return; }
        addToCart(p.id, size);
        dlg.close();
        openCart();
      }
    };
    dlg.showModal();
  }

  /* ---------- Bag ---------- */
  function reconcileCart() {
    cart = cart
      .filter((l) => products.some((p) => p.id === l.id))
      .map((l) => {
        const p = products.find((x) => x.id === l.id);
        return { ...l, qty: Math.min(l.qty, maxQty(p)) };
      })
      .filter((l) => l.qty > 0);
    saveCart();
  }
  const cartLines = () => cart.map((l) => ({ ...l, p: products.find((p) => p.id === l.id) })).filter((l) => l.p);
  const cartTotal = () => cartLines().reduce((s, l) => s + l.p.price * l.qty, 0);

  function addToCart(id, size) {
    const p = products.find((x) => x.id === id);
    if (!p) return;
    const line = cart.find((l) => l.id === id && l.size === size);
    if (line) line.qty = Math.min(line.qty + 1, maxQty(p));
    else cart.push({ id, size, qty: 1 });
    saveCart();
    view = 'bag';
    renderCart();
  }

  function openCart() { renderCart(); $('#cartDlg').showModal(); }
  $('#openCart').addEventListener('click', openCart);
  $('#closeCart').addEventListener('click', () => $('#cartDlg').close());
  $('#cartDlg').addEventListener('click', (e) => { if (e.target === $('#cartDlg')) $('#cartDlg').close(); });

  function renderCart() {
    const lines = cartLines();
    $('#cartCount').textContent = lines.reduce((s, l) => s + l.qty, 0);
    const body = $('#cartBody');

    if (view === 'done' && doneInfo) return renderDone(body);
    if (!lines.length) {
      view = 'bag';
      body.innerHTML = '<div class="cart-empty"><p>Your bag is empty.</p><button class="btn" type="button" data-act="close">Keep shopping</button></div>';
      return;
    }
    if (view === 'checkout') return renderCheckout(body);

    body.innerHTML = `
      <ul class="lines">${lines.map((l) => `
        <li class="line">
          ${l.p.images[0] ? `<img src="${esc(l.p.images[0])}" alt="">` : '<div></div>'}
          <div>
            <p class="line-name">${esc(l.p.name)}</p>
            <p class="muted">${l.size ? `Size ${esc(l.size)} · ` : ''}${money(l.p.price)}</p>
            <div class="qty">
              <button type="button" data-act="dec" data-id="${esc(l.id)}" data-size="${esc(l.size)}" aria-label="Decrease quantity">&minus;</button>
              <span>${l.qty}</span>
              <button type="button" data-act="inc" data-id="${esc(l.id)}" data-size="${esc(l.size)}" aria-label="Increase quantity">+</button>
            </div>
          </div>
          <button class="link" type="button" data-act="remove" data-id="${esc(l.id)}" data-size="${esc(l.size)}">Remove</button>
        </li>`).join('')}
      </ul>
      <p class="total"><span>Total</span><strong>${money(cartTotal())}</strong></p>
      <button class="btn btn-gold" type="button" data-act="checkout">Checkout</button>`;
  }

  function renderCheckout(body) {
    const canPay = !!rzpKey;
    body.innerHTML = `
      <button class="link" type="button" data-act="back" style="align-self:flex-start;margin-bottom:1rem">Back to bag</button>
      <h3 style="font-size:1.7rem;margin-bottom:1.2rem">Delivery details</h3>
      <form id="checkoutForm">
        <div class="field"><label for="cName">Full name</label><input id="cName" required autocomplete="name" maxlength="80"></div>
        <div class="field"><label for="cPhone">Phone number</label><input id="cPhone" type="tel" inputmode="tel" required autocomplete="tel" maxlength="20"></div>
        <div class="field"><label for="cAddr">Delivery address</label><textarea id="cAddr" required autocomplete="street-address" maxlength="400" placeholder="House, street, city, PIN code"></textarea></div>
        <p class="total"><span>Total</span><strong>${money(cartTotal())}</strong></p>
        <div class="stack">
          ${canPay ? `<button class="btn btn-gold" type="submit" value="razorpay">Pay ${money(cartTotal())} online</button>` : ''}
          ${waNumber ? `<button class="btn ${canPay ? '' : 'btn-gold'}" type="submit" value="whatsapp">Order on WhatsApp</button>` : ''}
          ${!canPay && !waNumber ? '<p class="msg">Ordering is not set up yet. Add a WhatsApp number in config.js.</p>' : ''}
        </div>
        <p class="msg" id="formMsg" role="alert" style="margin-top:.8rem"></p>
      </form>`;
  }

  function renderDone(body) {
    const d = doneInfo;
    const lead = d.paid ? 'Payment received' : 'Almost done';
    const text = d.paid
      ? d.saved
        ? `Your order #${d.short} is placed. We will contact you to confirm delivery.`
        : `Your payment went through, but we could not save the order automatically. Send the details on WhatsApp so we can confirm it. Payment ID: ${d.paymentId}`
      : d.saved
        ? `Order #${d.short} is saved. Send it on WhatsApp so we can confirm the details with you.`
        : 'We could not save your order. Send it on WhatsApp instead.';
    body.innerHTML = `<div class="done">
      <h3>${esc(lead)}</h3>
      <p>${esc(text)}</p>
      <div class="stack">
        ${waNumber ? `<a class="btn btn-gold" href="${esc(d.waUrl)}" target="_blank" rel="noopener">${d.paid ? 'Message us on WhatsApp' : 'Send order on WhatsApp'}</a>` : ''}
        <button class="btn" type="button" data-act="close">Keep shopping</button>
      </div>
    </div>`;
  }

  $('#cartBody').addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    const find = () => cart.find((l) => l.id === b.dataset.id && l.size === b.dataset.size);
    if (act === 'close') { if (view === 'done') view = 'bag'; $('#cartDlg').close(); return renderCart(); }
    if (act === 'checkout') { view = 'checkout'; return renderCart(); }
    if (act === 'back') { view = 'bag'; return renderCart(); }
    const line = find();
    if (!line) return;
    const p = products.find((x) => x.id === line.id);
    if (act === 'inc') line.qty = Math.min(line.qty + 1, maxQty(p));
    if (act === 'dec') line.qty = Math.max(line.qty - 1, 0);
    if (act === 'remove') line.qty = 0;
    cart = cart.filter((l) => l.qty > 0);
    saveCart();
    renderCart();
  });

  $('#cartBody').addEventListener('submit', (e) => {
    if (e.target.id !== 'checkoutForm') return;
    e.preventDefault();
    placeOrder(e.submitter ? e.submitter.value : 'whatsapp', e.target);
  });

  /* ---------- Checkout ---------- */
  function buildWhatsAppUrl(o) {
    const lines = o.items.map((i) => `${i.qty} x ${i.name}${i.size ? ` (${i.size})` : ''} - ${money(i.price * i.qty)}`);
    const pay = o.method === 'razorpay'
      ? `Paid online (payment ID ${o.paymentId || 'pending'})`
      : 'Payment to be confirmed here';
    const msg = [
      `New order #${o.short}`,
      ...lines,
      `Total: ${money(o.total)}`,
      `Payment: ${pay}`,
      '',
      `Name: ${o.customer}`,
      `Phone: ${o.phone}`,
      `Address: ${o.address}`
    ].join('\n');
    return `https://wa.me/${waNumber}?text=${encodeURIComponent(msg)}`;
  }

  async function placeOrder(method, form) {
    const msgEl = $('#formMsg');
    msgEl.textContent = '';
    const customer = $('#cName').value.trim();
    const phone = $('#cPhone').value.trim();
    const address = $('#cAddr').value.trim();
    if (phone.replace(/\D/g, '').length < 10) { msgEl.textContent = 'Enter a phone number with at least 10 digits.'; return; }

    const lines = cartLines();
    if (!lines.length) return;
    const items = lines.map((l) => ({ id: l.id, name: l.p.name, size: l.size || null, qty: l.qty, price: l.p.price }));
    const total = items.reduce((s, i) => s + i.price * i.qty, 0);
    const orderId = crypto.randomUUID();
    const short = orderId.slice(0, 6).toUpperCase();
    const base = { items, total, method, customer, phone, address, short };

    const setBusy = (on) => form.querySelectorAll('button[type=submit]').forEach((b) => { b.disabled = on; });
    const saveOrder = async (paymentId) => {
      const { error } = await sb.from('orders').insert({
        id: orderId, customer_name: customer, phone, address, items, total,
        payment_method: method, payment_id: paymentId || null, status: 'new'
      });
      return !error;
    };
    const finish = (saved, paid, paymentId) => {
      if (saved || paid) { cart = []; saveCart(); }
      doneInfo = { short, saved, paid, paymentId, waUrl: waNumber ? buildWhatsAppUrl({ ...base, paymentId }) : '' };
      view = 'done';
      renderCart();
    };

    setBusy(true);
    if (method === 'razorpay') {
      if (typeof window.Razorpay === 'undefined') {
        msgEl.textContent = 'Online payment did not load. Check your connection or order on WhatsApp.';
        return setBusy(false);
      }
      const rzp = new window.Razorpay({
        key: rzpKey,
        amount: Math.round(total * 100),
        currency: 'INR',
        name,
        description: `Order #${short}`,
        prefill: { name: customer, contact: phone },
        theme: { color: '#c8a45c' },
        handler: async (res) => finish(await saveOrder(res.razorpay_payment_id), true, res.razorpay_payment_id),
        modal: { ondismiss: () => setBusy(false) }
      });
      rzp.on('payment.failed', () => { msgEl.textContent = 'Payment failed. Try again or order on WhatsApp.'; setBusy(false); });
      rzp.open();
      return;
    }
    finish(await saveOrder(null), false, null);
  }

  /* ---------- Start ---------- */
  if (rzpKey) {
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.async = true;
    document.head.appendChild(s);
  }
  renderCart();
  loadProducts();
})();
