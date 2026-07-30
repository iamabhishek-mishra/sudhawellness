const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

// ============================================
//  CONFIGURATION
// ============================================
const BCRYPT_ROUNDS = 12;
const SESSION_EXPIRY_DAYS = 7;
const HEX_TOKEN_RE = /^[0-9a-f]{64}$/;

if (!process.env.SENSITIVE_KEY) {
  throw new Error('SENSITIVE_KEY environment variable is required for data encryption');
}
const SENSITIVE_KEY = process.env.SENSITIVE_KEY;
const ENCRYPTION_KEY = crypto.scryptSync(SENSITIVE_KEY, 'sudha-wellness', 32);

let pool = null;

// ============================================
//  LOGGING
// ============================================
function maskEmail(email) {
  if (!email || typeof email !== 'string') return '***';
  const [local, domain] = email.split('@');
  if (!local || !domain) return '***';
  if (local.length <= 2) return `**@${domain}`;
  return `${local[0]}${'*'.repeat(local.length - 2)}${local[local.length - 1]}@${domain}`;
}

function log(level, op, meta = {}) {
  const entry = { time: new Date().toISOString(), level, op, ...meta };
  if (level === 'error') console.error(JSON.stringify(entry));
  else if (level === 'warn') console.warn(JSON.stringify(entry));
  else console.log(JSON.stringify(entry));
}

// ============================================
//  CONNECTION POOL
// ============================================
async function getPool() {
  if (!pool) {
    pool = mysql.createPool({
      host: process.env.DB_HOST || '127.0.0.1',
      port: Number(process.env.DB_PORT || 3306),
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'sudha_wellness',
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      charset: 'utf8mb4',
      timezone: '+00:00',
      enableKeepAlive: true,
      keepAliveInitialDelay: 0,
    });
    pool.pool.on('connection', () => log('info', 'mysql.connection.new'));
    log('info', 'mysql.pool.created');
  }
  return pool;
}

async function query(sql, params = []) {
  try {
    const p = await getPool();
    const [rows] = await p.execute(sql, params);
    return rows;
  } catch (err) {
    log('error', 'query.error', {
      error: err.message,
      code: err.code || null,
      errno: err.errno || null,
      sqlState: err.sqlState || null,
    });
    throw err;
  }
}

async function queryOne(sql, params = []) {
  const rows = await query(sql, params);
  return rows[0] || null;
}

async function healthCheck() {
  const start = Date.now();
  try {
    const p = await getPool();
    await p.execute('SELECT 1');
    return { status: 'UP', latencyMs: Date.now() - start, database: 'connected' };
  } catch (err) {
    log('error', 'healthcheck.failed', { error: err.message });
    return { status: 'DOWN', latencyMs: Date.now() - start, database: 'disconnected', error: err.message };
  }
}

function isConnected() {
  return pool !== null;
}

async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
    log('info', 'mysql.pool.closed');
  }
}

// ============================================
//  TRANSACTIONS
//  Caller MUST use conn.execute() inside fn,
//  NOT the module-level query()/queryOne().
//  Example: transaction(async (conn) => { await conn.execute(...) })
// ============================================
async function transaction(fn) {
  const p = await getPool();
  const conn = await p.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    log('error', 'transaction.rolled_back', { error: err.message });
    throw err;
  } finally {
    conn.release();
  }
}

// ============================================
//  VALIDATION HELPERS
// ============================================
function validateEmail(email) {
  const s = String(email || '').trim().toLowerCase();
  if (!s || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) throw new Error('Invalid email address');
  return s;
}

function validatePhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 15) throw new Error('Invalid phone number');
  return normalizePhone(phone);
}

function validateRequired(value, fieldName) {
  if (!value || !String(value).trim()) throw new Error(`${fieldName} is required`);
  return String(value).trim();
}

function validateAmount(amount) {
  const n = Number(amount);
  if (isNaN(n) || n < 0) throw new Error('Invalid amount');
  return n;
}

