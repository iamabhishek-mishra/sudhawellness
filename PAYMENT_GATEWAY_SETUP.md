# Payment Gateway Configuration Guide

This document helps you fix payment gateway errors for Sudha Wellness Webinar.

## Critical Issues Found

Your backend has **two payment gateways** configured but credentials are incomplete:
- **Razorpay** - Primary payment processor
- **PhonePe** - Alternative payment processor

---

## 1. Razorpay Configuration

### Get Your Credentials
1. Go to https://dashboard.razorpay.com/app/keys
2. **Create API Key** if you don't have one
3. Copy your **Key ID** (starts with `rzp_test_` or `rzp_live_`)
4. Copy your **Key Secret**

### Update `.env` File

```env
RAZORPAY_KEY_ID=rzp_test_XXXXXXXXXXXXXXXX
RAZORPAY_KEY_SECRET=your_secret_key_here
```

### Validate Your Setup

Frontend expects Razorpay script to be loaded. Check `index.html` line 10:
```html
<script src="https://checkout.razorpay.com/v1/checkout.js"></script>
```

**If payments fail:** 
- Verify Key ID format: must start with `rzp_test_` (sandbox) or `rzp_live_` (production)
- Check Key Secret matches in Razorpay dashboard
- Ensure CORS is enabled in your backend (already configured)

---

## 2. PhonePe Configuration

### Get Your Credentials

1. Register at https://developer.phonepe.com/
2. Create a Merchant account (or use existing one)
3. Get your:
   - **Merchant ID** (usually `MERCHANTUAT` for sandbox)
   - **Salt Key** (32-character hex string)
   - **Salt Index** (usually `1`)

### Update `.env` File

For **Testing (Sandbox)**:
```env
PHONEPE_MERCHANT_ID=MERCHANTUAT
PHONEPE_SALT_KEY=your_32_char_salt_key
PHONEPE_SALT_INDEX=1
PHONEPE_ENV=TEST
PHONEPE_AMOUNT_PAISE=9900
```

For **Production**:
```env
PHONEPE_MERCHANT_ID=your_production_merchant_id
PHONEPE_SALT_KEY=your_production_salt_key
PHONEPE_SALT_INDEX=1
PHONEPE_ENV=PROD
PHONEPE_AMOUNT_PAISE=9900
```

### Current Status

Your current config shows:
- ✅ Merchant ID: `SUDHAWELLONLINE` (looks configured)
- ❌ Salt Key: May be a demo/test value - **needs real credentials**
- ✅ Salt Index: `1` (correct)
- ✅ Env: `TEST` (good for development)

---

## 3. Frontend Payment Button Configuration

### In `app.js` (Line 12-14)

```javascript
const CONFIG = {
  RAZORPAY_KEY: 'rzp_test_REPLACE_WITH_YOUR_KEY',  // ← Update this
  VIP_AMOUNT:   9900,  // ₹99 in paise
  BACKEND_URL:  'http://localhost:3000',
};
```

**Replace with your actual Razorpay Key ID.**

---

## 4. Email Configuration Issue

Your SMTP credentials use Gmail with app password. The format looks unusual:
```env
SMTP_PASS=kadw ijcs hbzb crgu
```

**Gmail app passwords should NOT have spaces.** If this contains your real password:

1. Generate a new Gmail App Password:
   - Go to https://myaccount.google.com/apppasswords
   - Select "Mail" and "Windows Computer"
   - Copy the generated password (15 chars, no spaces)

2. Update `.env`:
   ```env
   SMTP_PASS=your_new_app_password_without_spaces
   ```

---

## 5. Common Payment Gateway Errors

### Error: "PhonePe Initiation Failed"
**Cause:** Invalid salt key or merchant ID mismatch
**Fix:** 
1. Verify `PHONEPE_SALT_KEY` from your PhonePe dashboard
2. Ensure `PHONEPE_MERCHANT_ID` matches exactly (case-sensitive)

### Error: "Razorpay Not Defined"
**Cause:** Checkout script not loading
**Fix:**
1. Verify internet connection
2. Check browser console for script load errors
3. Ensure script loads before `app.js`

### Error: "Invalid Signature"
**Cause:** API key secret doesn't match in webhook verification
**Fix:**
1. Copy secret key again from dashboard (case-sensitive)
2. Ensure no extra spaces or characters

### Error: "SMTP Connection Failed"
**Cause:** Gmail app password or credentials incorrect
**Fix:**
1. Verify SMTP_USER is your Gmail address
2. Regenerate app password at https://myaccount.google.com/apppasswords
3. Ensure SMTP_PORT=587 and SMTP_SECURE=false

---

## 6. Testing Payment Integration

### Step 1: Start Backend
```bash
cd backend
npm install
npm start
```

Should see:
```
🌿 Sudha Wellness Backend running on http://localhost:3000
💳 Payment integrations: Razorpay + PhonePe
```

### Step 2: Test Free Registration (No Payment)
1. Open http://localhost:3000
2. Select "FREE" registration
3. Fill form and submit
4. Should receive email + WhatsApp message

### Step 3: Test Razorpay Payment
1. Select "PAID (VIP)" registration
2. Click "Pay ₹99 with Razorpay"
3. Use Razorpay test card: `4111 1111 1111 1111`
4. Any future date and any CVV

### Step 4: Test PhonePe Payment
1. Select "PAID (VIP)" registration
2. Click "Pay ₹99 with PhonePe"
3. PhonePe sandbox opens
4. Complete test payment

---

## 7. Debug Checklist

Before contacting support, verify:

- [ ] Backend is running on port 3000
- [ ] `.env` file has real credentials (not placeholders)
- [ ] Razorpay Key ID starts with `rzp_test_` or `rzp_live_`
- [ ] PhonePe Salt Key is 32 characters
- [ ] SMTP credentials generate new Gmail app password
- [ ] `app.js` frontend has correct RAZORPAY_KEY
- [ ] Browser shows no console errors
- [ ] Network tab shows successful API calls

---

## 8. Next Steps

1. **Update `.env`** with real payment credentials
2. **Restart backend** server
3. **Clear browser cache** (Ctrl+Shift+Del)
4. **Test registration flow** with both payment methods
5. **Check email/WhatsApp delivery** after successful payment

---

**Questions?** Check server logs:
```bash
# Terminal output shows all payment attempts
npm start
```

Look for:
- ✅ "💳 Razorpay webhook event:"
- ✅ "📲 PhonePe webhook:"
- ✅ "📧 Email sent to..."
- ✅ "📱 Twilio WhatsApp sent to..."
