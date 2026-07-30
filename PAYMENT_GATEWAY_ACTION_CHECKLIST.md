# 📋 Payment Gateway Fix - Action Checklist

## Current Status
❌ **Payment Gateway Down** - 3 critical issues identified and documented

---

## 🎯 Your Action Items (Complete in 10 minutes)

### ✅ STEP 1: Get Razorpay Credentials (3 min)

**Do this:**
- [ ] Open https://dashboard.razorpay.com/app/keys in your browser
- [ ] Log in with your Razorpay account
- [ ] Look for API Keys section
- [ ] **Copy Key ID** (looks like: `rzp_test_XXXXXXXXXXXXX`)
- [ ] **Copy Key Secret** (long random string)

**Note down:**
- Key ID: `_________________________________`
- Key Secret: `_________________________________`

---

### ✅ STEP 2: Get Gmail App Password (3 min)

**Do this:**
- [ ] Open https://myaccount.google.com/apppasswords
- [ ] You may need to enable 2-factor auth first
- [ ] Select App: **Mail** and Device: **Windows Computer**
- [ ] Click Generate
- [ ] Google shows a 16-character password **WITHOUT spaces**
- [ ] **Copy the entire password** (it might show with spaces, but copy the no-space version)

**Note down:**
- Gmail app password: `_________________________________`

**⚠️ Important:** The password should have NO SPACES like: `abcdefghijklmnop`

---

### ✅ STEP 3: Update `.env` File (2 min)

**Edit this file:** `/Users/abhishekmishra/Webiner/webinar/backend/.env`

**Find and replace these lines:**

```env
# ---- RAZORPAY ----
RAZORPAY_KEY_ID=PASTE_YOUR_KEY_ID_HERE
RAZORPAY_KEY_SECRET=PASTE_YOUR_KEY_SECRET_HERE
```

```env
# ---- EMAIL — SMTP ----
SMTP_PASS=PASTE_YOUR_GMAIL_APP_PASSWORD_HERE
```

```env
# ---- PHONEPE ----
PHONEPE_SALT_KEY=4d1aca6e529847d2b93b59baf21ce237
```

**After edit, the file should look like:**
```env
PORT=3000
APP_PUBLIC_URL=http://localhost:3000
ADMIN_KEY=your_secret_admin_key_here

RAZORPAY_KEY_ID=rzp_test_YourRealKeyId
RAZORPAY_KEY_SECRET=YourRealKeySecret

PHONEPE_MERCHANT_ID=SUDHAWELLONLINE
PHONEPE_SALT_KEY=4d1aca6e529847d2b93b59baf21ce237
PHONEPE_SALT_INDEX=1
PHONEPE_ENV=TEST
PHONEPE_AMOUNT_PAISE=9900

TWILIO_ACCOUNT_SID=<REDACTED>
TWILIO_AUTH_TOKEN=4389f453c58c953e41095cc175a39ec9
TWILIO_WHATSAPP_FROM=whatsapp:+917291897879

SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=mishraabhishek9500@gmail.com
SMTP_PASS=YourGmailAppPassword
EMAIL_FROM=Sudha Wellness <mishraabhishek9500@gmail.com>

MEET_LINK=https://meet.google.com/kpc-doyj-bzm
WEBINAR_DATE_STR=Tuesday, 21st July 2026 at 7:00 PM IST
```

**✅ Save the file**

---

### ✅ STEP 4: Validate Configuration (1 min)

**Run this in terminal:**
```bash
cd /Users/abhishekmishra/Webiner/webinar/backend
node check-payment-config.js
```

**Expected output:**
```
🟢 NO CRITICAL ISSUES FOUND
```

**If you see ❌ CRITICAL ISSUES:**
- Review which issues remain
- Go back to STEP 1 or 2
- Paste the correct credentials again

---

### ✅ STEP 5: Restart Backend (1 min)

**Kill existing process:**
- Press `Ctrl+C` if backend is running

**Start fresh:**
```bash
npm start
```

