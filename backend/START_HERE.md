# 🎯 START HERE - Payment Gateway Fix

## Problem
Your payment gateway has 3 critical errors preventing payments.

## Solution
Complete these 5 steps in 15 minutes:

### Step 1: Get Razorpay Credentials (3 min)
- Open: https://dashboard.razorpay.com/app/keys
- Copy Key ID (starts with `rzp_test_`)
- Copy Key Secret

### Step 2: Get Gmail App Password (3 min)
- Open: https://myaccount.google.com/apppasswords
- Generate new password (16 chars, NO SPACES)

### Step 3: Update .env File (2 min)
Edit: `backend/.env`
```
RAZORPAY_KEY_ID=your_key_here
RAZORPAY_KEY_SECRET=your_secret_here
SMTP_PASS=your_gmail_app_password_no_spaces
PHONEPE_SALT_KEY=4d1aca6e529847d2b93b59baf21ce237
```

### Step 4: Validate (1 min)
```bash
cd backend
node check-payment-config.js
```
Should show: **🟢 NO CRITICAL ISSUES FOUND**

### Step 5: Restart Backend (1 min)
```bash
npm start
```

## Test It
- Free registration → should send email
- Razorpay payment → test with card `4111 1111 1111 1111`
- PhonePe payment → complete sandbox transaction

## Detailed Guides
- **QUICK_FIX.md** - Full guide with all details
- **PAYMENT_GATEWAY_ACTION_CHECKLIST.md** - Step-by-step with checkboxes
- **PAYMENT_GATEWAY_SETUP.md** - Technical reference
