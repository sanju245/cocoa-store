# Cocoa Luxury store: setup (about 15 minutes, no terminal)

## 1. Create the database (Supabase, free)
1. Sign up at supabase.com and create a new project.
2. Open **SQL Editor > New query**, paste everything from `setup.sql`, press **Run**.
3. Open **Authentication > Users > Add user > Create new user**. Enter your email and a strong password. Tick **Auto Confirm User**. This is your admin login.
4. Open **Authentication > Sign In / Providers** and turn **off** "Allow new users to sign up". This keeps strangers from creating accounts.
5. Open **Project Settings > API**. Copy the **Project URL** and the **anon public key**.

## 2. Fill in `config.js`
- `SUPABASE_URL` and `SUPABASE_ANON_KEY`: from step 1.5.
- `WHATSAPP_NUMBER`: country code plus number, digits only (example `919876543210`).
- `RAZORPAY_KEY_ID`: from Razorpay dashboard > Account & Settings > API Keys. Start with the test key (`rzp_test_...`). Leave empty to hide online payment.

## 3. Put it online
- Netlify: go to app.netlify.com/drop and drag the whole folder in. Or upload the folder to a Vercel project.
- Shop: `your-site.netlify.app`
- Admin: `your-site.netlify.app/admin.html`

## 4. Add products
Sign in at `/admin.html`, select **Add product**, upload photos, set the price and sizes, and save. Orders appear in the **Orders** tab.

## Good to know
- Online payments are not verified by a server. For every order with a Razorpay payment ID, check the payment in your Razorpay dashboard before you ship, then set the order to "Payment verified".
- The order total is calculated in the shopper's browser. Always compare it with the price you listed and the amount Razorpay shows.
- Stock is not reduced automatically. Update it in the admin page when items sell.
- Switch to the live Razorpay key only after a successful test payment.