function validatePasswordStrength(password) {
  const p = String(password || '');
  if (p.length < 12) throw new Error('Password must be at least 12 characters');
  if (!/[A-Z]/.test(p)) throw new Error('Password must contain at least one uppercase letter');
  if (!/[a-z]/.test(p)) throw new Error('Password must contain at least one lowercase letter');
  if (!/[0-9]/.test(p)) throw new Error('Password must contain at least one digit');
  if (!/[^A-Za-z0-9]/.test(p)) throw new Error('Password must contain at least one special character');
  return p;
}

function validateAmountPaise(amountPaise) {
  const n = Number(amountPaise);
  if (!Number.isInteger(n) || n <= 0) throw new Error('Invalid payment amount (must be positive integer paise)');
  return n;
}

// ============================================
//  HTML ESCAPING (XSS prevention)
// ============================================
function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ============================================
//  SENSITIVE DATA ENCRYPTION (AES-256-GCM)
// ============================================
function encryptSensitive(text) {
  if (!text) return null;
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
  let encrypted = cipher.update(String(text), 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

function decryptSensitive(encrypted) {
  if (!encrypted) return null;
  try {
    const [ivHex, authTagHex, cipherText] = encrypted.split(':');
    if (!ivHex || !authTagHex || !cipherText) throw new Error('Malformed ciphertext');
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(cipherText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    log('error', 'decrypt.failed', { error: err.message });
    return null;
  }
}

// ============================================
//  SESSION TOKEN HASHING
//  Store SHA-256 hash in DB, send original to client.
// ============================================
function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// ============================================
//  USERS
// ============================================
async function createUser({ firstName, lastName, email, phone, password, city = '', whatsappConsent = true }) {
  const normalizedEmail = validateEmail(email);
  const normalizedPhone = validatePhone(phone);
  const fName = validateRequired(firstName, 'First name');
  validatePasswordStrength(password);

  const id = 'u_' + crypto.randomUUID().split('-')[0];
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  try {
    await query(
      `INSERT INTO users (id, first_name, last_name, email, phone, password_hash, city, whatsapp_consent, member_type, joined_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'FREE', NOW())`,
      [id, fName, lastName || '', normalizedEmail, normalizedPhone, passwordHash, city || '', whatsappConsent ? 1 : 0]
    );
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      throw new Error('An account with this email already exists');
    }
    throw err;
  }

  const user = await findUserById(id);
  if (!user) throw new Error('Failed to create user');
  log('info', 'user.created', { userId: id });
  return user;
}

async function createAutoAccount({ firstName, lastName, email, phone, city = '', whatsappConsent = true }) {
  const normalizedEmail = validateEmail(email);
  const normalizedPhone = validatePhone(phone);
  const temporaryPassword = 'SW-' + crypto.randomBytes(4).toString('hex').toUpperCase();
  const passwordHash = await bcrypt.hash(temporaryPassword, BCRYPT_ROUNDS);

  const existing = await findUserByEmail(normalizedEmail);
  if (existing) {
    await query(
      `UPDATE users SET
        password_hash=?,
        temp_password_issued_at=NOW(),
        first_name=COALESCE(NULLIF(?, ''), first_name),
        phone=COALESCE(NULLIF(?, ''), phone),
        city=COALESCE(NULLIF(?, ''), city)
      WHERE id=?`,
      [passwordHash, firstName || '', normalizedPhone, city || '', existing.id]
    );
    await deleteSessionsForUser(existing.id);
    log('info', 'auto_account.password_refreshed', { userId: existing.id });
    return { user: await findUserById(existing.id), temporaryPassword, created: false };
  }

  const id = 'u_' + crypto.randomUUID().split('-')[0];
  await query(
    `INSERT INTO users (id, first_name, last_name, email, phone, password_hash, city, whatsapp_consent, member_type, temp_password_issued_at, joined_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'FREE', NOW(), NOW())`,
    [id, firstName || '', lastName || '', normalizedEmail, normalizedPhone, passwordHash, city || '', whatsappConsent ? 1 : 0]
  );

  const user = await findUserById(id);
  if (!user) throw new Error('Failed to create auto account');
  log('info', 'auto_account.created', { userId: id });
  return { user, temporaryPassword, created: true };
}

async function findUserByEmail(email) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!normalizedEmail) return null;
  return queryOne('SELECT * FROM users WHERE email = ?', [normalizedEmail]);
}

