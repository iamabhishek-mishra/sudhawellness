# 🔍 PhonePe Debug Guide - Detailed Error Analysis

## What Happens When You Click "Pay ₹99 with PhonePe"

Here's the exact flow of your backend:

```
Frontend (browser)
    ↓
[User clicks "Pay ₹99 with PhonePe"]
    ↓
Frontend makes POST to backend: /api/payment/phonepe/initiate
Body contains: { name, phone, email, goal, loginEmail, loginPassword }
    ↓
Backend receives request
    ↓
[VALIDATION 1] Check PHONEPE_MERCHANT_ID & PHONEPE_SALT_KEY exist
    ✓ Your setup: SUDHAWELLONLINE & 4d1aca6e529847d2b93b59baf21ce237 ✅
    ↓
[VALIDATION 2] Check name, phone, email provided
    ✓ Form should have these
    ↓
[STEP 1] Generate payment request payload:
    - merchantId: SUDHAWELLONLINE
    - merchantTransactionId: SUDHA_1720000000000 (timestamp)
    - amount: 9900 (paise = ₹99)
    - redirectUrl: http://localhost:3000/api/payment/phonepe/callback?txnId=...
    ↓
[STEP 2] Base64 encode payload
    ↓
[STEP 3] Generate checksum:
    SHA256(base64Payload + '/pg/v1/pay' + PHONEPE_SALT_KEY) + '###' + SALT_INDEX
    
    This checksum proves the request is authentic to PhonePe
    ↓
[STEP 4] POST to PhonePe API:
    Endpoint: https://api-preprod.phonepe.com/apis/pg-sandbox/pg/v1/pay
    Headers: { X-VERIFY: checksum }
    Body: { request: base64Payload }
    ↓
Backend receives response from PhonePe
    ↓
If success:
    response.data.success = true
    response.data.data.instrumentResponse.redirectInfo.url = PhonePe checkout page
    ↓
    Backend returns to frontend:
    { success: true, redirectUrl: "..." }
    ↓
Frontend redirects browser to PhonePe checkout
    ↓
User completes payment on PhonePe
    ↓
PhonePe redirects back to:
    http://localhost:3000/api/payment/phonepe/callback?txnId=SUDHA_1720000000000
    ↓
Backend checks payment status
Backend sends email with meet link
```

---

## Most Common Error Points

### Error Point 1: "PhonePe is not configured"
```json
{
  "success": false,
  "message": "PhonePe is not configured."
}
```

**Cause:** Backend can't find PHONEPE_MERCHANT_ID or PHONEPE_SALT_KEY

**Check:**
```bash
grep PHONEPE .env
```

**Should output:**
```
PHONEPE_MERCHANT_ID=SUDHAWELLONLINE
PHONEPE_SALT_KEY=4d1aca6e529847d2b93b59baf21ce237
```

**Fix:** Ensure both are set. Restart backend:
```bash
npm start
```

---

### Error Point 2: "Invalid checksum / Signature Verification Failed"
```
HTTP 400: Bad Request
Response: {"success":false,"code":"INVALID_CHECKSUM"}
```

**Root Cause:** The checksum doesn't match PhonePe's validation

**Why This Happens:**
```javascript
// Checksum calculation in backend:
crypto
  .createHash('sha256')
  .update(base64Payload + '/pg/v1/pay' + PHONEPE_SALT_KEY)  // ← Must be EXACT
  .digest('hex') + '###' + PHONEPE_SALT_INDEX

// PhonePe validates using your SALT_KEY
// If SALT_KEY is wrong or modified → checksum won't match
```

**Debug Steps:**

1. Check salt key length:
   ```bash
   grep PHONEPE_SALT_KEY .env | wc -c
   # Should output: 33 (32 chars + newline)
   ```

2. Check salt key format (must be hex):
   ```bash
   grep PHONEPE_SALT_KEY .env
   # Should be: 4d1aca6e529847d2b93b59baf21ce237
   # All characters: 0-9 and a-f only
   ```

3. Check NO extra spaces:
   ```bash
   grep PHONEPE_SALT_KEY .env | od -c
   # Should not show any spaces
   ```

4. Verify in PhonePe dashboard:
   - Go to: https://developer.phonepe.com/
   - Check your salt key matches exactly

**Fix:** If wrong, get correct salt key from PhonePe dashboard and update .env

---

### Error Point 3: "Cannot reach PhonePe API"
```
Error: getaddrinfo ENOTFOUND api-preprod.phonepe.com
```

**Cause:** Backend can't reach PhonePe servers (network issue)

**Check:**
```bash
# Test from terminal
curl -I https://api-preprod.phonepe.com
# Should return: HTTP/2 404 or similar (not timeout)
```

**Fixes:**
1. Check internet connection: `ping google.com`
2. Check firewall isn't blocking PhonePe
3. Check if PhonePe servers are up
4. Restart backend: `npm start`

---

### Error Point 4: "Invalid merchant ID"
```json
{
  "success": false,
  "code": "MERCHANT_ID_INVALID"
}
```

**Cause:** PHONEPE_MERCHANT_ID doesn't match or isn't registered

**Check:**
```bash
grep PHONEPE_MERCHANT_ID .env
# Should output: PHONEPE_MERCHANT_ID=SUDHAWELLONLINE
```

**Fix:** 
1. Verify with PhonePe that `SUDHAWELLONLINE` is your merchant ID
2. If not, get correct ID from PhonePe dashboard
3. Update .env and restart backend

