# Cocoa Luxury store: update to version 2

You already set up Supabase, GitHub and Netlify. This update keeps your products and your `config.js`.

## 1. Update the database (2 minutes)
1. Supabase > **SQL Editor** > **New query**.
2. Open `upgrade.sql`, copy everything, paste it, press **Run**. It is safe to run twice.

## 2. Update the website files
1. Open your repository on GitHub > **Add file** > **Upload files**.
2. Drag in these files (do NOT upload `config.js` or `config.example.js`, so your settings stay):
   `index.html`, `admin.html`, `shop.js`, `admin.js`, `theme.css`, `upgrade.sql`, `setup.sql`, `README.md`
3. Click **Commit changes**. Netlify updates the site in about a minute.

## 3. Admin login
Open `your-site.netlify.app/admin.html`.
- If you forgot the password: press **Forgot password?**. First set your site address in Supabase > **Authentication > URL Configuration**: put your Netlify link in **Site URL** and add `https://your-site.netlify.app/admin.html` under **Redirect URLs**.
- If it says the account is not confirmed: Supabase > **Authentication > Users**, open your user and confirm it.

## New in the shop
Search and sort, saved items (heart), sale prices with % off, "Only few left" notices, image zoom, size guide, delivery and returns info, related products, shareable product links, Buy now, discount codes, delivery fee with free-delivery target, announcement bar, WhatsApp chat button, order tracking for customers, and prices checked on the server so they cannot be changed in the browser.

## New in the admin
Overview page (new orders, sales, low stock), sale price and duplicate product, product and order search, order status filter, courier or tracking note that customers see, CSV download of orders, discount codes, and store settings (delivery fee, announcement, policies). Cancelling an order puts its items back into stock.

## Check before you go live
- The delivery, returns and size guide texts in **Store settings** are sample text. Replace them with your real policy.
- For every online payment, compare the Razorpay payment ID with your Razorpay dashboard before shipping, then set the order to "Payment verified".
- If a customer starts an online payment and does not finish, the order shows "Awaiting payment". Cancel it to return the items to stock.
