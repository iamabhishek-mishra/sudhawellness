# 🔧 PhonePe Payment Gateway - Troubleshooting Guide

## What Was Fixed

Your PhonePe salt key had **hyphens** (invalid):
```env
# ❌ BEFORE (36 chars with hyphens - INVALID)
PHONEPE_SALT_KEY=4d1aca6e-5298-47d2-b93b-59baf21ce237

# ✅ AFTER (32 hex chars - VALID)
PHONEPE_SALT_KEY=4d1aca6e529847d2b93b59baf21ce237
```

This has been fixed in your `.env` file.

---

## Common PhonePe Errors & Solutions

### Error 1: "PhonePe Initiation Failed"

**Possible Causes:**

1. **Invalid Merchant ID**
   ```
   Error: Invalid merchant ID
   ```
   - Check: PHONEPE_MERCHANT_ID must be exactly `SUDHAWELLONLINE` (case-sensitive)
   - Fix: 
   ```env
   PHONEPE_MERCHANT_ID=SUDHAWELLONLINE
   ```

2. **Invalid Salt Key**
   ```
   Error: Invalid signature / checksum failed
   ```
   - Check: PHONEPE_SALT_KEY must be exactly 32 hex characters (no hyphens)
   - Fix:
   ```env
   PHONEPE_SALT_KEY=4d1aca6e529847d2b93b59baf21ce237
   ```

3. **Wrong Environment**
   ```
   Error: Endpoint not found / Invalid URL
   ```
   - For testing: Use TEST
   ```env
   PHONEPE_ENV=TEST
   # Hits: https://api-preprod.phonepe.com/apis/pg-sandbox
   ```
   - For production: Use PROD
   ```env
   PHONEPE_ENV=PROD
   # Hits: https://api.phonepe.com/apis/hermes
   ```

4. **Missing Amount**
   ```
   Error: Invalid amount / Amount must be in paise
   ```
   - Check: PHONEPE_AMOUNT_PAISE must be a number (in paise, not rupees)
   - Current setup: 9900 paise = ₹99
   ```env
   PHONEPE_AMOUNT_PAISE=9900
   ```

---

### Error 2: "Invalid Signature / Checksum Failed"

**Root Cause:** Checksum verification failed at PhonePe backend

**Fix:**
1. Verify salt key is exactly 32 characters:
   ```bash
   echo "PHONEPE_SALT_KEY" | wc -c
   # Should output: 33 (32 chars + newline)
   ```

2. Check no extra spaces in `.env`:
   ```env
   PHONEPE_SALT_KEY=4d1aca6e529847d2b93b59baf21ce237  # ✅ NO SPACES
   ```

3. Restart backend after fixing:
   ```bash
   npm start
   ```

---

### Error 3: "Payment Redirect Failed"

**Symptoms:** PhonePe page shows error, doesn't open payment gateway

**Causes & Fixes:**

1. **Invalid redirectUrl**
   - Backend sends callback URL to PhonePe
   - PhonePe redirects back to: `http://localhost:3000/api/payment/phonepe/callback`
   - Fix: Verify APP_PUBLIC_URL in .env:
   ```env
   APP_PUBLIC_URL=http://localhost:3000
   ```

2. **Wrong merchant transaction ID format**
   - Backend generates: `SUDHA_` + timestamp
   - Example: `SUDHA_1720000000000`
   - Fix: This is automatic, no action needed

3. **Network/CORS issue**
   - Backend can't reach PhonePe API
   - Check: Backend internet connection works
   - Test:
   ```bash
   curl -X GET https://api-preprod.phonepe.com/apis/pg-sandbox/pg/v1/status/SUDHAWELLONLINE/test
   ```

---

### Error 4: "Webhook Signature Verification Failed"

**When:** After payment, backend receives webhook from PhonePe

**Cause:** Salt key mismatch or invalid X-VERIFY header

**Fix:**
1. Check salt key matches exactly:
   ```bash
   grep PHONEPE_SALT_KEY backend/.env
   # Should output: PHONEPE_SALT_KEY=4d1aca6e529847d2b93b59baf21ce237
   ```

2. Check salt index:
   ```env
   PHONEPE_SALT_INDEX=1
   ```

3. Backend logs should show:
   ```
   📲 PhonePe webhook: PAYMENT_SUCCESS
   ```

---

### Error 5: "Transaction Not Found / Invalid Transaction"

**When:** Trying to check payment status after redirect

**Cause:** 
- Transaction ID doesn't exist
- Status check called too early
- Network delay

**Fix:**
1. Wait 2-3 seconds after payment completes
2. Check merchant transaction ID matches:
   ```
   Initiated: SUDHA_1720000000000
   Callback: Should receive same ID
   ```

3. If still failing, check backend logs:
   ```bash
   npm start
   # Look for: 📲 PhonePe webhook:
   ```

