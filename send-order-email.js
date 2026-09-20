// Sends the "Thank you for shopping" email for an order.
// The browser only sends the order ID. Everything else (recipient, items, prices)
// is read from the database here, so nobody can use this to send arbitrary email.
//
// Netlify environment variables needed:
//   SUPABASE_URL          your project URL (same as in config.js)
//   SUPABASE_SERVICE_KEY  Supabase > Project Settings > API > service_role key (secret)
//   GMAIL_USER            cocoaluxury2026@gmail.com
//   GMAIL_APP_PASSWORD    16-character Google app password
const nodemailer = require('nodemailer');

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body)
});

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n) => '₹' + Number(n).toLocaleString('en-IN');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function buildEmail(order, settings, siteUrl, storeName) {
  const short = order.id.slice(0, 6).toUpperCase();
  const first = String(order.customer_name || '').trim().split(/\s+/)[0] || 'there';
  const paid = order.payment_method === 'razorpay' && order.payment_id;
  const payLine = paid
    ? 'Paid online. Thank you, your payment has been received.'
    : 'We will confirm the payment details with you on WhatsApp.';
  const items = Array.isArray(order.items) ? order.items : [];
  const wa = String(settings.whatsapp || '').replace(/\D/g, '');
  const phones = [settings.phone_1, settings.phone_2].filter(Boolean);
  const contactEmail = settings.contact_email || '';
  const hours = settings.hours_text || '';
  const trackUrl = siteUrl ? `${siteUrl}/#track` : '';
  const logoUrl = siteUrl ? `${siteUrl}/logo.png` : '';

  const serif = "Georgia,'Times New Roman',serif";
  const sans = "'Helvetica Neue',Helvetica,Arial,sans-serif";
  const rows = items.map((i) => `
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid #e0d3bf;font:15px ${sans};color:#34200f;">${esc(i.name)}${i.size ? `<br><span style="color:#6d5a48;font-size:13px;">Size ${esc(i.size)}</span>` : ''}</td>
      <td style="padding:10px 8px;border-bottom:1px solid #e0d3bf;font:15px ${sans};color:#6d5a48;text-align:center;">${esc(i.qty)}</td>
      <td style="padding:10px 0;border-bottom:1px solid #e0d3bf;font:15px ${sans};color:#34200f;text-align:right;">${money(i.price * i.qty)}</td>
    </tr>`).join('');
  const line = (label, value) => `
    <tr><td colspan="2" style="padding:4px 0;font:15px ${sans};color:#6d5a48;">${label}</td>
    <td style="padding:4px 0;font:15px ${sans};color:#34200f;text-align:right;">${value}</td></tr>`;

  const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:#ede5da;">
<div style="display:none;max-height:0;overflow:hidden;">Thank you for shopping with ${esc(storeName)}. Your order #${short} is confirmed.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ede5da;">
<tr><td align="center" style="padding:28px 12px;">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#f6f0e7;border:1px solid #d9c7a4;">
    <tr><td align="center" style="padding:34px 24px 10px;">
      ${logoUrl ? `<img src="${esc(logoUrl)}" alt="${esc(storeName)}" width="170" style="display:block;width:170px;height:auto;border:0;">` : `<div style="font:28px ${serif};color:#6a4325;">${esc(storeName)}</div>`}
    </td></tr>
    <tr><td align="center" style="padding:6px 24px 0;"><div style="width:84px;height:2px;background:#b8934c;line-height:2px;font-size:2px;">&nbsp;</div></td></tr>
    <tr><td style="padding:26px 34px 6px;">
      <div style="font:600 30px/1.2 ${serif};color:#34200f;">Thank you for shopping with us</div>
      <p style="margin:14px 0 0;font:16px/1.6 ${sans};color:#34200f;">Hi ${esc(first)}, thank you for your order. We are getting it ready and will keep you updated on WhatsApp.</p>
    </td></tr>
    <tr><td style="padding:18px 34px 0;">
      <div style="border:1px solid #b8934c;padding:12px 16px;font:15px ${sans};color:#34200f;">Order number <strong style="font:600 20px ${serif};color:#6a4325;">#${short}</strong></div>
    </td></tr>
    <tr><td style="padding:22px 34px 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding:0 0 8px;border-bottom:1px solid #b8934c;font:600 13px ${sans};color:#6d5a48;">Item</td>
          <td style="padding:0 8px 8px;border-bottom:1px solid #b8934c;font:600 13px ${sans};color:#6d5a48;text-align:center;">Qty</td>
          <td style="padding:0 0 8px;border-bottom:1px solid #b8934c;font:600 13px ${sans};color:#6d5a48;text-align:right;">Price</td>
        </tr>
        ${rows}
        <tr><td colspan="3" style="height:8px;"></td></tr>
        ${Number(order.subtotal) ? line('Subtotal', money(order.subtotal)) : ''}
        ${Number(order.discount) > 0 ? line(`Discount${order.coupon_code ? ` (${esc(order.coupon_code)})` : ''}`, `&minus;${money(order.discount)}`) : ''}
        ${line('Delivery', Number(order.shipping) > 0 ? money(order.shipping) : 'Free')}
        <tr><td colspan="2" style="padding:12px 0 0;border-top:1px solid #b8934c;font:600 18px ${serif};color:#34200f;">Total</td>
        <td style="padding:12px 0 0;border-top:1px solid #b8934c;font:600 22px ${serif};color:#6a4325;text-align:right;">${money(order.total)}</td></tr>
      </table>
    </td></tr>
    <tr><td style="padding:22px 34px 0;">
      <div style="font:600 13px ${sans};color:#6d5a48;">Payment</div>
      <p style="margin:4px 0 0;font:15px/1.6 ${sans};color:#34200f;">${esc(payLine)}</p>
      <div style="margin-top:16px;font:600 13px ${sans};color:#6d5a48;">Delivering to</div>
      <p style="margin:4px 0 0;font:15px/1.6 ${sans};color:#34200f;">${esc(order.customer_name)}<br>${esc(order.address).replace(/\n/g, '<br>')}<br>${esc(order.phone)}</p>
    </td></tr>
    ${trackUrl ? `<tr><td align="center" style="padding:28px 34px 0;">
      <a href="${esc(trackUrl)}" style="display:inline-block;background:#4a2d1a;border:1px solid #b8934c;color:#f6efe4;text-decoration:none;font:500 15px ${sans};letter-spacing:0.04em;padding:14px 30px;">Track your order</a>
      <p style="margin:10px 0 0;font:13px ${sans};color:#6d5a48;">Use order number #${short} and the phone number you gave us.</p>
    </td></tr>` : ''}
    <tr><td style="padding:30px 34px 32px;">
      <p style="margin:0;font:16px/1.6 ${sans};color:#34200f;">Thank you for choosing ${esc(storeName)}. We hope you love it.</p>
      <p style="margin:12px 0 0;font:italic 18px ${serif};color:#6a4325;">With thanks,<br>${esc(storeName)}</p>
    </td></tr>
    <tr><td align="center" style="background:#33200f;padding:22px 24px;font:14px/1.7 ${sans};color:#e8d9bd;">
      <div style="font:600 17px ${serif};color:#dcbb75;margin-bottom:6px;">Need help?</div>
      ${wa ? `WhatsApp: <a href="https://wa.me/${esc(wa)}" style="color:#dcbb75;">+${esc(wa.slice(0, 2))} ${esc(wa.slice(2, 7))} ${esc(wa.slice(7))}</a><br>` : ''}
      ${phones.length ? `Call: ${phones.map((p) => esc(p)).join(' or ')}<br>` : ''}
      ${contactEmail ? `Email: <a href="mailto:${esc(contactEmail)}" style="color:#dcbb75;">${esc(contactEmail)}</a><br>` : ''}
      ${hours ? esc(hours) : ''}
    </td></tr>
  </table>
</td></tr></table>
</body></html>`;

  const text = [
    `Thank you for shopping with ${storeName}`,
    '',
    `Hi ${first}, thank you for your order #${short}. We are getting it ready and will keep you updated on WhatsApp.`,
    '',
    ...items.map((i) => `${i.qty} x ${i.name}${i.size ? ` (${i.size})` : ''} - ${money(i.price * i.qty)}`),
    Number(order.discount) > 0 ? `Discount: -${money(order.discount)}` : '',
    `Delivery: ${Number(order.shipping) > 0 ? money(order.shipping) : 'Free'}`,
    `Total: ${money(order.total)}`,
    '',
    `Payment: ${payLine}`,
    `Delivering to: ${order.customer_name}, ${order.address}, ${order.phone}`,
    trackUrl ? `\nTrack your order: ${trackUrl} (order number #${short})` : '',
    '',
    `Need help? ${[wa ? `WhatsApp +${wa}` : '', phones.join(' or '), contactEmail, hours].filter(Boolean).join(' | ')}`,
    '',
    `With thanks, ${storeName}`
  ].filter((l, i, a) => l !== '' || a[i - 1] !== '').join('\n');

  return { subject: `Thank you for shopping with ${storeName} - order #${short}`, html, text };
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { ok: false, message: 'Use POST.' });

  const { SUPABASE_URL, SUPABASE_SERVICE_KEY, GMAIL_USER, GMAIL_APP_PASSWORD } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !GMAIL_USER || !GMAIL_APP_PASSWORD) {
    return json(500, { ok: false, message: 'Email is not set up yet. Add the four settings in Netlify environment variables.' });
  }

  let payload;
  try { payload = JSON.parse(event.body || '{}'); } catch { return json(400, { ok: false, message: 'Bad request.' }); }
  const { orderId, resend, token } = payload;
  if (!UUID.test(String(orderId || ''))) return json(400, { ok: false, message: 'Bad order id.' });

  const base = SUPABASE_URL.replace(/\/+$/, '');
  const rest = (path, opts = {}) =>
    fetch(`${base}/rest/v1/${path}`, {
      ...opts,
      headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`, 'Content-Type': 'application/json', ...(opts.headers || {}) }
    });

  try {
    // A resend must come from the signed-in admin.
    if (resend) {
      const r = await fetch(`${base}/auth/v1/user`, { headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${String(token || '')}` } });
      if (!r.ok) return json(401, { ok: false, message: 'Please sign in to the admin again.' });
    }

    const res = await rest(`orders?id=eq.${orderId}&select=*`);
    const rows = res.ok ? await res.json() : [];
    const order = rows[0];
    if (!order) return json(404, { ok: false, message: 'Order not found.' });
    if (!order.email) return json(200, { ok: true, skipped: true, message: 'This order has no email address.' });
    if (order.payment_method === 'razorpay' && !order.payment_id) {
      return json(200, { ok: true, skipped: true, message: 'Online payment is not completed yet, so no email was sent.' });
    }
    if (!resend) {
      if (Date.now() - new Date(order.created_at).getTime() > 6 * 3600 * 1000) {
        return json(200, { ok: true, skipped: true, message: 'This order is too old for an automatic email.' });
      }
      // Claim the order so the email is sent only once, even if the page calls twice.
      const claim = await rest(`orders?id=eq.${orderId}&email_sent_at=is.null`, {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ email_sent_at: new Date().toISOString() })
      });
      const claimed = claim.ok ? await claim.json() : [];
      if (!claimed.length) return json(200, { ok: true, skipped: true, message: 'Email was already sent.' });
    }

    const sres = await rest('store_settings?id=eq.1&select=*');
    const settings = ((sres.ok && (await sres.json())) || [])[0] || {};
    const storeName = process.env.STORE_NAME || 'Cocoa Luxury';
    const siteUrl = (process.env.SITE_URL || process.env.URL || '').replace(/\/+$/, '');
    const mail = buildEmail(order, settings, siteUrl, storeName);

    try {
      const transporter = nodemailer.createTransport({ service: 'gmail', auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD } });
      await transporter.sendMail({
        from: `"${storeName}" <${GMAIL_USER}>`,
        to: order.email,
        replyTo: settings.contact_email || GMAIL_USER,
        subject: mail.subject,
        html: mail.html,
        text: mail.text
      });
    } catch (err) {
      if (!resend) await rest(`orders?id=eq.${orderId}`, { method: 'PATCH', body: JSON.stringify({ email_sent_at: null }) });
      console.error('Mail error:', err && err.message);
      return json(502, { ok: false, message: 'The email could not be sent. Check the Gmail settings in Netlify.' });
    }

    if (resend) await rest(`orders?id=eq.${orderId}`, { method: 'PATCH', body: JSON.stringify({ email_sent_at: new Date().toISOString() }) });
    return json(200, { ok: true, message: `Thank-you email sent to ${order.email}.` });
  } catch (err) {
    console.error('Function error:', err && err.message);
    return json(500, { ok: false, message: 'Something went wrong while sending the email.' });
  }
};

exports.buildEmail = buildEmail;
