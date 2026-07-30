// ============================================
//  SUDHA WELLNESS WEBINAR — BACKEND SERVER
//  Node.js + Express + MySQL + PhonePe
// ============================================

const express    = require('express');
const cors       = require('cors');
const crypto     = require('crypto');
const axios      = require('axios');
const bcrypt     = require('bcryptjs');
const jwt        = require('jsonwebtoken');
const helmet     = require('helmet');
const rateLimit  = require('express-rate-limit');
require('dotenv').config();

const db = require('./db');

let nodemailer = null;
try { nodemailer = require('nodemailer'); } catch (_) {}

// ============================================
//  ENV VALIDATION — fail fast if secrets missing
// ============================================
if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is required');
if (!process.env.ADMIN_KEY)  throw new Error('ADMIN_KEY is required');
if (!process.env.ADMIN_PASS) throw new Error('ADMIN_PASS is required');

const {
  PORT = 3000,
  JWT_SECRET,
  PHONEPE_MERCHANT_ID,
  PHONEPE_SALT_KEY,
  PHONEPE_SALT_INDEX = '1',
  PHONEPE_ENV = 'TEST',
  PHONEPE_AMOUNT_PAISE = '9900',
  TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN,
  TWILIO_WHATSAPP_FROM,
  META_WHATSAPP_TOKEN,
  META_PHONE_NUMBER_ID,
  META_WABA_ID,
  META_TEMPLATE_NAME = 'webinar_login_details',
  META_FALLBACK_TEMPLATE_NAME = '',
  META_TEMPLATE_LANGUAGE = 'en_US',
  SMTP_HOST,
  SMTP_PORT = '587',
  SMTP_SECURE = 'false',
  SMTP_USER,
  SMTP_PASS,
  EMAIL_FROM = SMTP_USER || 'Sudha Wellness <no-reply@sudhawellness.com>',
  APP_PUBLIC_URL = '',
  MEET_LINK,
  ZOOM_MEETING_LINK,
  MEETING_LINK   = MEET_LINK || ZOOM_MEETING_LINK || 'https://meet.google.com/YOUR-MEET-LINK',
  MEETING_ID     = '',
  MEETING_PASSWORD = '',
  WEBINAR_DATE_STR = 'Tuesday, 21st July 2026 at 7:00 PM IST',
  ADMIN_EMAIL = 'admin@sudhawellness.com',
} = process.env;

const PHONEPE_ENV_NORMALIZED = String(PHONEPE_ENV || 'TEST').trim().toUpperCase();
const PHONEPE_SALT_KEY_NORMALIZED = String(PHONEPE_SALT_KEY || '').trim();
const META_DETAILS_TEMPLATE_NAME = String(META_TEMPLATE_NAME || '').trim();
const PHONEPE_BASE = PHONEPE_ENV_NORMALIZED === 'PROD'
  ? 'https://api.phonepe.com/apis/hermes'
  : 'https://api-preprod.phonepe.com/apis/pg-sandbox';
const ADMIN_PASS_HASH = bcrypt.hashSync(process.env.ADMIN_PASS, 12);

const app = express();

if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

// ============================================
//  SECURITY HEADERS
// ============================================
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  hsts: process.env.NODE_ENV === 'production' ? { maxAge: 31536000, includeSubDomains: true } : false,
}));

// ============================================
//  REQUEST ID
// ============================================
app.use((req, res, next) => {
  req.id = req.headers['x-request-id'] || crypto.randomUUID();
  res.setHeader('X-Request-ID', req.id);
  next();
});

// ============================================
//  RATE LIMITING
// ============================================
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { success: false, message: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { success: false, message: 'Too many login attempts, please try again later.' },
  validate: false,
  keyGenerator: (req) => {
    const email = String(req.body?.email || '').toLowerCase().trim();
    return `${email}:${req.ip}`;
  },
});

app.use('/api/', apiLimiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

app.use(express.json({
  verify: (req, _res, buf) => { req.rawBody = buf.toString('utf8'); },
  limit: '1mb',
}));

// CORS — restrict in production
const corsOptions = process.env.NODE_ENV === 'production'
  ? { origin: [/sudhawellness\.com$/, /www\.sudhawellness\.com$/], credentials: true }
  : { origin: '*' };
app.use(cors(corsOptions));

const path = require('path');
app.use(express.static(path.join(__dirname, '..')));

// ============================================
//  HELPERS
// ============================================
function getVipAmountPaise() { return Number(PHONEPE_AMOUNT_PAISE) || 9900; }
function isPlaceholder(v) { return !v || /REPLACE|your_|xxxx/i.test(String(v)); }
function normalizePhoneNumber(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('91') && digits.length >= 12) return '+' + digits;
  return '+91' + digits.slice(-10);
}
function secureCompare(expected, received) {
  const a = Buffer.from(String(expected || ''));
  const b = Buffer.from(String(received || ''));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function generateTemporaryPassword() {
  return 'SW-' + crypto.randomBytes(4).toString('hex').toUpperCase();
}

// ============================================
//  SINGLETON SMTP TRANSPORTER
// ============================================
let transporter = null;
function getTransporter() {
  if (transporter) return transporter;
  if (!nodemailer || !SMTP_HOST || !SMTP_USER || !SMTP_PASS) return null;
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure: SMTP_SECURE === 'true',
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
  return transporter;
}

// ============================================
//  MIDDLEWARE
// ============================================
function authMiddleware(req, res, next) {
  const token = (req.headers['authorization'] || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ success: false, message: 'Not authenticated.' });
  db.getSessionUser(token).then(user => {
    if (!user) return res.status(401).json({ success: false, message: 'Session expired.' });
    req.user = user;
    req.userToken = token;
    next();
  }).catch(() => res.status(401).json({ success: false, message: 'Auth error.' }));
}

