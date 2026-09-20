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

  const STATUSES = [
    ['new', 'New'], ['paid', 'Payment verified'], ['confirmed', 'Confirmed'],
    ['shipped', 'Shipped'], ['delivered', 'Delivered'], ['cancelled', 'Cancelled']
  ];
  const DEFAULT_CATS = ['T-shirt', 'Shorts', 'Watch'];
  const MAX_IMAGES = 6;

  let products = [];
  let orders = [];
  let editingId = null;
  let formImgs = [];
  let uid = null;

  /* ---------- Auth ---------- */
  async function init() {
    if (!sb) {
      $('#login').hidden = false;
      $('#loginMsg').textContent = 'Add your Supabase details in config.js first.';
      return;
    }
    const { data } = await sb.auth.getSession();
    route(data.session);
    sb.auth.onAuthStateChange((_e, session) => route(session));
  }

  function route(session) {
    $('#login').hidden = !!session;
    $('#app').hidden = !session;
    const id = session ? session.user.id : null;
    if (id === uid) return;
    uid = id;
    if (session) {
      $('#who').textContent = session.user.email;
      loadProducts();
      loadOrders();
    }
  }

  $('#loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!sb) return;
    const msg = $('#loginMsg');
    const btn = $('#loginBtn');
    msg.textContent = '';
    btn.disabled = true;
    const { error } = await sb.auth.signInWithPassword({ email: $('#email').value.trim(), password: $('#password').value });
    btn.disabled = false;
    if (error) msg.textContent = 'Email or password is incorrect.';
  });
  $('#logout').addEventListener('click', () => sb.auth.signOut());

  document.querySelectorAll('.tab').forEach((t) =>
    t.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((x) => x.setAttribute('aria-selected', String(x === t)));
      $('#tab-products').hidden = t.dataset.tab !== 'products';
      $('#tab-orders').hidden = t.dataset.tab !== 'orders';
    })
  );

  /* ---------- Products list ---------- */
  async function loadProducts() {
    const { data, error } = await sb.from('products').select('*').order('created_at', { ascending: false });
    if (error) { $('#plist').innerHTML = `<p class="empty">Products could not be loaded: ${esc(error.message)}</p>`; return; }
    products = data || [];
    renderProducts();
  }

  function renderProducts() {
    $('#plist').innerHTML = products.length
      ? products.map((p) => `
        <article class="prow">
          ${p.images && p.images[0] ? `<img src="${esc(p.images[0])}" alt="">` : '<div class="ph"></div>'}
          <div>
            <h3>${esc(p.name)}<span class="pill ${p.active ? 'live' : ''}">${p.active ? 'Visible' : 'Hidden'}</span></h3>
            <p class="muted">${esc(p.category)} · ${money(p.price)} · ${p.stock === null ? 'Unlimited stock' : `${p.stock} in stock`}</p>
          </div>
          <div class="actions">
            <button class="btn btn-sm" type="button" data-act="edit" data-id="${esc(p.id)}">Edit</button>
            <button class="btn btn-sm" type="button" data-act="toggle" data-id="${esc(p.id)}">${p.active ? 'Hide' : 'Show'}</button>
            <button class="btn btn-sm btn-danger" type="button" data-act="delete" data-id="${esc(p.id)}">Delete</button>
          </div>
        </article>`).join('')
      : '<p class="empty">No products yet. Select Add product to list your first item.</p>';
  }

  $('#plist').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const p = products.find((x) => x.id === b.dataset.id);
    if (!p) return;
    if (b.dataset.act === 'edit') openForm(p);
    if (b.dataset.act === 'toggle') {
      const { error } = await sb.from('products').update({ active: !p.active }).eq('id', p.id);
      if (error) return alert('Could not update: ' + error.message);
      loadProducts();
    }
    if (b.dataset.act === 'delete') {
      if (!confirm(`Delete "${p.name}"? This cannot be undone.`)) return;
      const { error } = await sb.from('products').delete().eq('id', p.id);
      if (error) return alert('Could not delete: ' + error.message);
      loadProducts();
    }
  });

  /* ---------- Product form ---------- */
  function openForm(p) {
    editingId = p ? p.id : null;
    formImgs = p ? [...(p.images || [])] : [];
    $('#formTitle').textContent = p ? 'Edit product' : 'Add product';
    $('#pName').value = p ? p.name : '';
    $('#pCat').value = p ? p.category : '';
    $('#pPrice').value = p ? p.price : '';
    $('#pSizes').value = p && p.sizes ? p.sizes : '';
    $('#pStock').value = p && p.stock !== null ? p.stock : '';
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
      sizes: $('#pSizes').value.trim() || null,
      stock: $('#pStock').value === '' ? null : parseInt($('#pStock').value, 10),
      description: $('#pDesc').value.trim() || null,
      images: formImgs,
      active: $('#pActive').checked
    };
    if (!payload.name || !(payload.price >= 0)) { msg.textContent = 'Enter a name and a valid price.'; return; }
    btn.disabled = true;
    const q = editingId ? sb.from('products').update(payload).eq('id', editingId) : sb.from('products').insert(payload);
    const { error } = await q;
    btn.disabled = false;
    if (error) { msg.textContent = 'Could not save: ' + error.message; return; }
    $('#formDlg').close();
    loadProducts();
  });

  /* ---------- Orders ---------- */
  async function loadOrders() {
    const { data, error } = await sb.from('orders').select('*').order('created_at', { ascending: false }).limit(200);
    if (error) { $('#olist').innerHTML = `<p class="empty">Orders could not be loaded: ${esc(error.message)}</p>`; return; }
    orders = data || [];
    renderOrders();
  }
  $('#refreshOrders').addEventListener('click', loadOrders);

  function waLink(phone) {
    let d = String(phone).replace(/\D/g, '');
    if (d.length === 10) d = '91' + d;
    return `https://wa.me/${d}`;
  }

  function renderOrders() {
    $('#olist').innerHTML = orders.length
      ? orders.map((o) => {
          const when = new Date(o.created_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
          const items = (o.items || []).map((i) => `<li>${esc(i.qty)} × ${esc(i.name)}${i.size ? ` (${esc(i.size)})` : ''} — ${money(i.price * i.qty)}</li>`).join('');
          const pay = o.payment_method === 'razorpay'
            ? `Online payment. Razorpay payment ID: ${esc(o.payment_id || 'missing')}. Check it in your Razorpay dashboard, then set the status to Payment verified.`
            : 'Ordered on WhatsApp. Payment to be arranged with the customer.';
          return `<article class="ocard">
            <div class="ohead">
              <h3>#${esc(o.id.slice(0, 6).toUpperCase())} · ${esc(o.customer_name)}</h3>
              <select data-id="${esc(o.id)}" aria-label="Order status">
                ${STATUSES.map(([v, l]) => `<option value="${v}" ${o.status === v ? 'selected' : ''}>${l}</option>`).join('')}
              </select>
            </div>
            <p class="muted">${esc(when)}</p>
            <p><a href="tel:${esc(o.phone)}">${esc(o.phone)}</a> · <a href="${esc(waLink(o.phone))}" target="_blank" rel="noopener">WhatsApp</a></p>
            <p style="white-space:pre-line">${esc(o.address)}</p>
            <ul>${items}</ul>
            <p class="otot">${money(o.total)}</p>
            <p class="pay-note">${pay}</p>
          </article>`;
        }).join('')
      : '<p class="empty">No orders yet. New orders will show up here.</p>';
  }

  $('#olist').addEventListener('change', async (e) => {
    const s = e.target.closest('select[data-id]');
    if (!s) return;
    const { error } = await sb.from('orders').update({ status: s.value }).eq('id', s.dataset.id);
    if (error) { alert('Could not update status: ' + error.message); loadOrders(); }
  });

  init();
})();