async function findUserById(id) {
  if (!id) return null;
  return queryOne('SELECT * FROM users WHERE id = ?', [id]);
}

async function updateUserPassword(email, newPassword) {
  const normalizedEmail = validateEmail(email);
  validatePasswordStrength(newPassword);
  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  const result = await query('UPDATE users SET password_hash=?, temp_password_issued_at=NOW() WHERE email=?', [passwordHash, normalizedEmail]);
  if (result.affectedRows === 0) {
    log('warn', 'updateUserPassword.not_found', { email: maskEmail(normalizedEmail) });
  } else {
    const user = await findUserByEmail(normalizedEmail);
    if (user) await deleteSessionsForUser(user.id);
  }
}

async function updateUserProfile(id, { firstName, lastName, phone, city, goal }) {
  const sets = [];
  const params = [];
  if (firstName !== undefined && firstName !== '') { sets.push('first_name=?'); params.push(firstName); }
  if (lastName !== undefined)  { sets.push('last_name=?');  params.push(lastName); }
  if (phone !== undefined && phone !== '')     { sets.push('phone=?');      params.push(validatePhone(phone)); }
  if (city !== undefined)      { sets.push('city=?');       params.push(city); }
  if (goal !== undefined)      { sets.push('goal=?');       params.push(goal); }
  if (sets.length === 0) return;
  params.push(id);
  await query(`UPDATE users SET ${sets.join(', ')} WHERE id=?`, params);
}

async function upgradeToVIP(userId) {
  const result = await query("UPDATE users SET member_type='VIP' WHERE id=?", [userId]);
  if (result.affectedRows === 0) log('warn', 'upgradeToVIP.not_found', { userId });
}

async function getAllUsers() {
  return query('SELECT id, first_name, last_name, email, phone, city, goal, member_type, whatsapp_consent, is_admin, joined_at, created_at FROM users ORDER BY joined_at DESC');
}

// ============================================
//  SESSIONS (token stored as SHA-256 hash)
// ============================================
async function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + SESSION_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
  await query('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)', [tokenHash, userId, expiresAt]);
  log('info', 'session.created', { userId });
  return token;
}

async function getSessionUser(token) {
  if (!token || !HEX_TOKEN_RE.test(token)) return null;
  const tokenHash = hashToken(token);
  return queryOne(
    `SELECT u.* FROM users u
     INNER JOIN sessions s ON s.user_id = u.id
     WHERE s.token = ? AND s.expires_at > NOW()`,
    [tokenHash]
  );
}

async function deleteSession(token) {
  if (!token) return;
  const tokenHash = hashToken(token);
  await query('DELETE FROM sessions WHERE token=?', [tokenHash]);
}

async function deleteSessionsForUser(userId) {
  if (!userId) return;
  const result = await query('DELETE FROM sessions WHERE user_id=?', [userId]);
  if (result.affectedRows > 0) log('info', 'sessions.deleted_for_user', { userId, count: result.affectedRows });
}

async function cleanupSessions() {
  const result = await query('DELETE FROM sessions WHERE expires_at < NOW() LIMIT 500');
  if (result.affectedRows > 0) log('info', 'sessions.cleanup', { removed: result.affectedRows });
}

// ============================================
//  REGISTRATIONS
// ============================================
async function createRegistration({ id, userId, name, email, phone, goal, regType, amount, paymentId, paymentMethod, paymentStatus, utrId, zoomLink, loginEmail, loginPassword }) {
  const regId = id || crypto.randomUUID();
  const fName = validateRequired(name, 'Name');
  const fEmail = validateEmail(email);
  const fPhone = validatePhone(phone);

  const encryptedPassword = loginPassword ? encryptSensitive(loginPassword) : null;

  await query(
    `INSERT INTO registrations (id, user_id, name, email, phone, goal, reg_type, amount, payment_id, payment_method, payment_status, utr_id, zoom_link, login_email, login_password, registered_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE payment_status=VALUES(payment_status), payment_id=VALUES(payment_id), reg_type=VALUES(reg_type), amount=VALUES(amount)`,
    [regId, userId || null, fName, fEmail, fPhone, goal || '', regType || 'FREE', validateAmount(amount), paymentId || null, paymentMethod || null, paymentStatus || null, utrId || null, zoomLink || null, loginEmail || null, encryptedPassword]
  );
  return queryOne('SELECT * FROM registrations WHERE id=?', [regId]);
}

