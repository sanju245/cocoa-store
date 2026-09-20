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
  const numOrNull = (v) => (v === '' || v === null || v === undefined ? null : Number(v));

  const STATUSES = [
    ['new', 'New'], ['paid', 'Payment verified'], ['confirmed', 'Confirmed'],
    ['shipped', 'Shipped'], ['delivered', 'Delivered'], ['cancelled', 'Cancelled']
  ];
  const DEFAULT_CATS = ['T-shirt', 'Shorts', 'Watch'];
  const MAX_IMAGES = 6;

  let products = [];
  let orders = [];
  let coupons = [];
  let editingId = null;
  let editingCoupon = null;
  let formImgs = [];
  let uid = null;

  /* ---------- Auth ---------- */
  function authMessage(err) {
    const m = (err && err.message) || '';
    if (/invalid login/i.test(m)) return 'Email or password is incorrect. Use the login you created in Supabase under Authentication, Users.';
    if (/not confirmed/i.test(m)) return 'This account is not confirmed. In Supabase, open Authentication, Users, select your user and confirm it.';
    if (/failed to fetch|network|load failed/i.test(m)) return 'Could not reach Supabase. Check SUPABASE_URL in config.js and your internet connection.';
    if (/api key|apikey|jwt/i.test(m)) return 'Supabase rejected the key. Check SUPABASE_ANON_KEY in config.js.';
    if (/rate limit|too many|security purposes/i.test(m)) return 'Too many attempts. Wait a minute and try again.';
    return m || 'Could not sign in. Try again.';
  }

  async function init() {
    if (!sb) {
      $('#login').hidden = false;
      $('#loginBtn').disabled = true;
      $('#loginMsg').textContent = 'The store is not connected. Open config.js and add SUPABASE_URL and SUPABASE_ANON_KEY.';
      return;
    }
    // Do not call Supabase inside this callback directly. Deferring avoids a known lock-up after sign-in.
    sb.auth.onAuthStateChange((event, session) => {
      setTimeout(() => {
        if (event === 'PASSWORD_RECOVERY') $('#pwDlg').showModal();
        route(session);
      }, 0);
    });
    const { data, error } = await sb.auth.getSession();
    if (error) { $('#login').hidden = false; $('#loginMsg').textContent = authMessage(error); return; }
    route(data.session);
  }

  function route(session) {
    $('#login').hidden = !!session;
    $('#app').hidden = !session;
    const id = session ? session.user.id : null;
    if (id === uid) return;
    uid = id;
    if (session) {
      $('#who').textContent = session.user.email;
      loadAll();
    }
  }

  $('#loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = $('#loginMsg');
    const btn = $('#loginBtn');
    msg.className = 'msg';
    msg.textContent = '';
    btn.disabled = true;
    btn.textContent = 'Signing in…';
    try {
      const { data, error } = await sb.auth.signInWithPassword({ email: $('#email').value.trim(), password: $('#password').value });
      if (error) msg.textContent = authMessage(error);
      else route(data.session);
    } catch (err) {
      msg.textContent = authMessage(err);
    }
    btn.disabled = false;
    btn.textContent = 'Sign in';
  });

  $('#showPw').addEventListener('click', (e) => {
    const input = $('#password');
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    e.currentTarget.textContent = show ? 'Hide' : 'Show';
    e.currentTarget.setAttribute('aria-pressed', String(show));
  });

  $('#forgot').addEventListener('click', async () => {
    const msg = $('#loginMsg');
    const email = $('#email').value.trim();
    msg.className = 'msg';
    if (!sb) return;
    if (!email) { msg.textContent = 'Enter your email above first.'; return; }
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
    if (error) { msg.textContent = authMessage(error); return; }
    msg.className = 'msg ok';
    msg.textContent = 'If this email has an account, a reset link is on its way. Check your inbox.';
  });

  $('#pwForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = $('#pwMsg');
    const { error } = await sb.auth.updateUser({ password: $('#newPw').value });
    if (error) { msg.className = 'msg'; msg.textContent = error.message; return; }
    $('#pwDlg').close();
  });

  $('#logout').addEventListener('click', () => sb.auth.signOut());

  document.querySelectorAll('.tab').forEach((t) =>
    t.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((x) => x.setAttribute('aria-selected', String(x === t)));
      ['dash', 'products', 'orders', 'coupons', 'settings'].forEach((n) => { $(`#tab-${n}`).hidden = t.dataset.tab !== n; });
    })
  );

  async function loadAll() {
    await Promise.all([loadProducts(), loadOrders(), loadCoupons(), loadSettings()]);
    renderDash();
  }

  const errBox = (what, error) => `<p class="empty">${esc(what)} could not be loaded: ${esc(error.message)}. If this mentions a missing table, run upgrade.sql in Supabase.</p>`;

  /* ---------- Overview ---------- */
  function renderDash() {
    const unpaid = (o) => o.payment_method === 'razorpay' && !o.payment_id;
    const live = orders.filter((o) => o.status !== 'cancelled' && !unpaid(o));
    const revenue = live.reduce((s, o) => s + Number(o.total), 0);
    const fresh = orders.filter((o) => o.status === 'new' && !unpaid(o));
    const low = products.filter((p) => p.active && p.stock !== null && p.stock <= 3);
    $('#dash').innerHTML = `
      <div class="stats">
        <div class="stat"><p>New orders</p><strong>${fresh.length}</strong></div>
        <div class="stat"><p>All orders</p><strong>${orders.length}</strong></div>
        <div class="stat"><p>Sales</p><strong>${money(revenue)}</strong></div>
        <div class="stat"><p>Products in shop</p><strong>${products.filter((p) => p.active).length}</strong></div>
      </div>
      <p class="muted" style="margin:-.8rem 0 1.4rem;font-size:.9rem">Sales exclude cancelled orders and online payments that were not completed.</p>
      <div class="panel">
        <h3>Running low on stock</h3>
        ${low.length ? `<ul>${low.map((p) => `<li>${esc(p.name)}: ${p.stock === 0 ? 'sold out' : `${p.stock} left`}</li>`).join('')}</ul>` : '<p class="muted">Nothing is running low.</p>'}
      </div>
      <div class="panel">
        <h3>Latest orders</h3>
        ${orders.length ? `<ul>${orders.slice(0, 5).map((o) => `<li>#${esc(o.id.slice(0, 6).toUpperCase())} · ${esc(o.customer_name)} · ${money(o.total)} · ${esc(statusLabel(o.status))}</li>`).join('')}</ul>` : '<p class="muted">No orders yet.</p>'}
      </div>`;
  }
  const statusLabel = (s) => (STATUSES.find((x) => x[0] === s) || [s, s])[1];

  /* ---------- Products ---------- */
  async function loadProducts() {
    const { data, error } = await sb.from('products').select('*').order('created_at', { ascending: false });
    if (error) { $('#plist').innerHTML = errBox('Products', error); return; }
    products = data || [];
    renderProducts();
  }

  function renderProducts() {
    const q = $('#pSearch').value.trim().toLowerCase();
    const list = q ? products.filter((p) => `${p.name} ${p.category}`.toLowerCase().includes(q)) : products;
    $('#plist').innerHTML = list.length
      ? list.map((p) => {
          const lowStock = p.stock !== null && p.stock <= 3;
          return `<article class="prow">
          ${p.images && p.images[0] ? `<img src="${esc(p.images[0])}" alt="">` : '<div class="ph"></div>'}
          <div>
            <h3>${esc(p.name)}<span class="pill ${p.active ? 'live' : ''}">${p.active ? 'Visible' : 'Hidden'}</span>${lowStock ? `<span class="pill warn">${p.stock === 0 ? 'Sold out' : 'Low stock'}</span>` : ''}</h3>
            <p class="muted">${esc(p.category)} · ${money(p.price)}${p.compare_at_price ? ` (was ${money(p.compare_at_price)})` : ''} · ${p.stock === null ? 'Unlimited stock' : `${p.stock} in stock`}</p>
          </div>
          <div class="actions">
            <button class="btn btn-sm" type="button" data-act="edit" data-id="${esc(p.id)}">Edit</button>
            <button class="btn btn-sm" type="button" data-act="dup" data-id="${esc(p.id)}">Duplicate</button>
            <button class="btn btn-sm" type="button" data-act="toggle" data-id="${esc(p.id)}">${p.active ? 'Hide' : 'Show'}</button>
            <button class="btn btn-sm btn-danger" type="button" data-act="delete" data-id="${esc(p.id)}">Delete</button>
          </div>
        </article>`;
        }).join('')
      : `<p class="empty">${products.length ? 'No products match your search.' : 'No products yet. Select Add product to list your first item.'}</p>`;
  }
  $('#pSearch').addEventListener('input', renderProducts);

  $('#plist').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const p = products.find((x) => x.id === b.dataset.id);
    if (!p) return;
    if (b.dataset.act === 'edit') openForm(p);
    if (b.dataset.act === 'dup') openForm({ ...p, id: null, name: `${p.name} (copy)` });
    if (b.dataset.act === 'toggle') {
      const { error } = await sb.from('products').update({ active: !p.active }).eq('id', p.id);
      if (error) return alert('Could not update: ' + error.message);
      await loadProducts(); renderDash();
    }
    if (b.dataset.act === 'delete') {
      if (!confirm(`Delete "${p.name}"? This cannot be undone.`)) return;
      const { error } = await sb.from('products').delete().eq('id', p.id);
      if (error) return alert('Could not delete: ' + error.message);
      await loadProducts(); renderDash();
    }
  });

  function openForm(p) {
    editingId = p && p.id ? p.id : null;
    formImgs = p ? [...(p.images || [])] : [];
    $('#formTitle').textContent = editingId ? 'Edit product' : 'Add product';
    $('#pName').value = p ? p.name : '';
    $('#pCat').value = p ? p.category : '';
    $('#pPrice').value = p ? p.price : '';
    $('#pWas').value = p && p.compare_at_price ? p.compare_at_price : '';
    $('#pSizes').value = p && p.sizes ? p.sizes : '';
    $('#pStock').value = p && p.stock !== null && p.stock !== undefined ? p.stock : '';
    $('#pDesc').value = p && p.description ? p.description : '';
    $('#pActive').checked = p ? p.active : true;
    $('#formMsg').textContent = '';
    $('#fileIn').value = '';
    const cats = [...new Set([...DEFAULT_CATS, ...products.map((x) => x.category)])];
    $('#catList').innerHTML = cats.map((c) => `<option value="${esc(c)}"></option>`).join('');
    renderImgs();
    $('#formDlg').showModal();
  }
  $('#addBtn').addEventListener('click', () => openForm(null));
  $('#cancelForm').addEventListener('click', () => $('#formDlg').close());

  function renderImgs() {
    $('#imgList').innerHTML = formImgs.map((u, i) => `
      <div class="img ${i === 0 ? 'cover' : ''}">
        <img src="${esc(u)}" alt="Photo ${i + 1}">
        ${i === 0 ? '<span class="badge">Cover</span>' : `<button type="button" class="link" data-act="cover" data-i="${i}">Make cover</button>`}
        <button type="button" class="link" data-act="rm" data-i="${i}">Remove</button>
      </div>`).join('');
  }
  $('#imgList').addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const i = Number(b.dataset.i);
    if (b.dataset.act === 'rm') formImgs.splice(i, 1);
    if (b.dataset.act === 'cover') formImgs.unshift(formImgs.splice(i, 1)[0]);
    renderImgs();
  });

  async function shrink(file, max = 1400) {
    try {
      const bmp = await createImageBitmap(file);
      const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
      const c = document.createElement('canvas');
      c.width = Math.round(bmp.width * scale);
      c.height = Math.round(bmp.height * scale);
      c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
      const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.86));
      return blob ? { blob, type: 'image/jpeg', ext: 'jpg' } : null;
    } catch { return null; }
  }

  async function uploadImage(file) {
    const small = await shrink(file);
    const body = small ? small.blob : file;
    const type = small ? small.type : file.type || 'image/jpeg';
    const ext = small ? small.ext : (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
    const path = `${crypto.randomUUID()}.${ext}`;
    const { error } = await sb.storage.from('products').upload(path, body, { contentType: type, cacheControl: '31536000' });
    if (error) throw error;
    return sb.storage.from('products').getPublicUrl(path).data.publicUrl;
  }

  $('#fileIn').addEventListener('change', async (e) => {
    const files = [...e.target.files];
    if (!files.length) return;
    const msg = $('#formMsg');
    msg.className = 'msg';
    for (const f of files) {
      if (formImgs.length >= MAX_IMAGES) { msg.textContent = `You can add up to ${MAX_IMAGES} photos.`; break; }
      msg.className = 'msg ok';
      msg.textContent = 'Uploading photo…';
      try {
        formImgs.push(await uploadImage(f));
        renderImgs();
        msg.textContent = '';
      } catch (err) {
        msg.className = 'msg';
        msg.textContent = 'A photo could not be uploaded: ' + (err.message || 'unknown error');
        break;
      }
    }
    e.target.value = '';
  });

  $('#pform').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = $('#formMsg');
    const btn = $('#saveBtn');
    msg.className = 'msg';
    msg.textContent = '';
    const payload = {
      name: $('#pName').value.trim(),
      category: $('#pCat').value.trim() || 'General',
      price: Number($('#pPrice').value),
      compare_at_price: numOrNull($('#pWas').value),
      sizes: $('#pSizes').value.trim() || null,
      stock: $('#pStock').value === '' ? null : parseInt($('#pStock').value, 10),
      description: $('#pDesc').value.trim() || null,
      images: formImgs,
      active: $('#pActive').checked
    };
    if (!payload.name || !(payload.price >= 0)) { msg.textContent = 'Enter a name and a valid price.'; return; }
    if (payload.compare_at_price !== null && payload.compare_at_price <= payload.price) {
      msg.textContent = 'The original price must be higher than the selling price.';
      return;
    }
    btn.disabled = true;
    const q = editingId ? sb.from('products').update(payload).eq('id', editingId) : sb.from('products').insert(payload);
    const { error } = await q;
    btn.disabled = false;
    if (error) { msg.textContent = 'Could not save: ' + error.message + (/compare_at_price/.test(error.message) ? ' Run upgrade.sql in Supabase first.' : ''); return; }
    $('#formDlg').close();
    await loadProducts();
    renderDash();
  });

  /* ---------- Orders ---------- */
  async function loadOrders() {
    const { data, error } = await sb.from('orders').select('*').order('created_at', { ascending: false }).limit(500);
    if (error) { $('#olist').innerHTML = errBox('Orders', error); return; }
    orders = data || [];
    renderOrders();
  }
  $('#refreshOrders').addEventListener('click', async () => { await loadOrders(); renderDash(); });

  $('#oStatus').innerHTML = '<option value="all">All orders</option>' + STATUSES.map(([v, l]) => `<option value="${v}">${l}</option>`).join('');
  $('#oStatus').addEventListener('change', renderOrders);
  $('#oSearch').addEventListener('input', renderOrders);

  function waLink(phone, text) {
    let d = String(phone).replace(/\D/g, '');
    if (d.length === 10) d = '91' + d;
    return `https://wa.me/${d}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
  }

  function renderOrders() {
    const status = $('#oStatus').value;
    const q = $('#oSearch').value.trim().toLowerCase().replace('#', '');
    const list = orders.filter((o) =>
      (status === 'all' || o.status === status) &&
      (!q || `${o.customer_name} ${o.phone} ${o.email || ''} ${o.id.slice(0, 6)}`.toLowerCase().includes(q))
    );
    $('#olist').innerHTML = list.length
      ? list.map((o) => {
          const short = o.id.slice(0, 6).toUpperCase();
          const when = new Date(o.created_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
          const items = (o.items || []).map((i) => `<li>${esc(i.qty)} × ${esc(i.name)}${i.size ? ` (${esc(i.size)})` : ''} — ${money(i.price * i.qty)}</li>`).join('');
          const unpaid = o.payment_method === 'razorpay' && !o.payment_id;
          const pay = o.payment_method === 'razorpay'
            ? (unpaid
                ? 'Online payment not completed yet. If the customer does not pay, set this order to Cancelled and the items go back into stock.'
                : `Online payment. Razorpay payment ID: ${esc(o.payment_id)}. Check it in your Razorpay dashboard, then set the status to Payment verified.`)
            : 'Ordered on WhatsApp. Payment to be arranged with the customer.';
          const breakdown = [
            o.discount > 0 ? `Discount${o.coupon_code ? ` (${esc(o.coupon_code)})` : ''}: −${money(o.discount)}` : '',
            o.shipping > 0 ? `Delivery: ${money(o.shipping)}` : ''
          ].filter(Boolean).join(' · ');
          const hi = `Hi ${o.customer_name}, this is ${CFG.STORE_NAME || 'Cocoa Luxury'} about your order #${short}.`;
          return `<article class="ocard">
            <div class="ohead">
              <h3>#${esc(short)} · ${esc(o.customer_name)}${unpaid ? '<span class="pill warn">Awaiting payment</span>' : ''}</h3>
              <select data-id="${esc(o.id)}" aria-label="Order status">
                ${STATUSES.map(([v, l]) => `<option value="${v}" ${o.status === v ? 'selected' : ''}>${l}</option>`).join('')}
              </select>
            </div>
            <p class="muted">${esc(when)}</p>
            <p><a href="tel:${esc(o.phone)}">${esc(o.phone)}</a> · <a href="${esc(waLink(o.phone, hi))}" target="_blank" rel="noopener">WhatsApp the customer</a></p>
            <p style="white-space:pre-line">${esc(o.address)}</p>
            <ul>${items}</ul>
            ${breakdown ? `<p class="muted">${breakdown}</p>` : ''}
            <p class="otot">${money(o.total)}</p>
            <p class="pay-note">${pay}</p>
            <p class="pay-note">${o.email
              ? `Email: <a href="mailto:${esc(o.email)}">${esc(o.email)}</a> · ${o.email_sent_at ? `Thank-you email sent ${esc(new Date(o.email_sent_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }))}` : 'Thank-you email not sent yet'} · <button class="link" type="button" data-mail="${esc(o.id)}">${o.email_sent_at ? 'Send again' : 'Send thank-you email'}</button> <span class="msg" data-mailmsg="${esc(o.id)}" role="status"></span>`
              : 'No email address on this order.'}</p>
            <div class="field" style="margin:0"><label for="note-${esc(short)}">Update shown to the customer when they track the order (for example courier and tracking number)</label><input class="ctl" id="note-${esc(short)}" data-note="${esc(o.id)}" maxlength="200" value="${esc(o.note || '')}"></div>
          </article>`;
        }).join('')
      : '<p class="empty">No orders match. New orders will show up here.</p>';
  }

  $('#olist').addEventListener('click', async (e) => {
    const b = e.target.closest('button[data-mail]');
    if (!b) return;
    const out = $(`[data-mailmsg="${b.dataset.mail}"]`);
    b.disabled = true;
    out.className = 'msg';
    out.textContent = 'Sending…';
    try {
      const { data } = await sb.auth.getSession();
      const res = await fetch('/.netlify/functions/send-order-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: b.dataset.mail, resend: true, token: data.session ? data.session.access_token : '' })
      });
      const j = await res.json().catch(() => ({}));
      out.className = j.ok ? 'msg ok' : 'msg';
      out.textContent = j.message || 'Could not send. Email may not be set up yet.';
      if (j.ok && !j.skipped) { await loadOrders(); return; }
    } catch {
      out.textContent = 'Could not reach the email service. It only works on your live Netlify site.';
    }
    b.disabled = false;
  });

  $('#olist').addEventListener('change', async (e) => {
    const s = e.target.closest('select[data-id]');
    if (s) {
      const { error } = await sb.from('orders').update({ status: s.value }).eq('id', s.dataset.id);
      if (error) alert('Could not update status: ' + error.message);
      await Promise.all([loadOrders(), loadProducts()]);
      renderDash();
      return;
    }
    const n = e.target.closest('input[data-note]');
    if (n) {
      const { error } = await sb.from('orders').update({ note: n.value.trim() || null }).eq('id', n.dataset.note);
      if (error) alert('Could not save the update: ' + error.message);
    }
  });

  $('#exportOrders').addEventListener('click', () => {
    const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const head = ['Order', 'Date', 'Name', 'Phone', 'Email', 'Address', 'Items', 'Subtotal', 'Discount', 'Delivery', 'Total', 'Payment', 'Payment ID', 'Status'];
    const rows = orders.map((o) => [
      o.id.slice(0, 6).toUpperCase(), new Date(o.created_at).toLocaleString('en-IN'), o.customer_name, o.phone, o.email || '',
      (o.address || '').replace(/\s*\n\s*/g, ', '),
      (o.items || []).map((i) => `${i.qty} x ${i.name}${i.size ? ` (${i.size})` : ''}`).join('; '),
      o.subtotal ?? '', o.discount ?? 0, o.shipping ?? 0, o.total, o.payment_method, o.payment_id || '', o.status
    ]);
    const csv = '\ufeff' + [head, ...rows].map((r) => r.map(cell).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `orders-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });

  /* ---------- Discount codes ---------- */
  async function loadCoupons() {
    const { data, error } = await sb.from('coupons').select('*').order('created_at', { ascending: false });
    if (error) { $('#clist').innerHTML = errBox('Discount codes', error); return; }
    coupons = data || [];
    renderCoupons();
  }

  function renderCoupons() {
    $('#clist').innerHTML = coupons.length
      ? coupons.map((c) => {
          const expired = c.expires_at && c.expires_at < new Date().toISOString().slice(0, 10);
          return `<article class="prow" style="grid-template-columns:1fr">
          <div>
            <h3>${esc(c.code)}<span class="pill ${c.active && !expired ? 'live' : ''}">${expired ? 'Expired' : c.active ? 'Active' : 'Off'}</span></h3>
            <p class="muted">${c.kind === 'percent' ? `${Number(c.value)}% off` : `${money(c.value)} off`}${c.min_order > 0 ? ` · minimum order ${money(c.min_order)}` : ''}${c.expires_at ? ` · expires ${esc(c.expires_at)}` : ''}</p>
          </div>
          <div class="actions">
            <button class="btn btn-sm" type="button" data-act="edit" data-code="${esc(c.code)}">Edit</button>
            <button class="btn btn-sm btn-danger" type="button" data-act="delete" data-code="${esc(c.code)}">Delete</button>
          </div>
        </article>`;
        }).join('')
      : '<p class="empty">No discount codes yet. Select Add code to create one, for example WELCOME10.</p>';
  }

  $('#clist').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const c = coupons.find((x) => x.code === b.dataset.code);
    if (!c) return;
    if (b.dataset.act === 'edit') openCoupon(c);
    if (b.dataset.act === 'delete') {
      if (!confirm(`Delete code ${c.code}?`)) return;
      const { error } = await sb.from('coupons').delete().eq('code', c.code);
      if (error) return alert('Could not delete: ' + error.message);
      loadCoupons();
    }
  });

  function openCoupon(c) {
    editingCoupon = c ? c.code : null;
    $('#cTitle').textContent = c ? 'Edit discount code' : 'Add discount code';
    $('#kCode').value = c ? c.code : '';
    $('#kCode').readOnly = !!c;
    $('#kKind').value = c ? c.kind : 'percent';
    $('#kVal').value = c ? Number(c.value) : '';
    $('#kMin').value = c && c.min_order > 0 ? Number(c.min_order) : '';
    $('#kExp').value = c && c.expires_at ? c.expires_at : '';
    $('#kActive').checked = c ? c.active : true;
    $('#cMsg').textContent = '';
    $('#couponDlg').showModal();
  }
  $('#addCoupon').addEventListener('click', () => openCoupon(null));
  $('#cancelCoupon').addEventListener('click', () => $('#couponDlg').close());

  $('#cform').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = $('#cMsg');
    const code = $('#kCode').value.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
    const value = Number($('#kVal').value);
    const kind = $('#kKind').value;
    if (!code) { msg.textContent = 'Enter a code using letters and numbers.'; return; }
    if (!(value > 0) || (kind === 'percent' && value > 100)) { msg.textContent = kind === 'percent' ? 'Enter a percentage between 1 and 100.' : 'Enter an amount above 0.'; return; }
    $('#cBtn').disabled = true;
    const { error } = await sb.from('coupons').upsert({
      code, kind, value, min_order: Number($('#kMin').value || 0),
      expires_at: $('#kExp').value || null, active: $('#kActive').checked
    }, { onConflict: 'code' });
    $('#cBtn').disabled = false;
    if (error) { msg.textContent = 'Could not save: ' + error.message; return; }
    $('#couponDlg').close();
    loadCoupons();
  });

  /* ---------- Store settings ---------- */
  async function loadSettings() {
    const { data, error } = await sb.from('store_settings').select('*').eq('id', 1).maybeSingle();
    if (error) { $('#sMsg').textContent = 'Settings could not be loaded. Run upgrade.sql in Supabase.'; return; }
    const s = data || {};
    $('#sWa').value = s.whatsapp || '';
    $('#sP1').value = s.phone_1 || '';
    $('#sP2').value = s.phone_2 || '';
    $('#sMail').value = s.contact_email || '';
    $('#sHours').value = s.hours_text || '';
    $('#sAnn').value = s.announcement || '';
    $('#sFee').value = s.shipping_fee ? Number(s.shipping_fee) : '';
    $('#sFree').value = s.free_shipping_above !== null && s.free_shipping_above !== undefined ? Number(s.free_shipping_above) : '';
    $('#sShip').value = s.shipping_info || '';
    $('#sRet').value = s.returns_info || '';
    $('#sSize').value = s.size_guide || '';
  }

  $('#sform').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = $('#sMsg');
    msg.className = 'msg';
    let wa = $('#sWa').value.replace(/\D/g, '');
    if (wa.length === 10) wa = '91' + wa;
    if (wa && (wa.length < 11 || wa.length > 15)) { msg.textContent = 'Enter the WhatsApp number with country code, for example 917439658947.'; return; }
    $('#sBtn').disabled = true;
    const { error } = await sb.from('store_settings').upsert({
      id: 1,
      whatsapp: wa || null,
      phone_1: $('#sP1').value.trim() || null,
      phone_2: $('#sP2').value.trim() || null,
      contact_email: $('#sMail').value.trim() || null,
      hours_text: $('#sHours').value.trim() || null,
      announcement: $('#sAnn').value.trim() || null,
      shipping_fee: Number($('#sFee').value || 0),
      free_shipping_above: numOrNull($('#sFree').value),
      shipping_info: $('#sShip').value.trim() || null,
      returns_info: $('#sRet').value.trim() || null,
      size_guide: $('#sSize').value.trim() || null
    });
    $('#sBtn').disabled = false;
    if (error) { msg.textContent = 'Could not save: ' + error.message; return; }
    msg.className = 'msg ok';
    msg.textContent = 'Saved. The shop shows the new settings on the next page load.';
  });

  init();
})();