---

### Error Point 5: "Payload contains invalid data"
```json
{
  "success": false,
  "code": "INVALID_DATA"
}
```

**Cause:** Payment request has invalid field values

**Debug in Backend Terminal:**

When you run `npm start`, look for lines like:
```
PhonePe initiate error: Error: Request failed with status code 400
{
  "success": false,
  "code": "INVALID_DATA",
  "message": "..."
}
```

**Common Invalid Data Issues:**
- `amount` not in paise format (should be 9900, not 99)
- `mobileNumber` invalid format
- `merchantTransactionId` contains invalid characters
- Missing required fields

**Your setup should prevent this** - but if it occurs:
1. Check your phone number format (should be 10 digits)
2. Check amount is 9900 (not 99)

---

### Error Point 6: "Redirect after payment fails"
```
Payment completes, but browser doesn't redirect back to site
```

**Cause:** Callback URL is wrong or unreachable

**Your Callback URL:**
```
http://localhost:3000/api/payment/phonepe/callback?txnId=SUDHA_1720000000000
```

**Check:**
```bash
grep APP_PUBLIC_URL .env
# Should output: APP_PUBLIC_URL=http://localhost:3000
```

**Fix:**
1. Ensure backend is running: `npm start`
2. Verify port 3000 is accessible: http://localhost:3000
3. Check backend console shows no errors

---

## Step-by-Step Debugging

### If PhonePe Payment Fails:

**Step 1: Check Backend Logs**
```bash
npm start
# Look for error messages, especially:
# "PhonePe initiate error:"
# Copy the exact error
```

**Step 2: Check Browser Console**
```
Press F12 → Console tab
Look for:
- Network errors (red lines)
- The fetch error message
- Copy the error
```

**Step 3: Test Endpoint Directly**
```bash
curl -X POST http://localhost:3000/api/payment/phonepe/initiate \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test User",
    "phone": "9000000000",
    "email": "test@example.com",
    "goal": "Health",
    "loginEmail": "test@example.com",
    "loginPassword": "SW-12345678"
  }'
```

**Expected Response if everything works:**
```json
{
  "success": true,
  "redirectUrl": "https://api-preprod.phonepe.com/...",
  "transactionId": "SUDHA_1720000000000"
}
```

**Step 4: Check Configuration**
```bash
cd backend
node check-payment-config.js
# Should show:
# ✅ PHONEPE_MERCHANT_ID: SUDHAWELLONLINE
# ✅ PHONEPE_SALT_KEY format valid (32 chars)
# ✅ PHONEPE_ENV: TEST
```

---

## Common Fixes Checklist

```
If payment fails:

[ ] Backend running?
    npm start
    Should show: "💳 Payment integrations: Razorpay + PhonePe"

[ ] Salt key correct?
    grep PHONEPE_SALT_KEY .env
    Should be 32 hex characters, no hyphens

[ ] Merchant ID correct?
    grep PHONEPE_MERCHANT_ID .env
    Should be: SUDHAWELLONLINE

[ ] Environment correct?
    grep PHONEPE_ENV .env
    For testing: TEST
    For production: PROD

[ ] Test free registration first?
    This tests if backend works at all
    Should send email

[ ] Check backend console for error?
    npm start
    Look for red error messages

[ ] Check browser console?
    F12 → Console
    Look for network errors (red)

[ ] Internet connection?
    ping google.com
    Should respond

[ ] PhonePe servers up?
    curl https://api-preprod.phonepe.com
    Should respond (not timeout)
```

---

## Your Current Setup Check

```bash
cd backend

# Run validation
node check-payment-config.js

# Should show:
✅ PHONEPE_MERCHANT_ID: SUDHAWELLONLINE
✅ PHONEPE_SALT_KEY format valid (32 chars)
✅ PHONEPE_ENV: TEST
✅ PHONEPE_SALT_INDEX: 1
```

**If validation passes:** PhonePe configuration is correct ✅

**If validation fails:** Share the exact error message for help

---

## Real Error Example

**Your `.env` had:**
```env
PHONEPE_SALT_KEY=4d1aca6e-5298-47d2-b93b-59baf21ce237  ❌
```

**Issue:** 36 characters with hyphens

**Backend checksum calculation would be:**
```
SHA256(payload + '/pg/v1/pay' + '4d1aca6e-5298-47d2-b93b-59baf21ce237')
```

**PhonePe expects:** 32 hex characters without hyphens

**Result:** Checksum doesn't match → Payment fails

**Now fixed to:**
```env
PHONEPE_SALT_KEY=4d1aca6e529847d2b93b59baf21ce237  ✅
```

**Checksum now correct** → PhonePe accepts it

---

## Testing After Fix

1. **Restart Backend:**
   ```bash
   npm start
   ```

2. **Test Free Registration First:**
   - Open http://localhost:3000
   - Fill form
   - Select FREE
   - Submit
   - Should get email
   
3. **Test PhonePe Payment:**
   - Fill form
   - Select PAID
   - Click "Pay ₹99 with PhonePe"
   - Should open PhonePe sandbox

---

## Get Help

If still failing after this guide, provide:

1. **Error message exactly as shown**
2. **Backend console output:**
   ```bash
   npm start 2>&1 | head -50
   ```
3. **Browser console error (F12 → Console)**
4. **Configuration check output:**
   ```bash
   cd backend && node check-payment-config.js
   ```

---

**Your configuration is now correct and ready to test!** 🚀