async function findRegistrationById(id) {
  if (!id) return null;
  return queryOne('SELECT * FROM registrations WHERE id=?', [id]);
}

async function getRegistrationPassword(registration) {
  if (!registration || !registration.login_password) return null;
  return decryptSensitive(registration.login_password);
}

async function findRegistrationByPhone(phone) {
  const normalized = normalizePhone(phone);
  if (!normalized) return null;
  return queryOne('SELECT * FROM registrations WHERE phone=? ORDER BY registered_at DESC LIMIT 1', [normalized]);
}

async function findRegistrationByEmail(email) {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized) return null;
  return queryOne('SELECT * FROM registrations WHERE email=? ORDER BY registered_at DESC LIMIT 1', [normalized]);
}

async function updateRegistrationPayment(id, { paymentStatus, paymentId, regType, amount }) {
  const sets = [];
  const params = [];
  if (paymentStatus) { sets.push('payment_status=?'); params.push(paymentStatus); }
  if (paymentId)     { sets.push('payment_id=?');     params.push(paymentId); }
  if (regType)       { sets.push('reg_type=?');       params.push(regType); }
  if (amount !== undefined) { sets.push('amount=?');   params.push(amount); }
  if (sets.length === 0) return;
  params.push(id);
  await query(`UPDATE registrations SET ${sets.join(', ')} WHERE id=?`, params);
}

async function getAllRegistrations() {
  return query('SELECT * FROM registrations ORDER BY registered_at DESC');
}

async function getUserRegistrations(userId) {
  if (!userId) return [];
  return query('SELECT * FROM registrations WHERE user_id=? ORDER BY registered_at DESC', [userId]);
}

async function getRevenueStats() {
  const [stats, userStats] = await Promise.all([
    queryOne(`
      SELECT
        COUNT(*) as totalRegistrations,
        SUM(CASE WHEN reg_type='VIP' THEN 1 ELSE 0 END) as vipRegistrations,
        COALESCE(SUM(amount), 0) as totalRevenue
      FROM registrations
    `),
    queryOne('SELECT COUNT(*) as totalUsers FROM users'),
  ]);
  return {
    totalRegistrations: Number(stats?.totalRegistrations) || 0,
    vipRegistrations: Number(stats?.vipRegistrations) || 0,
    totalRevenue: Number(stats?.totalRevenue) || 0,
    totalUsers: Number(userStats?.totalUsers) || 0,
  };
}

// ============================================
//  PAYMENTS
// ============================================
async function createPayment({ id, registrationId, userId, method, amountPaise, currency, status, name, email, phone }) {
  if (!id || !method) throw new Error('Payment id and method are required');
  validateAmountPaise(amountPaise);

  await query(
    `INSERT INTO payments (id, registration_id, user_id, method, amount_paise, currency, status, name, email, phone)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE status=VALUES(status)`,
    [id, registrationId || null, userId || null, method, amountPaise, currency || 'INR', status || 'PENDING', name || null, email || null, phone || null]
  );
}

async function updatePaymentStatus(id, { status, phonepeTxnId, rawResponse, verifiedAt }) {
  const sets = [];
  const params = [];
  if (status) { sets.push('status=?'); params.push(status); }
  if (phonepeTxnId)      { sets.push('phonepe_txn_id=?');      params.push(phonepeTxnId); }
  if (rawResponse)       { sets.push('raw_response=?');        params.push(JSON.stringify(rawResponse)); }
  if (verifiedAt)        { sets.push('verified_at=?');         params.push(verifiedAt); }
  if (sets.length === 0) return;
  params.push(id);
  await query(`UPDATE payments SET ${sets.join(', ')} WHERE id=?`, params);
}