function verifyAdminJWT(req, res, next) {
  const token = (req.headers['authorization'] || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (!decoded.admin) return res.status(401).json({ error: 'Unauthorized' });
    req.admin = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired admin token' });
  }
}

// ============================================
//  INIT
// ============================================
async function initDB() {
  try {
    await db.getPool();
    console.log('✅ MySQL connected');
    if (process.env.NODE_ENV !== 'production') {
      const demoUser = await db.findUserByEmail('demo@sudhawellness.com');
      if (!demoUser) {
        await db.createUser({
          firstName: 'Demo', lastName: 'User',
          email: 'demo@sudhawellness.com', phone: '+919876543210',
          password: 'Demo@2024!', city: 'Mumbai', whatsappConsent: true,
        });
        console.log('👤 Demo user created (demo@sudhawellness.com / Demo@2024!)');
      }
    }
    db.startCleanupSchedule();
  } catch (err) {
    console.error('❌ MySQL connection failed:', err.message);
  }
}
initDB();

// ============================================
//  PUBLIC ROUTES
// ============================================
console.log("__dirname =", __dirname);
console.log("Static folder =", path.join(__dirname, ".."));

app.use(express.static(__dirname));

app.get('/', (_req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});
// app.use(express.static(path.join(__dirname, '..'), {
    // index: 'index.html'