---

## Testing PhonePe Integration

### Test 1: Sandbox Payment (Recommended First)
```
1. Open http://localhost:3000
2. Fill registration form
3. Select "PAID (VIP - ₹99)"
4. Click "Pay ₹99 with PhonePe"
5. PhonePe sandbox opens
6. Complete test transaction
7. Should redirect back to site
8. Should see success modal
9. Email should arrive with meet link
```

### Test 2: Check Backend Logs
```bash
npm start
# Should show:
# 💳 Payment integrations: Razorpay + PhonePe
# 📲 PhonePe webhook: PAYMENT_SUCCESS
# ✅ PhonePe payment success for +919876543210
```

### Test 3: Verify Signature Validation
```
Backend validates PhonePe webhook using:
- PHONEPE_MERCHANT_ID (your merchant ID)
- PHONEPE_SALT_KEY (32-char hex key)
- PHONEPE_SALT_INDEX (usually 1)

If X-VERIFY header invalid → signature verification fails
```

---

## PhonePe Sandbox Testing

**Test Merchant ID:** `SUDHAWELLONLINE`
**Test Environment:** `TEST` (api-preprod.phonepe.com)
**Test Amount:** 9900 paise (₹99)

### Available Test Transactions:
```
✓ Successful payment
✓ Failed payment  
✓ Pending payment
✓ Timeout
```

### Important Notes:
- Sandbox doesn't actually debit money
- Payments complete instantly in test
- Use for development/testing only
- Switch to PROD and real credentials for live

---

## Diagnostic Checklist

Before troubleshooting, verify these:

```
Basic Setup:
  ✅ PHONEPE_MERCHANT_ID = SUDHAWELLONLINE
  ✅ PHONEPE_SALT_KEY = 4d1aca6e529847d2b93b59baf21ce237 (exactly)
  ✅ PHONEPE_SALT_INDEX = 1
  ✅ PHONEPE_ENV = TEST (for development)
  ✅ PHONEPE_AMOUNT_PAISE = 9900

Backend:
  ✅ Backend running: npm start
  ✅ Port 3000 accessible: http://localhost:3000
  ✅ APP_PUBLIC_URL = http://localhost:3000

Network:
  ✅ Internet connection working
  ✅ Can reach: api-preprod.phonepe.com (TEST)
  ✅ Firewall not blocking PhonePe domains

Frontend:
  ✅ No browser console errors (F12 → Console)
  ✅ Page loads without errors
  ✅ Payment button clickable

After Payment:
  ✅ Callback URL correct
  ✅ Email sends with meet link
  ✅ Registration saved in admin panel
```

---

## Getting Help

### Check Backend Logs First
```bash
npm start
# Look for error messages with context
# All PhonePe errors printed to console
```

### Check Browser Console
```
Press F12 → Console tab
Look for:
- Network errors (red)
- PhonePe script loading issues
- JavaScript errors
```

### Check PhonePe Documentation
https://developer.phonepe.com/docs

### Share These Details with Support:
```
1. Error message exactly as shown
2. npm start output (last 20 lines)
3. Browser console error (F12)
4. Your PHONEPE_MERCHANT_ID (don't share salt key)
5. Whether TEST or PROD environment
```

---

## Quick Fix Checklist for "PhonePe Not Working"

Run these in order:

```bash
# 1. Validate configuration
cd backend
node check-payment-config.js
# Should show: ✅ PHONEPE_SALT_KEY format valid (32 chars)

# 2. Restart backend
npm start
# Should show: 💳 Payment integrations: Razorpay + PhonePe

# 3. Test free registration first (to verify backend works)
# Open: http://localhost:3000
# Select FREE, submit
# Should receive email

# 4. Test PhonePe payment
# Select PAID, click "Pay ₹99 with PhonePe"
# Should open sandbox

# 5. Check logs
# If error, backend console will show it
```

---

## Your Current Configuration ✅

```env
PHONEPE_MERCHANT_ID=SUDHAWELLONLINE
PHONEPE_SALT_KEY=4d1aca6e529847d2b93b59baf21ce237 (FIXED - 32 chars)
PHONEPE_SALT_INDEX=1
PHONEPE_ENV=TEST
PHONEPE_AMOUNT_PAISE=9900
```

**Status:** Ready to test! The salt key issue has been fixed.

---

## Next Steps

1. **Restart backend** to load new configuration
   ```bash
   npm start
   ```

2. **Test PhonePe payment** flow
   - Free registration → works? ✅
   - PhonePe payment → opens? ✅
   - Payment completes? ✅
   - Email arrives? ✅

3. **If any errors** → Check the error section above matching your error

4. **All working?** → You're done! 🎉

---

**Last Updated:** July 3, 2026 | PhonePe Salt Key Fixed ✅
