# ⚡ Quick Fix for Payment Gateway Error

## Issues Found

Your payment gateway has **3 critical errors** preventing payments:

### 1. ❌ Razorpay Key Not Configured
**Problem:** Placeholder value found
```
RAZORPAY_KEY_ID=rzp_test_REPLACE_WITH_YOUR_KEY_ID  ← PLACEHOLDER
RAZORPAY_KEY_SECRET still has placeholder value
```

**Fix:** Get real credentials from [Razorpay Dashboard](https://dashboard.razorpay.com/app/keys)
- Log in to your Razorpay account
- Go to Settings → API Keys
- Copy your **Key ID** (looks like: `rzp_test_XXXXXXXXXXXXX`)
- Copy your **Key Secret**
- Update `.env`:
```env
RAZORPAY_KEY_ID=rzp_test_YOUR_ACTUAL_KEY_HERE
RAZORPAY_KEY_SECRET=YOUR_ACTUAL_SECRET_HERE
```

---

### 2. ❌ Gmail App Password Has Spaces
**Problem:** 
```
SMTP_PASS=kadw ijcs hbzb crgu  ← CONTAINS SPACES (WRONG FORMAT)
```

**Fix:** Generate a new Gmail App Password:
1. Go to [Gmail Security](https://myaccount.google.com/apppasswords)
2. Select App: **Mail** | Device: **Windows Computer** (or your device)
3. Google generates a 16-character password **WITHOUT SPACES**
4. Copy it and update `.env`:
```env
SMTP_PASS=your16charpasswordhere  ← NO SPACES
```

---

### 3. ⚠️ PhonePe Salt Key Length Issue (Minor Warning)
**Current:** 36 characters (should be 32)
```
PHONEPE_SALT_KEY=4d1aca6e-5298-47d2-b93b-59baf21ce237  ← 36 chars with hyphens
```

**Fix:** Remove hyphens or get correct 32-char key:
```env
PHONEPE_SALT_KEY=4d1aca6e529847d2b93b59baf21ce237  ← 32 chars without hyphens
```

Or get the correct value from [PhonePe Developer Dashboard](https://developer.phonepe.com/)

---

## Step-by-Step Fix (5 minutes)

### Step 1: Get Razorpay Keys
1. Open [Razorpay Dashboard](https://dashboard.razorpay.com/app/keys) in your browser
2. Login to your account
3. Under API Keys section, copy:
   - **Key ID** (e.g., `rzp_test_123abc456def`)
   - **Key Secret** (e.g., `AbC123xYz789`)

### Step 2: Get Gmail App Password
1. Open [Google Account Security](https://myaccount.google.com/apppasswords)
2. Select: **App** → Mail, **Device** → Your Device
3. Google shows a 16-char password like: `abcd efgh ijkl mnop`
4. Copy it (the version without spaces might show when you select it)

### Step 3: Update `.env` File

Open `/Users/abhishekmishra/Webiner/webinar/backend/.env` and update:

```env
# ---- RAZORPAY ----
RAZORPAY_KEY_ID=rzp_test_PASTE_YOUR_KEY_ID_HERE
RAZORPAY_KEY_SECRET=PASTE_YOUR_KEY_SECRET_HERE

# ---- PHONEPE ----
PHONEPE_MERCHANT_ID=SUDHAWELLONLINE
PHONEPE_SALT_KEY=4d1aca6e529847d2b93b59baf21ce237
PHONEPE_SALT_INDEX=1
PHONEPE_ENV=TEST
PHONEPE_AMOUNT_PAISE=9900

# ---- EMAIL — SMTP ----
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=mishraabhishek9500@gmail.com
SMTP_PASS=PASTE_YOUR_GMAIL_APP_PASSWORD_HERE_NO_SPACES
EMAIL_FROM=Sudha Wellness <mishraabhishek9500@gmail.com>
```

### Step 4: Verify Configuration
Run the validation check:
```bash
cd backend
node check-payment-config.js
```

You should see: **🟢 NO CRITICAL ISSUES FOUND**

### Step 5: Restart Backend
```bash
npm start
```

Expected output:
```
🌿 Sudha Wellness Backend running on http://localhost:3000
💳 Payment integrations: Razorpay + PhonePe
📧 Email provider: SMTP configured
📱 WhatsApp provider: Twilio
```

---

## Testing Payment Gateway

Once configured, test the flow:

### Test 1: Free Registration (No Payment)
1. Open http://localhost:3000
2. Fill form and select **"FREE"** registration
3. Click Submit
4. Should get confirmation page
5. Check your email for meet link (should arrive within seconds)

### Test 2: Razorpay Payment
1. Select **"PAID (VIP)"** registration  
2. Click **"Pay ₹99 with Razorpay"**
3. Use test card: `4111 1111 1111 1111`
4. Any future date + any CVV
5. Should complete and show success

### Test 3: PhonePe Payment
1. Select **"PAID (VIP)"** registration
2. Click **"Pay ₹99 with PhonePe"**
3. PhonePe sandbox opens
4. Complete the test transaction

---

## If You Still Get Errors

### Error: "Razorpay not defined"
- Clear browser cache (Ctrl+Shift+Del)
- Refresh the page
- Check network tab in DevTools for script load errors

### Error: "PhonePe Initiation Failed"  
- Verify PHONEPE_MERCHANT_ID matches exactly (case-sensitive)
- Verify PHONEPE_SALT_KEY is exactly 32 characters
- Check backend console for error details

### Error: "Email not sent"
- Verify SMTP_USER is your Gmail address
- Verify SMTP_PASS has NO SPACES
- Check if Gmail blocked the login (check Gmail Security log)
- Enable "Less secure app access" if needed

### Error: "WhatsApp message failed"
- Verify Twilio credentials are correct
- Check if Twilio sandbox is active
- Try restarting backend

---

## Files Updated

- ✅ `.env` - Updated with correct structure
- ✅ `check-payment-config.js` - Validation tool added
- ✅ `PAYMENT_GATEWAY_SETUP.md` - Full setup guide created

---

**Next:** Update your credentials and run `node check-payment-config.js` again!