// }));
app.get('/api/health', async (_req, res) => {
  const dbHealth = await db.healthCheck();
  res.json({
    status: dbHealth.status,
    db: dbHealth.database,
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/webinar/details', (_req, res) => {
  res.json({
    title: 'Holistic Wellness – Live Webinar',
    dateText: WEBINAR_DATE_STR,
    meetLink: MEETING_LINK,
    meetingId: MEETING_ID,
    meetingPassword: MEETING_PASSWORD,
    vipAmountPaise: getVipAmountPaise(),
  });
});

// ============================================
//  REGISTRATION
// ============================================
app.post('/api/register', async (req, res) => {
  try {
    const { name, phone, email, goal, regType, paymentId, paymentMethod, utrId, loginEmail, loginPassword } = req.body;
    if (!name || !phone || !email) {
      return res.status(400).json({ success: false, message: 'Name, phone, and email are required.' });
    }

    const requestedVip = regType === 'VIP';
    let verifiedPayment = null;
    if (requestedVip && paymentId) {
      verifiedPayment = await db.findVerifiedPayment({ paymentId, paymentMethod, email, phone });
    }
    if (requestedVip && !verifiedPayment) {
      return res.status(402).json({ success: false, message: 'VIP registration requires a verified payment.', regType: 'FREE' });
    }

    const finalRegType = verifiedPayment ? 'VIP' : 'FREE';
    const finalPaymentId = verifiedPayment?.id || null;
    const finalPaymentMethod = verifiedPayment?.method || null;
    const finalAmount = verifiedPayment ? getVipAmountPaise() / 100 : 0;
    const normalizedPhone = normalizePhoneNumber(phone);

    const existingByPhone = await db.findRegistrationByPhone(normalizedPhone);
    const existingByEmail = await db.findRegistrationByEmail(String(email).trim().toLowerCase());
    const existing = existingByPhone || existingByEmail;

    if (existing) {
      if (verifiedPayment) {
        await db.updateRegistrationPayment(existing.id, { paymentStatus: 'SUCCESS', paymentId: finalPaymentId, regType: 'VIP', amount: finalAmount });
      }
      const delivery = await sendRegistrationMessages({ ...existing, loginEmail, loginPassword });
      return res.json({
        success: true,
        message: (delivery.email.success || delivery.whatsapp.success) ? 'Already registered! Meet link resent.' : 'Already registered.',
        alreadyRegistered: true,
        emailSent: delivery.email.success,
        whatsappSent: delivery.whatsapp.success,
        regType: verifiedPayment ? 'VIP' : existing.reg_type,
      });
    }

    const regId = crypto.randomUUID();
    await db.createRegistration({
      id: regId, name, email, phone: normalizedPhone, goal,
      regType: finalRegType, amount: finalAmount,
      paymentId: finalPaymentId, paymentMethod: finalPaymentMethod,
      paymentStatus: verifiedPayment ? 'SUCCESS' : null,
      zoomLink: MEETING_LINK, loginEmail, loginPassword,
    });

    const delivery = await sendRegistrationMessages({ id: regId, name, phone: normalizedPhone, email, regType: finalRegType, loginEmail, loginPassword });

    res.json({
      success: true,
      message: (delivery.email.success || delivery.whatsapp.success) ? 'Registration successful! Meet link sent.' : 'Registration successful.',
      registrationId: regId,
      emailSent: delivery.email.success,
      whatsappSent: delivery.whatsapp.success,
      regType: finalRegType,
    });
  } catch (error) {
    console.error('Registration error:', error.message);
    res.status(500).json({ success: false, message: 'Server error. Please try again.' });
  }
});

// ============================================
//  PAYMENTS: PhonePe
// ============================================
app.post('/api/payment/phonepe/initiate', async (req, res) => {
  try {
    const { name, phone, email, goal, loginEmail, loginPassword } = req.body;
    if (isPlaceholder(PHONEPE_MERCHANT_ID) || isPlaceholder(PHONEPE_SALT_KEY_NORMALIZED)) {
      return res.status(500).json({ success: false, message: 'PhonePe is not configured.' });
    }
    if (!name || !phone || !email) {
      return res.status(400).json({ success: false, message: 'Name, phone, and email are required.' });
    }

    const amount = getVipAmountPaise();
    const merchantTransactionId = 'SUDHA_' + Date.now() + '_' + crypto.randomBytes(3).toString('hex');
    const phoneDigits = String(phone).replace(/\D/g, '');
    const mobileNumber = phoneDigits.length > 10 ? phoneDigits.slice(-10) : phoneDigits;
    const fullPhone = normalizePhoneNumber(phone);
    const publicBaseUrl = (APP_PUBLIC_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');

    const payloadData = {
      merchantId: PHONEPE_MERCHANT_ID,
      merchantTransactionId,
      merchantUserId: 'USER_' + phoneDigits,
      amount,
      redirectUrl: `${publicBaseUrl}/api/payment/phonepe/callback?txnId=${merchantTransactionId}`,
      redirectMode: 'REDIRECT',
      callbackUrl: `${publicBaseUrl}/api/payment/phonepe/webhook`,
      mobileNumber,
      paymentInstrument: { type: 'PAY_PAGE' },
    };

    const base64Payload = Buffer.from(JSON.stringify(payloadData)).toString('base64');
    const checksum = crypto.createHash('sha256').update(base64Payload + '/pg/v1/pay' + PHONEPE_SALT_KEY_NORMALIZED).digest('hex') + '###' + PHONEPE_SALT_INDEX;

    const response = await axios.post(`${PHONEPE_BASE}/pg/v1/pay`, { request: base64Payload }, {
      headers: { 'Content-Type': 'application/json', 'X-VERIFY': checksum },
    });

    if (response.data.success) {
      await db.createRegistration({
        id: merchantTransactionId, name, email, phone: fullPhone, goal,
        regType: 'VIP', amount: amount / 100,
        paymentMethod: 'PhonePe', paymentStatus: 'PENDING',
        loginEmail, loginPassword, zoomLink: MEETING_LINK,
      });
      await db.createPayment({ id: merchantTransactionId, method: 'PhonePe', amountPaise: amount, status: 'PENDING', name, email, phone: fullPhone });
      res.json({ success: true, redirectUrl: response.data.data.instrumentResponse.redirectInfo.url, transactionId: merchantTransactionId });
    } else {
      res.json({ success: false, message: 'PhonePe initiation failed.' });
    }
  } catch (error) {
    const ppErr = error.response?.data;
    console.error('PhonePe initiate error:', ppErr || error.message);
    if (ppErr?.code === 'KEY_NOT_CONFIGURED') {
      return res.status(502).json({ success: false, message: `PhonePe key not found for merchant ${PHONEPE_MERCHANT_ID} in ${PHONEPE_ENV_NORMALIZED}.` });
    }
    res.status(500).json({ success: false, message: ppErr?.message || 'Payment server error.' });
  }
});

app.get('/api/payment/phonepe/callback', async (req, res) => {
  const { txnId } = req.query;
  try {
    const statusResult = await checkPhonePeStatus(txnId);
    const paidAmount = Number(statusResult.data?.amount || statusResult.amount || 0);
    if (statusResult.success && statusResult.code === 'PAYMENT_SUCCESS' && paidAmount === getVipAmountPaise()) {
      await db.updateRegistrationPayment(txnId, { paymentStatus: 'SUCCESS', paymentId: statusResult.data?.transactionId || txnId, regType: 'VIP', amount: getVipAmountPaise() / 100 });
      await db.updatePaymentStatus(txnId, { status: 'PAYMENT_SUCCESS', phonepeTxnId: statusResult.data?.transactionId, verifiedAt: new Date().toISOString() });
      const reg = await db.findRegistrationById(txnId);
      if (reg) {
        const loginPassword = await db.getRegistrationPassword(reg);
        await sendRegistrationMessages({ ...reg, regType: 'VIP', loginEmail: reg.login_email, loginPassword });
      }
      res.redirect(`/?payment=success&txnId=${encodeURIComponent(txnId)}`);
    } else {
      res.redirect('/?payment=failed');
    }
  } catch (err) {
    console.error('PhonePe callback error:', err.message);
    res.redirect('/?payment=error');
  }
});

app.post('/api/payment/phonepe/webhook', async (req, res) => {
  const { response: encodedResponse } = req.body;
  const xVerify = req.headers['x-verify'];
  if (!encodedResponse || !xVerify) return res.status(400).send('Bad request');

  const [receivedHash] = xVerify.split('###');
  const expectedHash = crypto.createHash('sha256').update(encodedResponse + PHONEPE_SALT_KEY_NORMALIZED).digest('hex');
  if (!secureCompare(expectedHash, receivedHash)) return res.status(400).send('Invalid signature');

  const decoded = JSON.parse(Buffer.from(encodedResponse, 'base64').toString('utf8'));

  if (decoded.data?.merchantId !== PHONEPE_MERCHANT_ID) {
    return res.status(400).send('Merchant ID mismatch');
  }

  if (decoded.code === 'PAYMENT_SUCCESS' && Number(decoded.data?.amount || 0) === getVipAmountPaise()) {
    const txnId = decoded.data?.merchantTransactionId;
    await db.updateRegistrationPayment(txnId, { paymentStatus: 'SUCCESS', paymentId: decoded.data?.transactionId || txnId, regType: 'VIP', amount: getVipAmountPaise() / 100 });
    await db.updatePaymentStatus(txnId, { status: 'PAYMENT_SUCCESS', phonepeTxnId: decoded.data?.transactionId, verifiedAt: new Date().toISOString() });
    const reg = await db.findRegistrationById(txnId);
    if (reg) {
      try {
        const loginPassword = await db.getRegistrationPassword(reg);
        await sendRegistrationMessages({ ...reg, regType: 'VIP', loginEmail: reg.login_email, loginPassword });
      } catch (e) { console.error('Webhook delivery error:', e.message); }
    }
  }
  res.json({ success: true });
});

async function checkPhonePeStatus(merchantTransactionId) {
  const ppPath = `/pg/v1/status/${PHONEPE_MERCHANT_ID}/${merchantTransactionId}`;
  const checksum = crypto.createHash('sha256').update(ppPath + PHONEPE_SALT_KEY_NORMALIZED).digest('hex') + '###' + PHONEPE_SALT_INDEX;
  const response = await axios.get(`${PHONEPE_BASE}${ppPath}`, {
    headers: { 'Content-Type': 'application/json', 'X-VERIFY': checksum, 'X-MERCHANT-ID': PHONEPE_MERCHANT_ID },
  });
  return response.data;
}

// ============================================
//  AUTH: Register
// ============================================
app.post('/api/auth/register', async (req, res) => {
  try {
    const { firstName, lastName, email, phone, password, city, whatsappConsent } = req.body;
    if (!firstName || !email || !phone || !password) {
      return res.status(400).json({ success: false, message: 'All required fields must be filled.' });
    }
    const existing = await db.findUserByEmail(email);
    if (existing) return res.status(409).json({ success: false, message: 'An account with this email already exists.' });

    const user = await db.createUser({ firstName, lastName, email, phone, password, city, whatsappConsent });
    const token = await db.createSession(user.id);
    res.json({ success: true, token, user: db.safeUser(user) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Server error.' });
  }
});

// ============================================
//  AUTH: Auto-account
// ============================================
app.post('/api/auth/auto-account', async (req, res) => {
  try {
    const { firstName, lastName = '', email, phone, city = '', whatsappConsent = true } = req.body;
    if (!firstName || !email || !phone) {
      return res.status(400).json({ success: false, message: 'Name, email, and phone are required.' });
    }
    const { user, temporaryPassword, created } = await db.createAutoAccount({ firstName, lastName, email, phone, city, whatsappConsent });
    const token = await db.createSession(user.id);
    res.json({ success: true, created, token, user: db.safeUser(user), temporaryPassword });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// ============================================
//  AUTH: Login
// ============================================
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ success: false, message: 'Email and password are required.' });

    const user = await db.findUserByEmail(email);
    if (!user) return res.status(401).json({ success: false, message: 'No account found with this email.' });

    if (user.temp_password_issued_at) {
      const issuedAt = new Date(user.temp_password_issued_at);
      const hoursSince = (Date.now() - issuedAt.getTime()) / (1000 * 60 * 60);
      if (hoursSince > 24) {
        return res.status(401).json({ success: false, message: 'Temporary password expired. Please request a new one.' });
      }
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ success: false, message: 'Incorrect password.' });

    const token = await db.createSession(user.id);
    res.json({ success: true, token, user: db.safeUser(user) });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// ============================================
//  AUTH: Logout
// ============================================
app.post('/api/auth/logout', authMiddleware, async (req, res) => {
  try {
    await db.deleteSession(req.userToken);
    res.json({ success: true, message: 'Logged out.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// ============================================
//  AUTH: Profile
// ============================================
app.get('/api/auth/me', authMiddleware, (req, res) => {
  res.json({ success: true, user: db.safeUser(req.user) });
});

app.put('/api/auth/profile', authMiddleware, async (req, res) => {
  const { firstName, lastName, phone, city, goal } = req.body;
  await db.updateUserProfile(req.user.id, { firstName, lastName, phone, city, goal });
  const updated = await db.findUserById(req.user.id);
  res.json({ success: true, user: db.safeUser(updated) });
});

// ============================================
//  AUTH: Registrations
// ============================================
app.get('/api/auth/registrations', authMiddleware, async (req, res) => {
  const regs = await db.getUserRegistrations(req.user.id);
  res.json({ success: true, registrations: regs });
});

app.post('/api/auth/save-registration', authMiddleware, async (req, res) => {
  try {
    const regData = req.body;
    let verifiedPayment = null;
    if (regData.regType === 'VIP' && regData.paymentId) {
      verifiedPayment = await db.findVerifiedPayment({
        paymentId: regData.paymentId, paymentMethod: regData.paymentMethod,
        email: regData.email || req.user.email, phone: regData.phone || req.user.phone,
      });
    }

    const safeRegData = {
      id: regData.id || crypto.randomUUID(),
      userId: req.user.id,
      name: regData.name || req.user.first_name,
      email: req.user.email,
      phone: normalizePhoneNumber(regData.phone || req.user.phone),
      goal: regData.goal || '',
      regType: verifiedPayment ? 'VIP' : 'FREE',
      amount: verifiedPayment ? getVipAmountPaise() / 100 : 0,
      paymentId: verifiedPayment?.id || null,
      paymentMethod: verifiedPayment?.method || null,
      paymentStatus: verifiedPayment ? 'SUCCESS' : null,
      zoomLink: MEETING_LINK,
    };

    await db.createRegistration(safeRegData);
    if (safeRegData.regType === 'VIP') await db.upgradeToVIP(req.user.id);
    res.json({ success: true, registration: safeRegData });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Could not save registration.' });
  }
});

// ============================================
//  RESEND WHATSAPP
// ============================================
app.post('/api/resend-whatsapp', authMiddleware, async (req, res) => {
  try {
    const user = req.user;
    const normalizedPhone = normalizePhoneNumber(user.phone);
    const upcoming = await db.findRegistrationByPhone(normalizedPhone) || await db.findRegistrationByEmail(user.email);
    if (!upcoming) return res.json({ success: false, message: 'No upcoming webinar found.' });

    const loginPassword = generateTemporaryPassword();
    await db.updateUserPassword(user.email, loginPassword);

    const result = await sendRegistrationMessages({
      name: user.first_name, phone: user.phone, email: user.email,
      regType: upcoming.reg_type, loginEmail: user.email, loginPassword,
    });
    res.json({
      success: result.email.success || result.whatsapp.success,
      emailSent: result.email.success, whatsappSent: result.whatsapp.success,
      message: result.email.success || result.whatsapp.success ? 'Meet link resent!' : 'Could not send Meet link.',
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// ============================================
//  ADMIN: Login (JWT-based)
// ============================================
app.post('/api/admin/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ success: false, message: 'Email and password required.' });
  if (email !== ADMIN_EMAIL) return res.status(401).json({ success: false, message: 'Invalid admin credentials.' });

  const valid = await bcrypt.compare(password, ADMIN_PASS_HASH);
  if (!valid) return res.status(401).json({ success: false, message: 'Invalid admin credentials.' });

  const token = jwt.sign({ admin: true, email }, JWT_SECRET, { expiresIn: '24h' });
  res.json({ success: true, token });
});

// ============================================
//  ADMIN: Protected routes (JWT verified)
// ============================================
app.get('/api/admin/registrations', verifyAdminJWT, async (_req, res) => {
  try {
    const regs = await db.getAllRegistrations();
    res.json({ count: regs.length, registrations: regs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/users', verifyAdminJWT, async (_req, res) => {
  try {
    const users = await db.getAllUsers();
    res.json({ count: users.length, users });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/stats', verifyAdminJWT, async (_req, res) => {
  try {
    const stats = await db.getRevenueStats();
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/resend-zoom', verifyAdminJWT, async (req, res) => {
  const { phone, name, email } = req.body;
  const result = await sendRegistrationMessages({ name: name || 'Participant', phone, email, regType: 'FREE' });
  res.json({ success: result.email.success || result.whatsapp.success, message: result.email.success || result.whatsapp.success ? 'Meet link sent!' : 'Send failed.' });
});

app.post('/api/admin/resend-login-details', verifyAdminJWT, async (req, res) => {
  const { name = 'Participant', phone, email, regType = 'FREE' } = req.body;
  if (!phone || !email) return res.status(400).json({ success: false, message: 'Phone and email are required.' });
  const loginPassword = generateTemporaryPassword();
  await db.updateUserPassword(email, loginPassword);
  const result = await sendRegistrationMessages({ name, phone, email, regType, loginEmail: email, loginPassword });
  res.json({
    success: result.email.success || result.whatsapp.success,
    emailSent: result.email.success, whatsappSent: result.whatsapp.success,
    temporaryPassword: loginPassword,
  });
});

app.post('/api/admin/whatsapp-blast', verifyAdminJWT, async (req, res) => {
  const { message, recipients } = req.body;
  if (!Array.isArray(recipients) || !message) return res.status(400).json({ error: 'recipients array and message required' });
  let sent = 0;
  for (const r of recipients) {
    try {
      const result = await sendWhatsAppMessage({ name: r.name, phone: r.phone, customMessage: message });
      if (result.success) sent++;
    } catch (_) {}
  }
  res.json({ success: true, sent, total: recipients.length });
});

app.post('/api/admin/whatsapp/test', verifyAdminJWT, async (req, res) => {
  const { name = 'Participant', phone, email = '', regType = 'VIP' } = req.body;
  if (!phone) return res.status(400).json({ success: false, message: 'Phone is required.' });
  const loginPassword = generateTemporaryPassword();
  const result = await sendWhatsAppMessage({ name, phone, email, regType, loginEmail: email, loginPassword });
  res.json({ success: result.success, whatsapp: result, temporaryPassword: loginPassword });
});

app.post('/api/admin/whatsapp/create-template', verifyAdminJWT, async (req, res) => {
  if (!META_WHATSAPP_TOKEN || !META_WABA_ID) {
    return res.status(400).json({ success: false, message: 'Set META_WHATSAPP_TOKEN and META_WABA_ID in .env.' });
  }
  const templateName = req.body?.templateName || 'webinar_login_details';
  try {
    const response = await axios.post(`https://graph.facebook.com/v19.0/${META_WABA_ID}/message_templates`, {
      name: templateName,
      language: META_TEMPLATE_LANGUAGE,
      category: 'UTILITY',
      allow_category_change: true,
      components: [{
        type: 'BODY',
        text: 'Namaste {{1}}, your Sudha Wellness webinar is confirmed. Date: {{2}}. Meet link: {{3}}. Login: {{4}}. Email: {{5}}. Password: {{6}}.',
        example: { body_text: [['Abhishek', WEBINAR_DATE_STR, MEETING_LINK, (APP_PUBLIC_URL || 'https://sudhawellness.com').replace(/\/$/, '') + '/login.html', 'abhishek@example.com', 'SW-1234ABCD']] },
      }],
    }, { headers: { Authorization: `Bearer ${META_WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' } });
    res.json({ success: true, templateName, meta: response.data });
  } catch (err) {
    res.status(502).json({ success: false, metaError: err.response?.data || err.message });
  }
});

// ============================================
//  MESSAGE HELPERS
// ============================================
async function sendRegistrationMessages(registration) {
  const [email, whatsapp] = await Promise.all([
    sendEmailMessage(registration),
    sendWhatsAppMessage(registration),
  ]);
  return { email, whatsapp };
}

async function sendEmailMessage(registration) {
  const { name, email, regType, loginEmail, loginPassword } = registration;
  if (!email) return { success: false, message: 'Email missing' };
  const t = getTransporter();
  if (!t) return { success: false, message: 'SMTP not configured' };

  try {
    const mail = buildEmailMessage(registration);
    const info = await t.sendMail({ from: EMAIL_FROM, to: email, subject: mail.subject, text: mail.text, html: mail.html });
    await db.logEmail({ toEmail: email, subject: mail.subject, success: true, messageId: info.messageId });
    return { success: true, messageId: info.messageId };
  } catch (err) {
    await db.logEmail({ toEmail: email, subject: 'Registration', success: false, error: err.message });
    return { success: false, error: err.message };
  }
}

function buildEmailMessage(registration) {
  const { name, regType, loginEmail, loginPassword } = registration;
  const isVIP = regType === 'VIP';
  const loginUrl = APP_PUBLIC_URL ? APP_PUBLIC_URL.replace(/\/$/, '') + '/login.html' : 'login.html';
  const safeName = db.escapeHtml(name);
  const safeEmail = db.escapeHtml(loginEmail || registration.email);
  const safePassword = db.escapeHtml(loginPassword);

  const loginText = loginPassword ? `\n\nTemporary login details:\nLogin page: ${loginUrl}\nEmail: ${loginEmail || registration.email}\nTemporary password: ${loginPassword}` : '';
  const loginHtml = loginPassword ? `<div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:16px;margin:18px 0;"><p style="margin:0 0 8px;"><strong>Temporary login details</strong></p><p style="margin:0 0 8px;"><strong>Email:</strong> ${safeEmail}</p><p style="margin:0 0 8px;"><strong>Temporary password:</strong> ${safePassword}</p><p style="margin:0;"><strong>Login page:</strong> <a href="${loginUrl}" style="color:#087968;">${loginUrl}</a></p></div>` : '';

  const subject = 'Your Sudha Wellness Webinar Meet Link';
  const text = `Namaste ${name},\n\n${isVIP ? 'VIP registration confirmed!' : 'Registration confirmed!'}\n\nYour spot is reserved for the Sudha Wellness Health & Wellness Awareness Webinar.\n\nDate: ${WEBINAR_DATE_STR}\nPlatform: Google Meet\nJoin link: ${MEETING_LINK}\n\nPlease save this email and join 5 minutes early.\n\nTeam Sudha Wellness${loginText}`;
  const html = `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#17352a;max-width:620px;margin:0 auto;padding:24px;"><h2 style="color:#087968;margin:0 0 12px;">Sudha Wellness Webinar</h2><p>Namaste ${safeName},</p><p><strong>${isVIP ? 'VIP registration confirmed!' : 'Registration confirmed!'}</strong></p><p>Your spot is reserved for the <strong>Health &amp; Wellness Awareness Webinar</strong>.</p><div style="background:#eef8f5;border:1px solid #b9e0d8;border-radius:8px;padding:16px;margin:18px 0;"><p style="margin:0 0 8px;"><strong>Date:</strong> ${WEBINAR_DATE_STR}</p><p style="margin:0 0 8px;"><strong>Platform:</strong> Google Meet</p><p style="margin:0;"><strong>Join link:</strong> <a href="${MEETING_LINK}" style="color:#087968;">${MEETING_LINK}</a></p></div>${loginHtml}<p>Please save this email and join 5 minutes early.</p><p>Team Sudha Wellness</p></div>`;

  return { subject, text, html };
}

async function sendWhatsAppMessage(registration) {
  const { phone, customMessage } = registration;
  const message = customMessage || buildWhatsAppMessage(registration);
  try {
    if (META_WHATSAPP_TOKEN && META_PHONE_NUMBER_ID) {
      try {
        const result = await sendViaMetaAPI(phone, message, registration);
        await db.logWhatsApp({ phone, name: registration.name, message: message.substring(0, 500), provider: 'meta', messageId: result.messageId, success: true });
        return result;
      } catch (metaErr) {
        await db.logWhatsApp({ phone, name: registration.name, provider: 'meta', success: false, error: JSON.stringify(metaErr.response?.data || metaErr.message) });
        if (TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN) {
          const result = await sendViaTwilio(phone, message);
          await db.logWhatsApp({ phone, name: registration.name, provider: 'twilio', messageId: result.sid, success: true });
          return result;
        }
        throw metaErr;
      }
    }
    if (TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN) {
      const result = await sendViaTwilio(phone, message);
      await db.logWhatsApp({ phone, name: registration.name, provider: 'twilio', messageId: result.sid, success: true });
      return result;
    }
    return { success: false, message: 'No WhatsApp provider configured' };
  } catch (err) {
    await db.logWhatsApp({ phone, name: registration.name, provider: 'meta', success: false, error: JSON.stringify(err.response?.data || err.message) });
    return { success: false, error: err.response?.data || err.message };
  }
}

function buildWhatsAppMessage(registration) {
  const { name, regType, email, loginEmail, loginPassword } = registration;
  const isVIP = regType === 'VIP';
  const loginUrl = APP_PUBLIC_URL ? APP_PUBLIC_URL.replace(/\/$/, '') + '/login.html' : 'login.html';
  const loginBlock = loginPassword ? `\n━━━━━━━━━━━━━━━━━\n🔐 *Website Login Details*\nLogin: ${loginUrl}\nEmail: ${loginEmail || email}\nTemporary password: ${loginPassword}\n━━━━━━━━━━━━━━━━━\n\n` : '';

  return `🌿 *Sudha Wellness Webinar*\n\nNamaste ${name}! 🙏\n\n${isVIP ? '⭐ *VIP Registration Confirmed!*' : '✅ *Registration Confirmed!*'}\n\nYour spot is reserved for our *Live Wellness Webinar*:\n\n📅 *Date:* ${WEBINAR_DATE_STR}\n💻 *Platform:* Google Meet\n\n━━━━━━━━━━━━━━━━━\n🔗 *Join Google Meet:*\n${MEETING_LINK}${MEETING_ID ? `\n🆔 Meeting ID: ${MEETING_ID}` : ''}${MEETING_PASSWORD ? `\n🔑 Password: ${MEETING_PASSWORD}` : ''}\n━━━━━━━━━━━━━━━━━\n\n${loginBlock}📌 *Please save this message* and join 5 mins early.\n\nSee you on the webinar! 🌱\n*— Team Sudha Wellness*`;
}

async function sendViaTwilio(toPhone, message) {
  const formattedPhone = toPhone.startsWith('+') ? toPhone : '+91' + toPhone;
  const response = await axios.post(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`,
    new URLSearchParams({ From: TWILIO_WHATSAPP_FROM, To: `whatsapp:${formattedPhone}`, Body: message }),
    { auth: { username: TWILIO_ACCOUNT_SID, password: TWILIO_AUTH_TOKEN }, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );
  return { success: true, sid: response.data.sid };
}

async function sendViaMetaAPI(toPhone, message, registration = {}) {
  const formattedPhone = String(toPhone || '').replace(/\D/g, '');
  const simpleMessage = message.replace(/[*_~`]/g, '').substring(0, 1000);
  const hasCustomTemplate = META_DETAILS_TEMPLATE_NAME && META_DETAILS_TEMPLATE_NAME !== 'hello_world';

  const payload = hasCustomTemplate
    ? buildMetaTemplatePayload(formattedPhone, registration, META_DETAILS_TEMPLATE_NAME)
    : META_WHATSAPP_TOKEN
      ? { messaging_product: 'whatsapp', to: formattedPhone, type: 'template', template: { name: META_DETAILS_TEMPLATE_NAME || 'hello_world', language: { code: META_TEMPLATE_LANGUAGE || 'en_US' } } }
      : { messaging_product: 'whatsapp', to: formattedPhone, type: 'text', text: { body: simpleMessage } };

  const response = await axios.post(`https://graph.facebook.com/v19.0/${META_PHONE_NUMBER_ID}/messages`, payload, {
    headers: { Authorization: `Bearer ${META_WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
  });

  if (hasCustomTemplate && message.length > 0) {
    try {
      await new Promise(r => setTimeout(r, 1000));
      const textPayload = { messaging_product: 'whatsapp', to: formattedPhone, type: 'text', text: { body: message.substring(0, 4000) } };
      await axios.post(`https://graph.facebook.com/v19.0/${META_PHONE_NUMBER_ID}/messages`, textPayload, {
        headers: { Authorization: `Bearer ${META_WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
      });
    } catch (textErr) {
      console.warn(`⚠️ Full details text failed:`, textErr.response?.data?.error?.message || textErr.message);
    }
  }

  return { success: true, messageId: response.data.messages[0].id };
}

function buildMetaTemplatePayload(toPhone, registration, templateName = META_DETAILS_TEMPLATE_NAME) {
  const { name, email, loginEmail, loginPassword } = registration;
  const loginUrl = APP_PUBLIC_URL ? APP_PUBLIC_URL.replace(/\/$/, '') + '/login.html' : 'login.html';
  const t = (v, f = '-') => String(v || '').trim() || f;

  if (templateName === 'webinar_reg_conf') {
    return { messaging_product: 'whatsapp', to: toPhone, type: 'template', template: { name: templateName, language: { code: META_TEMPLATE_LANGUAGE }, components: [{ type: 'body', parameters: [{ type: 'text', text: t(name, 'Participant') }, { type: 'text', text: t(WEBINAR_DATE_STR) }] }] } };
  }

  return { messaging_product: 'whatsapp', to: toPhone, type: 'template', template: { name: templateName, language: { code: META_TEMPLATE_LANGUAGE }, components: [{ type: 'body', parameters: [{ type: 'text', text: t(name, 'Participant') }, { type: 'text', text: t(WEBINAR_DATE_STR) }, { type: 'text', text: t(MEETING_LINK) }, { type: 'text', text: t(loginUrl) }, { type: 'text', text: t(loginEmail || email) }, { type: 'text', text: t(loginPassword) }] }] } };
}

// ============================================
//  START SERVER
// ============================================
const server = app.listen(PORT, () => {
  console.log(`\n🌿 Sudha Wellness Backend running on http://localhost:${PORT}`);
  console.log(`📡 MySQL: ${process.env.DB_HOST || '127.0.0.1'}:${process.env.DB_PORT || 3306}/${process.env.DB_NAME || 'sudha_wellness'}`);
  console.log(`💳 Payments: PhonePe (${PHONEPE_ENV_NORMALIZED})`);
  console.log(`📧 Email: ${SMTP_HOST && SMTP_USER ? 'SMTP configured' : 'NOT CONFIGURED'}`);
  console.log(`📱 WhatsApp: ${META_WHATSAPP_TOKEN && META_PHONE_NUMBER_ID ? 'Meta Cloud API' : TWILIO_ACCOUNT_SID ? 'Twilio' : 'NOT CONFIGURED'}\n`);
});

// ============================================
//  GRACEFUL SHUTDOWN
// ============================================
function gracefulShutdown(signal) {
  console.log(`\n${signal} received. Shutting down gracefully...`);
  server.close(async () => {
    await db.closePool();
    console.log('Server closed.');
    process.exit(0);
  });
  setTimeout(() => { process.exit(1); }, 10000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