**Expected output:**
```
🌿 Sudha Wellness Backend running on http://localhost:3000
📡 Webinar registration API ready
💳 Payment integrations: Razorpay + PhonePe
📧 Email provider: SMTP configured
📱 WhatsApp provider: Twilio
```

✅ **All green?** Backend is ready!

---

## 🧪 Testing After Fix

### Test 1: Free Registration (2 min)
```
1. Open http://localhost:3000
2. Fill form:
   - Name: Test User
   - WhatsApp: 9000000000 (any 10 digits)
   - Email: test@example.com
   - Goal: Any answer
3. Select "FREE" option
4. Click Submit button
5. ✅ Should see success modal
6. ✅ Check your email - should have meet link
```

### Test 2: Razorpay Payment (3 min)
```
1. Open http://localhost:3000
2. Fill same form as Test 1
3. Select "PAID (VIP - ₹99)" option
4. Click "Pay ₹99 with Razorpay" button
5. Modal opens with checkout form
6. Enter test card: 4111 1111 1111 1111
7. Enter any future date (e.g., 12/25)
8. Enter any CVV (e.g., 123)
9. Click PAY
10. ✅ Should see success message
11. ✅ Check your email - should have meet link
```

### Test 3: PhonePe Payment (2 min)
```
1. Open http://localhost:3000
2. Fill same form as Test 1
3. Select "PAID (VIP - ₹99)" option
4. Click "Pay ₹99 with PhonePe" button
5. PhonePe sandbox page opens
6. Complete test transaction
7. ✅ Redirects back to site
8. ✅ Should see success modal
9. ✅ Check your email - should have meet link
```

---

## 🐛 If Tests Fail

### Free Registration doesn't send email?
- [ ] Check if SMTP_PASS has spaces (it shouldn't)
- [ ] Go to Gmail account → Security → Check for "Unusual activity"
- [ ] Try signing in manually to verify credentials work
- [ ] Check backend terminal for error messages

### Razorpay button doesn't open checkout?
- [ ] Refresh page (clear cache: Ctrl+Shift+Del)
- [ ] Check browser console (F12) for script load errors
- [ ] Verify Razorpay script loads: look for "checkout.razorpay.com"
- [ ] Check RAZORPAY_KEY starts with "rzp_test_"

### PhonePe payment fails?
- [ ] Check backend terminal output
- [ ] Verify PHONEPE_MERCHANT_ID (case-sensitive)
- [ ] Verify PHONEPE_SALT_KEY is exactly 32 hex chars
- [ ] Check APP_PUBLIC_URL is set correctly

---

## 📊 Quick Status Check

Run this command anytime to verify everything:
```bash
cd backend
node check-payment-config.js
```

Will show:
- ✅ All configured services
- ⚠️ Any warnings
- ❌ Any critical issues

---

## 🚀 When Everything is Working

**You'll have:**
- ✅ Free registrations sending meet links instantly
- ✅ Razorpay payments working
- ✅ PhonePe payments working
- ✅ Email confirmations sent
- ✅ WhatsApp messages sent
- ✅ Admin panel showing all registrations
- ✅ Payment history tracking

---

## 📞 If Still Stuck

### Check These Resources:
- **Razorpay docs:** https://razorpay.com/docs/
- **PhonePe docs:** https://developer.phonepe.com/docs
- **Gmail app passwords:** https://support.google.com/accounts/answer/185833

### Share This Info with Support:
```
Backend status:
npm start output: [copy from terminal]

Validation check:
node check-payment-config.js output: [copy output]

Error details:
Browser console error (F12): [any red errors]
Backend terminal error: [any error messages]
```

---

## ✨ Expected Timeline

| Step | Time | Status |
|------|------|--------|
| Get Razorpay creds | 3 min | ⏳ TODO |
| Get Gmail password | 3 min | ⏳ TODO |
| Update .env | 2 min | ⏳ TODO |
| Run validation | 1 min | ⏳ TODO |
| Restart backend | 1 min | ⏳ TODO |
| Test flows | 7 min | ⏳ TODO |
| **TOTAL** | **~17 min** | ⏳ TODO |

---

**Start with Step 1 → You've got this! 🚀**
