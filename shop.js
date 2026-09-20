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
  const normWa = (v) => {
    const d = String(v || '').replace(/\D/g, '');
    if (d.length === 10) return '91' + d;
    return d.length >= 11 && d.length <= 15 ? d : '';
  };
  const DEFAULT_CONTACT = {
    whatsapp: '917439658947',
    email: 'cocoaluxury2026@gmail.com',
    phone1: '7439658947',
    phone2: '8910931031',
    hours: 'Monday to Saturday, 12 pm to 8 pm'
  };
  let contact = { ...DEFAULT_CONTACT, whatsapp: normWa(CFG.WHATSAPP_NUMBER) || DEFAULT_CONTACT.whatsapp };
  let waNumber = contact.whatsapp;
  const rzpKey = CFG.RAZORPAY_KEY_ID || '';
  const storeName = CFG.STORE_NAME || 'Cocoa Luxury';
  const HEART = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>';

  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage blocked */ } }
  };

  let products = [];
  let settings = { shipping_fee: 0, free_shipping_above: null, announcement: '', shipping_info: '', returns_info: '', size_guide: '' };
  const WA_ICON = '<svg class="wa-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a9 9 0 0 0-7.7 13.6L3 21l4.5-1.2A9 9 0 1 0 12 3z"/><path d="M9.2 8.3c.1 2.5 2.9 5.2 5.5 5.4l1.2-1.3-1.9-.9-.9.7c-.9-.4-1.8-1.3-2.2-2.2l.7-.9-.9-1.9z"/></svg>';
  let filter = 'All';
  let query = '';
  let sort = 'new';
  let view = 'bag'; // bag | checkout | done
  let doneInfo = null;
  let coupon = null; // { code, discount }
  let pending = null; // order already created on the server, waiting for payment
  let cart = store.get('cl_cart', []);
  let wish = new Set(store.get('cl_wish', []));

  const sizesOf = (p) => (p.sizes || '').split(',').map((s) => s.trim()).filter(Boolean);
  const soldOut = (p) => p.stock !== null && p.stock !== undefined && Number(p.stock) <= 0;
  const maxQty = (p) => (p.stock === null || p.stock === undefined ? 20 : Math.min(20, Math.max(0, Number(p.stock))));
  const saleOff = (p) => (p.compare_at_price && p.compare_at_price > p.price ? Math.round((1 - p.price / p.compare_at_price) * 100) : 0);
  const isNew = (p) => Date.now() - new Date(p.created_at).getTime() < 14 * 864e5;
  const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));

  /* ---------- Page setup ---------- */
  document.title = storeName;
  document.querySelectorAll('[data-logo]').forEach((i) => { i.alt = storeName; });
  $('#tagline').textContent = CFG.TAGLINE || '';
  $('#copy').textContent = `© ${new Date().getFullYear()} ${storeName}`;
  if (CFG.INSTAGRAM_URL) $('#igLink').href = CFG.INSTAGRAM_URL; else $('#igLink').hidden = true;
  if (rzpKey) $('#perkPay').hidden = false;

  const fmtPhone = (p) => {
    const d = String(p).replace(/\D/g, '').slice(-10);
    return d.length === 10 ? `+91 ${d.slice(0, 5)} ${d.slice(5)}` : String(p);
  };
  const telHref = (p) => `tel:+91${String(p).replace(/\D/g, '').slice(-10)}`;

  function renderContact() {
    waNumber = contact.whatsapp;
    const wa = waNumber ? `https://wa.me/${waNumber}?text=${encodeURIComponent(`Hi ${storeName}, I have a question.`)}` : '';
    const fl = $('#waFloat');
    fl.hidden = !wa;
    if (wa) fl.href = wa;
    const phones = [contact.phone1, contact.phone2].filter(Boolean);
    const blocks = [
      phones.length ? `<div class="c-block"><h3>Call us</h3>${phones.map((p) => `<a href="${esc(telHref(p))}">${esc(fmtPhone(p))}</a>`).join('')}</div>` : '',
      wa ? `<div class="c-block"><h3>WhatsApp</h3><p>Message us for orders and questions.</p><a class="btn btn-fill" href="${esc(wa)}" target="_blank" rel="noopener">${WA_ICON}Chat on WhatsApp</a></div>` : '',
      contact.email ? `<div class="c-block"><h3>Email</h3><a href="mailto:${esc(contact.email)}">${esc(contact.email)}</a></div>` : '',
      contact.hours ? `<div class="c-block"><h3>Opening hours</h3><p>${esc(contact.hours)}</p></div>` : ''
    ].filter(Boolean);
    $('#contactGrid').innerHTML = blocks.join('');
    $('#contact').hidden = !blocks.length;
  }

  function showNotice(text) { $('#notice').innerHTML = `<p class="notice">${esc(text)}</p>`; }

  function applySettings() {
    const a = $('#announce');
    a.textContent = settings.announcement || '';
    a.hidden = !settings.announcement;
    $('#openInfo').hidden = !(settings.shipping_info || settings.returns_info);
  }

  /* ---------- Loading ---------- */
  async function fetchProducts() {
    const { data, error } = await sb.from('products').select('*').eq('active', true).order('created_at', { ascending: false });
    if (error) return false;
    products = (data || []).map((p) => ({ ...p, price: Number(p.price), compare_at_price: num(p.compare_at_price), images: p.images || [] }));
    return true;
  }

  async function start() {
    if (!sb) {
      showNotice('The store is not connected yet. Add your Supabase details in config.js.');
      return;
    }
    const [ok, st] = await Promise.all([
      fetchProducts(),
      sb.from('store_settings').select('*').eq('id', 1).maybeSingle().then((r) => r, () => ({ data: null }))
    ]);
    if (st && st.data) {
      settings = { ...settings, ...st.data };
      const S = st.data;
      if (S.whatsapp !== null && S.whatsapp !== undefined || S.phone_1 !== null && S.phone_1 !== undefined) {
        contact = {
          whatsapp: normWa(S.whatsapp) || contact.whatsapp,
          email: S.contact_email || '',
          phone1: S.phone_1 || '',
          phone2: S.phone_2 || '',
          hours: S.hours_text || ''
        };
      }
    }
    applySettings();
    renderContact();
    if (!ok) {
      showNotice('Products could not be loaded. Refresh the page to try again.');
      return;
    }
    reconcileCart();
    renderFilters();
    renderGrid();
    renderCart();
    updateSavedCount();
    const m = location.hash.match(/^#p=([\w-]+)/);
    if (m) openProduct(m[1], false);
    if (location.hash === '#track') openTrack();
  }

  /* ---------- Grid ---------- */
  function visibleProducts() {
    let list = products.slice();
    if (filter === 'Saved') list = list.filter((p) => wish.has(p.id));
    else if (filter !== 'All') list = list.filter((p) => p.category === filter);
    const q = query.trim().toLowerCase();
    if (q) list = list.filter((p) => [p.name, p.category, p.description].join(' ').toLowerCase().includes(q));
    if (sort === 'low') list.sort((a, b) => a.price - b.price);
    if (sort === 'high') list.sort((a, b) => b.price - a.price);
    if (sort === 'az') list.sort((a, b) => a.name.localeCompare(b.name));
    return list;
  }

  function renderFilters() {
    const cats = ['All', ...new Set(products.map((p) => p.category).filter(Boolean))];
    if (wish.size) cats.push('Saved');
    if (filter !== 'All' && !cats.includes(filter)) filter = 'All';
    $('#filters').innerHTML = cats.length > 2
      ? cats.map((c) => `<button type="button" class="chip" data-cat="${esc(c)}" aria-pressed="${c === filter}">${esc(c)}${c === 'Saved' ? ` (${wish.size})` : ''}</button>`).join('')
      : '';
  }

  function cardHTML(p) {
    const off = saleOff(p);
    const tag = soldOut(p) ? 'Sold out' : off ? `${off}% off` : isNew(p) ? 'New' : '';
    const tagClass = off && !soldOut(p) ? 'tag sale' : 'tag';
    const img = p.images[0];
    return `<article class="card">
      <button type="button" class="card-open" data-id="${esc(p.id)}">
        <span class="card-img">${img ? `<img src="${esc(img)}" alt="${esc(p.name)}" loading="lazy">` : ''}${tag ? `<span class="${tagClass}">${esc(tag)}</span>` : ''}</span>
        <span class="card-name">${esc(p.name)}</span>
        <span class="card-meta"><span>${esc(p.category)}</span><span class="price">${off ? `<s>${money(p.compare_at_price)}</s>` : ''}${money(p.price)}</span></span>
      </button>
      <button type="button" class="heart" data-heart="${esc(p.id)}" aria-pressed="${wish.has(p.id)}" aria-label="Save ${esc(p.name)}">${HEART}</button>
    </article>`;
  }

  function renderGrid() {
    const list = visibleProducts();
    let empty = 'New pieces are on the way. Check back soon.';
    if (query.trim()) empty = 'Nothing matches your search. Try a different word.';
    else if (filter === 'Saved') empty = 'You have not saved anything yet. Tap the heart on a product to save it.';
    else if (products.length) empty = 'No products in this category yet.';
    $('#grid').innerHTML = list.length ? list.map(cardHTML).join('') : `<p class="empty">${esc(empty)}</p>`;
  }

  function updateSavedCount() { $('#savedCount').textContent = wish.size; }

  function toggleWish(id) {
    if (wish.has(id)) wish.delete(id); else wish.add(id);
    store.set('cl_wish', [...wish]);
    updateSavedCount();
    renderFilters();
    renderGrid();
  }

  $('#filters').addEventListener('click', (e) => {
    const b = e.target.closest('.chip');
    if (!b) return;
    filter = b.dataset.cat;
    renderFilters();
    renderGrid();
  });
  $('#grid').addEventListener('click', (e) => {
    const h = e.target.closest('.heart');
    if (h) return toggleWish(h.dataset.heart);
    const c = e.target.closest('.card-open');
    if (c) openProduct(c.dataset.id);
  });
  let searchTimer;
  $('#search').addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { query = e.target.value; renderGrid(); }, 150);
  });
  $('#sort').addEventListener('change', (e) => { sort = e.target.value; renderGrid(); });
  $('#openSaved').addEventListener('click', () => {
    filter = wish.size ? 'Saved' : 'All';
    renderFilters();
    renderGrid();
    $('#shop').scrollIntoView({ behavior: 'smooth' });
  });

  /* ---------- Product dialog ---------- */
  $('#productDlg').addEventListener('close', () => {
    if (location.hash.startsWith('#p=')) history.replaceState(null, '', location.pathname + location.search);
  });

  function openProduct(id, push = true) {
    const p = products.find((x) => x.id === id);
    if (!p) return;
    const sizes = sizesOf(p);
    let size = sizes.length === 1 ? sizes[0] : '';
    const gone = soldOut(p);
    const off = saleOff(p);
    const low = !gone && p.stock !== null && p.stock !== undefined && p.stock <= 5;
    const rel = products.filter((x) => x.id !== p.id && x.category === p.category).slice(0, 4);
    const pageUrl = `${location.origin}${location.pathname}#p=${p.id}`;
    const dlg = $('#productDlg');

    const askUrl = waNumber
      ? `https://wa.me/${waNumber}?text=${encodeURIComponent(`Hi, I am interested in ${p.name} (${money(p.price)}). ${pageUrl}`)}`
      : '';
    const details = [
      settings.size_guide && sizes.length ? `<details><summary>Size guide</summary><p>${esc(settings.size_guide)}</p></details>` : '',
      settings.shipping_info ? `<details><summary>Delivery</summary><p>${esc(settings.shipping_info)}</p></details>` : '',
      settings.returns_info ? `<details><summary>Returns and exchange</summary><p>${esc(settings.returns_info)}</p></details>` : ''
    ].join('');

    dlg.innerHTML = `
      <button class="x" type="button" data-act="close" aria-label="Close">&times;</button>
      <div class="pd">
        <div>
          <div class="zoom" id="zoomWrap">${p.images[0] ? `<img class="main" id="pdMain" src="${esc(p.images[0])}" alt="${esc(p.name)}">` : '<div class="main"></div>'}</div>
          ${p.images.length > 1 ? `<div class="thumbs">${p.images.map((u, i) => `<button type="button" data-i="${i}" aria-label="Photo ${i + 1}" ${i === 0 ? 'aria-current="true"' : ''}><img src="${esc(u)}" alt=""></button>`).join('')}</div>` : ''}
        </div>
        <div class="pd-info">
          <h2>${esc(p.name)}</h2>
          <p class="pd-price">${off ? `<s>${money(p.compare_at_price)}</s>` : ''}${money(p.price)}${off ? `<span class="save">You save ${money(p.compare_at_price - p.price)}</span>` : ''}</p>
          ${low ? `<p class="low">Only ${p.stock} left</p>` : ''}
          ${p.description ? `<p class="pd-desc">${esc(p.description)}</p>` : ''}
          ${sizes.length ? `<div><p class="muted" style="margin-bottom:.5rem">Size</p><div class="sizes" role="group" aria-label="Choose a size">${sizes.map((s) => `<button type="button" class="size" data-size="${esc(s)}" aria-pressed="${s === size}">${esc(s)}</button>`).join('')}</div></div>` : ''}
          <p class="msg" id="pdMsg" role="alert"></p>
          <div class="stack">
            ${gone
              ? '<button class="btn" type="button" disabled>Sold out</button>'
              : '<button class="btn btn-fill" type="button" data-act="buy">Buy now</button><button class="btn" type="button" data-act="add">Add to bag</button>'}
          </div>
          <div class="pd-links">
            <button class="link" type="button" data-act="wish" data-id="${esc(p.id)}">${wish.has(p.id) ? 'Remove from saved' : 'Save for later'}</button>
            <button class="link" type="button" data-act="share">Share</button>
            ${askUrl ? `<a class="link" href="${esc(askUrl)}" target="_blank" rel="noopener">Ask about this on WhatsApp</a>` : ''}
          </div>
          <div class="pd-more">${details}</div>
        </div>
      </div>
      ${rel.length ? `<section class="related"><h3>More ${esc(p.category)}</h3><div class="rel-grid">${rel.map((r) => `<button type="button" data-rel="${esc(r.id)}">${r.images[0] ? `<img src="${esc(r.images[0])}" alt="" loading="lazy">` : ''}<span>${esc(r.name)}</span><span class="price">${money(r.price)}</span></button>`).join('')}</div></section>` : ''}`;

    const wrap = $('#zoomWrap', dlg);
    const moveOrigin = (e) => {
      const r = wrap.getBoundingClientRect();
      const img = $('#pdMain', dlg);
      if (img) img.style.transformOrigin = `${((e.clientX - r.left) / r.width) * 100}% ${((e.clientY - r.top) / r.height) * 100}%`;
    };
    wrap.addEventListener('mousemove', (e) => { if (wrap.classList.contains('on')) moveOrigin(e); });
    wrap.addEventListener('mouseleave', () => wrap.classList.remove('on'));

    dlg.onclick = (e) => {
      if (e.target === dlg) return dlg.close();
      if (e.target.closest('#zoomWrap') && $('#pdMain', dlg)) {
        moveOrigin(e);
        wrap.classList.toggle('on');
        return;
      }
      const rel = e.target.closest('[data-rel]');
      if (rel) { openProduct(rel.dataset.rel); dlg.scrollTop = 0; return; }
      const t = e.target.closest('button');
      if (!t) return;
      const act = t.dataset.act;
      if (act === 'close') return dlg.close();
      if (t.closest('.thumbs')) {
        $('#pdMain', dlg).src = p.images[Number(t.dataset.i)];
        wrap.classList.remove('on');
        dlg.querySelectorAll('.thumbs button').forEach((b) => b.removeAttribute('aria-current'));
        t.setAttribute('aria-current', 'true');
      }
      if (t.classList.contains('size')) {
        size = t.dataset.size;
        dlg.querySelectorAll('.size').forEach((b) => b.setAttribute('aria-pressed', String(b === t)));
        $('#pdMsg').textContent = '';
      }
      if (act === 'wish') { toggleWish(p.id); t.textContent = wish.has(p.id) ? 'Remove from saved' : 'Save for later'; }
      if (act === 'share') {
        if (navigator.share) navigator.share({ title: p.name, text: `${p.name} - ${money(p.price)}`, url: pageUrl }).catch(() => {});
        else window.open(`https://wa.me/?text=${encodeURIComponent(`${p.name} ${pageUrl}`)}`, '_blank', 'noopener');
      }
      if (act === 'add' || act === 'buy') {
        if (sizes.length && !size) { $('#pdMsg').textContent = 'Choose a size first.'; return; }
        addToCart(p.id, size);
        dlg.close();
        if (act === 'buy') view = 'checkout';
        openCart();
      }
    };

    if (!dlg.open) dlg.showModal();
    if (push) history.replaceState(null, '', `#p=${p.id}`);
  }

  /* ---------- Bag ---------- */
  function reconcileCart() {
    cart = cart
      .filter((l) => products.some((p) => p.id === l.id))
      .map((l) => ({ ...l, qty: Math.min(l.qty, maxQty(products.find((x) => x.id === l.id))) }))
      .filter((l) => l.qty > 0);
    store.set('cl_cart', cart);
  }
  const cartLines = () => cart.map((l) => ({ ...l, p: products.find((p) => p.id === l.id) })).filter((l) => l.p);
  const subtotal = () => cartLines().reduce((s, l) => s + l.p.price * l.qty, 0);
  const shippingFor = (amount) => {
    if (!amount) return 0;
    const free = num(settings.free_shipping_above);
    if (free !== null && amount >= free) return 0;
    return Number(settings.shipping_fee || 0);
  };
  function totals() {
    const sub = subtotal();
    const disc = coupon ? Math.min(coupon.discount, sub) : 0;
    const ship = shippingFor(sub - disc);
    return { sub, disc, ship, total: sub - disc + ship };
  }

  function cartChanged() {
    coupon = null;
    pending = null;
    store.set('cl_cart', cart);
    renderCart();
  }

  function addToCart(id, size) {
    const p = products.find((x) => x.id === id);
    if (!p) return;
    const line = cart.find((l) => l.id === id && l.size === size);
    if (line) line.qty = Math.min(line.qty + 1, maxQty(p));
    else cart.push({ id, size, qty: 1 });
    view = 'bag';
    cartChanged();
  }

  function openCart() { renderCart(); if (!$('#cartDlg').open) $('#cartDlg').showModal(); }
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

    const sub = subtotal();
    const free = num(settings.free_shipping_above);
    const hint = free !== null && Number(settings.shipping_fee) > 0
      ? (sub >= free ? 'You get free delivery on this order.' : `Add ${money(free - sub)} more to get free delivery.`)
      : '';
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
      ${hint ? `<p class="hint">${esc(hint)}</p>` : ''}
      <p class="total"><span>Subtotal</span><strong>${money(sub)}</strong></p>
      <button class="btn btn-fill" type="button" data-act="checkout">Checkout</button>`;
  }

  function renderCheckout(body) {
    const canPay = !!rzpKey;
    body.innerHTML = `
      <button class="link" type="button" data-act="back" style="align-self:flex-start;margin-bottom:1rem">Back to bag</button>
      <h3 style="font-size:1.7rem;margin-bottom:1.2rem">Delivery details</h3>
      <form id="checkoutForm">
        <div class="field"><label for="cName">Full name</label><input id="cName" required autocomplete="name" maxlength="80"></div>
        <div class="field"><label for="cEmail">Email (we send your order confirmation here)</label><input id="cEmail" type="email" inputmode="email" required autocomplete="email" maxlength="120"></div>
        <div class="field"><label for="cPhone">Phone number</label><input id="cPhone" type="tel" inputmode="tel" required autocomplete="tel" maxlength="20"></div>
        <div class="field"><label for="cAddr">Delivery address</label><textarea id="cAddr" required autocomplete="street-address" maxlength="400" placeholder="House, street, city, PIN code"></textarea></div>
        <div class="field">
          <label for="cCode">Discount code (optional)</label>
          <div class="coupon-row">
            <input class="ctl" id="cCode" autocomplete="off" maxlength="30" value="${esc(coupon ? coupon.code : '')}" ${coupon ? 'readonly' : ''}>
            <button class="btn btn-sm" type="button" data-act="coupon">${coupon ? 'Remove' : 'Apply'}</button>
          </div>
          <p class="msg ${coupon ? 'ok' : ''}" id="couponMsg">${coupon ? esc(`Code ${coupon.code} applied.`) : ''}</p>
        </div>
        <div id="sumBox"></div>
        <div class="stack">
          ${canPay ? '<button class="btn btn-fill" type="submit" value="razorpay">Pay <span id="payAmt"></span> online</button>' : ''}
          ${waNumber ? `<button class="btn ${canPay ? '' : 'btn-fill'}" type="submit" value="whatsapp">${WA_ICON}Order on WhatsApp</button>` : ''}
          ${!canPay && !waNumber ? '<p class="msg">Ordering is not set up yet. Add a WhatsApp number in Store settings in the admin.</p>' : ''}
        </div>
        <p class="msg" id="formMsg" role="alert" style="margin-top:.8rem"></p>
      </form>`;
    updateSummary();
  }

  function updateSummary() {
    const t = totals();
    const box = $('#sumBox');
    if (!box) return;
    box.innerHTML = `<dl class="sum">
      <div><dt>Subtotal</dt><dd>${money(t.sub)}</dd></div>
      ${t.disc ? `<div><dt>Discount</dt><dd>&minus;${money(t.disc)}</dd></div>` : ''}
      <div><dt>Delivery</dt><dd>${t.ship ? money(t.ship) : 'Free'}</dd></div>
      <div class="grand"><dt>Total</dt><dd>${money(t.total)}</dd></div>
    </dl>`;
    const pa = $('#payAmt');
    if (pa) pa.textContent = money(t.total);
  }

  async function toggleCoupon() {
    const msg = $('#couponMsg');
    const btn = $('[data-act="coupon"]');
    if (coupon) {
      coupon = null;
      $('#cCode').value = '';
      $('#cCode').readOnly = false;
      msg.className = 'msg';
      msg.textContent = '';
      btn.textContent = 'Apply';
      return updateSummary();
    }
    const code = $('#cCode').value.trim().toUpperCase();
    msg.className = 'msg';
    if (!code) { msg.textContent = 'Enter a code first.'; return; }
    btn.disabled = true;
    const { data, error } = await sb.rpc('check_coupon', { p_code: code, p_subtotal: subtotal() });
    btn.disabled = false;
    if (error || !data) { msg.textContent = 'Could not check this code. Try again.'; return; }
    if (!data.valid) { msg.textContent = data.message; return; }
    coupon = { code, discount: Number(data.discount) };
    $('#cCode').readOnly = true;
    msg.className = 'msg ok';
    msg.textContent = `Code ${code} applied.`;
    btn.textContent = 'Remove';
    updateSummary();
  }

  function renderDone(body) {
    const d = doneInfo;
    let lead = 'Almost done';
    let text = `Send your order on WhatsApp so we can confirm the details and payment with you.`;
    if (d.paid && d.saved) { lead = 'Payment received'; text = 'Your order is placed. We will contact you to confirm delivery.'; }
    if (d.paid && !d.saved) { lead = 'Payment received'; text = `We could not link your payment to the order automatically. Send the details on WhatsApp so we can confirm it. Payment ID: ${d.paymentId}`; }
    body.innerHTML = `<div class="done">
      <h3>${esc(lead)}</h3>
      <p class="muted" style="margin-bottom:.4rem">Your order number</p>
      <span class="ordno">#${esc(d.short)}</span>
      <p>${esc(text)} Keep the order number to track your order.${d.email ? ` A confirmation email is on its way to ${esc(d.email)}. Check your spam folder if you do not see it.` : ''}</p>
      <div class="stack">
        ${waNumber ? `<a class="btn btn-fill" href="${esc(d.waUrl)}" target="_blank" rel="noopener">${WA_ICON}${d.paid ? 'Message us on WhatsApp' : 'Send order on WhatsApp'}</a>` : ''}
        <button class="btn" type="button" data-act="track">Track this order</button>
        <button class="btn" type="button" data-act="close">Keep shopping</button>
      </div>
    </div>`;
  }

  $('#cartBody').addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    if (act === 'close') { if (view === 'done') view = 'bag'; $('#cartDlg').close(); return renderCart(); }
    if (act === 'checkout') { view = 'checkout'; return renderCart(); }
    if (act === 'back') { view = 'bag'; return renderCart(); }
    if (act === 'coupon') return toggleCoupon();
    if (act === 'track') { $('#cartDlg').close(); return openTrack(); }
    const line = cart.find((l) => l.id === b.dataset.id && l.size === b.dataset.size);
    if (!line) return;
    const p = products.find((x) => x.id === line.id);
    if (act === 'inc') line.qty = Math.min(line.qty + 1, maxQty(p));
    if (act === 'dec') line.qty = Math.max(line.qty - 1, 0);
    if (act === 'remove') line.qty = 0;
    cart = cart.filter((l) => l.qty > 0);
    cartChanged();
  });

  $('#cartBody').addEventListener('submit', (e) => {
    if (e.target.id !== 'checkoutForm') return;
    e.preventDefault();
    placeOrder(e.submitter ? e.submitter.value : (waNumber ? 'whatsapp' : 'razorpay'), e.target);
  });

  /* ---------- Placing an order ---------- */
  function friendlyError(error) {
    const m = (error && error.message) || '';
    if (/could not find the function|schema cache|place_order/i.test(m) && /function|schema/i.test(m)) {
      return 'The store database needs its update. Run upgrade.sql in Supabase, then try again.';
    }
    if (/failed to fetch|network/i.test(m)) return 'Could not reach the store. Check your internet and try again.';
    return m || 'Something went wrong. Please try again.';
  }

  function waMessage(o) {
    const lines = o.items.map((i) => `${i.qty} x ${i.name}${i.size ? ` (${i.size})` : ''} - ${money(i.price * i.qty)}`);
    const pay = o.paid ? `Paid online (payment ID ${o.paymentId})` : 'Payment to be confirmed here';
    return [
      `New order #${o.short}`,
      ...lines,
      ...(o.discount ? [`Discount: -${money(o.discount)}`] : []),
      `Delivery: ${o.shipping ? money(o.shipping) : 'Free'}`,
      `Total: ${money(o.total)}`,
      `Payment: ${pay}`,
      '',
      `Name: ${o.customer}`,
      `Phone: ${o.phone}`,
      ...(o.email ? [`Email: ${o.email}`] : []),
      `Address: ${o.address}`
    ].join('\n');
  }

  // Asks the server to send the thank-you email. It never blocks or breaks checkout.
  function sendThanks(orderId) {
    try {
      fetch('/.netlify/functions/send-order-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId })
      }).catch(() => {});
    } catch { /* ignore */ }
  }

  async function placeOrder(method, form) {
    const msgEl = $('#formMsg');
    msgEl.textContent = '';
    const customer = $('#cName').value.trim();
    const phone = $('#cPhone').value.trim();
    const address = $('#cAddr').value.trim();
    const email = $('#cEmail').value.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { msgEl.textContent = 'Enter a valid email address.'; return; }
    if (phone.replace(/\D/g, '').length < 10) { msgEl.textContent = 'Enter a phone number with at least 10 digits.'; return; }
    const lines = cartLines();
    if (!lines.length) return;

    const setBusy = (on) => form.querySelectorAll('button[type=submit]').forEach((b) => { b.disabled = on; });
    setBusy(true);

    let order = pending;
    if (!order) {
      const id = crypto.randomUUID();
      const { data, error } = await sb.rpc('place_order', {
        p_id: id, p_name: customer, p_phone: phone, p_address: address,
        p_items: lines.map((l) => ({ id: l.id, size: l.size || null, qty: l.qty })),
        p_coupon: coupon ? coupon.code : null, p_method: method, p_email: email
      });
      if (error) {
        msgEl.textContent = friendlyError(error);
        setBusy(false);
        fetchProducts().then((ok) => { if (ok) { reconcileCart(); renderGrid(); } });
        return;
      }
      order = {
        id, short: id.slice(0, 6).toUpperCase(), items: data.items, total: Number(data.total),
        discount: Number(data.discount), shipping: Number(data.shipping), customer, phone, address, email
      };
      pending = order;
    }

    const finish = (saved, paid, paymentId) => {
      store.set('cl_last', { code: order.short, phone });
      if (saved) sendThanks(order.id);
      cart = [];
      coupon = null;
      pending = null;
      store.set('cl_cart', cart);
      doneInfo = { short: order.short, saved, paid, paymentId, email: order.email, waUrl: waNumber ? `https://wa.me/${waNumber}?text=${encodeURIComponent(waMessage({ ...order, paid, paymentId }))}` : '' };
      view = 'done';
      renderCart();
      fetchProducts().then((ok) => { if (ok) { reconcileCart(); renderGrid(); } });
    };

    if (method === 'whatsapp') return finish(true, false, null);

    if (typeof window.Razorpay === 'undefined') {
      msgEl.textContent = 'Online payment did not load. Check your connection, or order on WhatsApp.';
      return setBusy(false);
    }
    const rzp = new window.Razorpay({
      key: rzpKey,
      amount: Math.round(order.total * 100),
      currency: 'INR',
      name: storeName,
      description: `Order #${order.short}`,
      prefill: { name: customer, contact: phone },
      theme: { color: '#6a4325' },
      handler: async (res) => {
        const { error } = await sb.rpc('attach_payment', { p_id: order.id, p_payment_id: res.razorpay_payment_id });
        finish(!error, true, res.razorpay_payment_id);
      },
      modal: {
        ondismiss: () => {
          msgEl.textContent = 'Payment was not completed. Your items are held for you. Press pay to try again, or order on WhatsApp.';
          setBusy(false);
        }
      }
    });
    rzp.on('payment.failed', () => { msgEl.textContent = 'Payment failed. Try again, or order on WhatsApp.'; setBusy(false); });
    rzp.open();
  }

  /* ---------- Track order ---------- */
  const STEPS = ['Order placed', 'Confirmed', 'Shipped', 'Delivered'];
  const stepIndex = (s) => ({ new: 0, paid: 0, confirmed: 1, shipped: 2, delivered: 3 }[s] ?? 0);

  function openTrack() {
    const last = store.get('cl_last', null);
    if (last && !$('#tCode').value) { $('#tCode').value = last.code; $('#tPhone').value = last.phone; }
    $('#trackDlg').showModal();
  }
  $('#openTrack').addEventListener('click', openTrack);
  $('#footTrack').addEventListener('click', openTrack);

  $('#trackForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const out = $('#tResult');
    if (!sb) { out.innerHTML = '<p class="msg">The store is not connected yet.</p>'; return; }
    const btn = $('#tBtn');
    btn.disabled = true;
    out.innerHTML = '';
    const { data, error } = await sb.rpc('track_order', { p_code: $('#tCode').value.trim(), p_phone: $('#tPhone').value.trim() });
    btn.disabled = false;
    if (error) { out.innerHTML = `<p class="msg">${esc(friendlyError(error))}</p>`; return; }
    if (!data) { out.innerHTML = '<p class="msg" style="margin-top:1rem">No order found. Check the order number and the phone number you used.</p>'; return; }
    const when = new Date(data.created_at).toLocaleDateString('en-IN', { dateStyle: 'medium' });
    const items = (data.items || []).map((i) => `<li>${esc(i.qty)} × ${esc(i.name)}${i.size ? ` (${esc(i.size)})` : ''}</li>`).join('');
    const steps = data.status === 'cancelled'
      ? '<p class="msg" style="margin:1.2rem 0">This order was cancelled. Message us on WhatsApp if you have questions.</p>'
      : `<ol class="steps">${STEPS.map((s, i) => `<li class="${i < stepIndex(data.status) ? 'done' : i === stepIndex(data.status) ? 'done now' : ''}">${s}</li>`).join('')}</ol>`;
    out.innerHTML = `<h3>Order #${esc(data.short)}</h3>
      <p class="muted">Placed on ${esc(when)} · ${money(data.total)}</p>
      ${steps}
      ${data.note ? `<p><strong>Update from us:</strong> ${esc(data.note)}</p>` : ''}
      <ul class="t-items">${items}</ul>`;
  });

  /* ---------- Info dialog and close buttons ---------- */
  $('#openInfo').addEventListener('click', () => {
    $('#infoBody').innerHTML =
      (settings.shipping_info ? `<h3>Delivery</h3><p class="body">${esc(settings.shipping_info)}</p>` : '') +
      (settings.returns_info ? `<h3>Returns and exchange</h3><p class="body">${esc(settings.returns_info)}</p>` : '');
    $('#infoDlg').showModal();
  });
  document.querySelectorAll('dialog').forEach((d) => {
    d.addEventListener('click', (e) => {
      if (e.target === d || e.target.closest('[data-close]')) d.close();
    });
  });

  /* ---------- Start ---------- */
  if (rzpKey) {
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.async = true;
    document.head.appendChild(s);
  }
  renderCart();
  updateSavedCount();
  renderContact();
  start();
})();