async function findVerifiedPayment({ paymentId, paymentMethod, email, phone }) {
  const method = String(paymentMethod || '').trim().toLowerCase();
  const id = String(paymentId || '').trim();
  if (!id) return null;

  if (method === 'phonepe') {
    return queryOne(
      "SELECT * FROM payments WHERE (id=? OR phonepe_merchant_txn_id=?) AND method='PhonePe' AND status='PAYMENT_SUCCESS' AND amount_paise=?",
      [id, id, getVipAmountPaise()]
    );
  }

  return null;
}

// ============================================
//  WHATSAPP / EMAIL LOGS
// ============================================
async function logWhatsApp({ phone, name, message, provider, messageId, success, error }) {
  try {
    await query(
      'INSERT INTO whatsapp_logs (phone, name, message, provider, message_id, success, error) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [phone, name || null, message ? message.substring(0, 1000) : null, provider || 'meta', messageId || null, success ? 1 : 0, error ? String(error).substring(0, 500) : null]
    );
  } catch (err) {
    log('warn', 'whatsapp_log.write_failed', { error: err.message });
  }
}

async function logEmail({ toEmail, subject, provider, messageId, success, error }) {
  try {
    await query(
      'INSERT INTO email_logs (to_email, subject, provider, message_id, success, error) VALUES (?, ?, ?, ?, ?, ?)',
      [toEmail, subject || '', provider || 'smtp', messageId || null, success ? 1 : 0, error ? String(error).substring(0, 500) : null]
    );
  } catch (err) {
    log('warn', 'email_log.write_failed', { error: err.message });
  }
}

// ============================================
//  HELPERS
// ============================================
function normalizePhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('91') && digits.length >= 12) return '+' + digits;
  if (digits.length >= 10) return '+91' + digits.slice(-10);
  return '';
}

function getVipAmountPaise() {
  return Number(process.env.PHONEPE_AMOUNT_PAISE) || 9900;
}

function safeUser(user) {
  if (!user) return null;
  const { password_hash, temp_password_issued_at, ...safe } = user;
  safe.firstName = safe.first_name;
  safe.lastName = safe.last_name;
  safe.memberType = safe.member_type;
  safe.whatsappConsent = !!safe.whatsapp_consent;
  safe.isAdmin = !!safe.is_admin;
  safe.joinedAt = safe.joined_at;
  return safe;
}

// ============================================
//  SCHEDULED CLEANUP
//  Multi-instance safe: each instance deletes
//  up to 500 rows; MySQL row-locking prevents
//  duplicate deletes across instances.
// ============================================
function startCleanupSchedule() {
  setInterval(() => {
    cleanupSessions().catch(err => log('error', 'sessions.cleanup.failed', { error: err.message }));
  }, 60 * 60 * 1000);
  log('info', 'sessions.cleanup.scheduled', { intervalMs: 3600000 });
}

module.exports = {
  getPool,
  query,
  queryOne,
  isConnected,
  healthCheck,
  closePool,
  transaction,
  startCleanupSchedule,
  maskEmail,
  escapeHtml,
  hashToken,
  // Users
  createUser,
  createAutoAccount,
  findUserByEmail,
  findUserById,
  updateUserPassword,
  updateUserProfile,
  upgradeToVIP,
  getAllUsers,
  // Sessions
  createSession,
  getSessionUser,
  deleteSession,
  deleteSessionsForUser,
  cleanupSessions,
  // Registrations
  createRegistration,
  findRegistrationById,
  findRegistrationByPhone,
  findRegistrationByEmail,
  getRegistrationPassword,
  updateRegistrationPayment,
  getAllRegistrations,
  getUserRegistrations,
  getRevenueStats,
  // Payments
  createPayment,
  updatePaymentStatus,
  findVerifiedPayment,
  // Logs
  logWhatsApp,
  logEmail,
  // Helpers
  normalizePhone,
  getVipAmountPaise,
  safeUser,
};
