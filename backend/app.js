// ========================================
//  SUDHA WELLNESS WEBINAR — FRONTEND APP
// ========================================

// ---- CONFIG ----
const CONFIG = {
  WEBINAR_DATE:  new Date('2026-07-21T19:00:00Z'),
  RAZORPAY_KEY:  'rzp_test_REPLACE_WITH_YOUR_TEST_KEY_ID',  // Get from https://dashboard.razorpay.com/app/keys
  VIP_AMOUNT:    9900,                                // ₹99 in paise
  BACKEND_URL:   'http://localhost:3000',
  MEET_LINK:     'https://meet.google.com/kpc-doyj-bzm',
  MEETING_ID:    '',
  MEETING_PASSWORD: '',
};

// ============================================
//  WEBINAR REGISTRATION STORAGE HELPERS
//  Saves registration to logged-in user profile
// ============================================
const WEBINAR_TITLE = 'Holistic Wellness – Live Webinar';
const WEBINAR_DATE_STR = '2026-07-21T19:00:00Z';

let isSubmittingRegistration = false;

async function loadWebinarDetails() {
  try {
    const response = await fetch(`${CONFIG.BACKEND_URL}/api/webinar/details`);
    if (!response.ok) return;
    const details = await response.json();
    if (details.meetLink) CONFIG.MEET_LINK = details.meetLink;
    if (details.meetingId !== undefined) CONFIG.MEETING_ID = details.meetingId;
    if (details.meetingPassword !== undefined) CONFIG.MEETING_PASSWORD = details.meetingPassword;
    if (details.vipAmountPaise) CONFIG.VIP_AMOUNT = Number(details.vipAmountPaise);
    if (details.razorpayKeyId) CONFIG.RAZORPAY_KEY = details.razorpayKeyId;
  } catch (_) {
    // Keep local defaults when the backend is offline.
  }
}

function registrationDedupeKey(reg) {
  return (reg.webinarTitle || WEBINAR_TITLE) + '|' + (reg.phone || '');
}

function findExistingRegistration(phone, webinarTitle = WEBINAR_TITLE) {
  const key = webinarTitle + '|' + phone;
  const match = (r) => registrationDedupeKey(r) === key;

  const userRaw = localStorage.getItem('sw_user');
  if (userRaw) {
    const user = JSON.parse(userRaw);
    const found = (user.registrations || []).find(match);
    if (found) return found;
  }

  const allRegs = JSON.parse(localStorage.getItem('sw_all_registrations') || '[]');
  const fromAll = allRegs.find(match);
  if (fromAll) return fromAll;

  const users = JSON.parse(localStorage.getItem('sw_users') || '[]');
  for (const u of users) {
    const found = (u.registrations || []).find(match);
    if (found) return found;
  }

  return null;
}

function buildRegistrationRecord(formData) {
  const existing = findExistingRegistration(formData.phone);
  const regType = formData.regType === 'VIP' ? 'VIP' : 'FREE';

  return {
    id:            existing?.id || ('wreg_' + formData.phone.replace(/\D/g, '') + '_20260721'),
    webinarTitle:  WEBINAR_TITLE,
    webinarDate:   WEBINAR_DATE_STR,
    regType,
    amount:        regType === 'VIP' ? 99 : 0,
    paymentId:     formData.paymentId     || existing?.paymentId     || null,
    paymentMethod: formData.paymentMethod || existing?.paymentMethod || null,
    utrId:         null,
    zoomLink:      CONFIG.MEET_LINK,
    meetLink:      CONFIG.MEET_LINK,
    meetingId:     CONFIG.MEETING_ID,
    meetingPassword: CONFIG.MEETING_PASSWORD,
    name:          formData.name,
    email:         formData.email,
    phone:         formData.phone,
    goal:          formData.goal || existing?.goal || '',
    status:        'upcoming',
    registeredAt:  existing?.registeredAt || new Date().toISOString(),
  };
}

function upsertRegistration(list, registration) {
  const key = registrationDedupeKey(registration);
  const idx = list.findIndex(r => registrationDedupeKey(r) === key);
  if (idx > -1) {
    list[idx] = { ...list[idx], ...registration };
    return list;
  }
  list.push(registration);
  return list;
}

function saveRegistrationToUser(registration) {
  // 1. Save to the logged-in user's session object
  const userRaw = localStorage.getItem('sw_user');
  if (userRaw) {
    const user = JSON.parse(userRaw);
    if (!Array.isArray(user.registrations)) user.registrations = [];
    user.registrations = upsertRegistration(user.registrations, registration);
    if (registration.regType === 'VIP') user.memberType = 'VIP';
    localStorage.setItem('sw_user', JSON.stringify(user));

    // 2. Also update the sw_users array so it persists across logouts
    const users = JSON.parse(localStorage.getItem('sw_users') || '[]');
    const idx   = users.findIndex(u => u.id === user.id);
    if (idx > -1) {
      users[idx] = user;
    } else {
      users.push(user);
    }
    localStorage.setItem('sw_users', JSON.stringify(users));
  }

  // 3. Standalone key for dashboard — upsert, never duplicate
  const allRegs = JSON.parse(localStorage.getItem('sw_all_registrations') || '[]');
  localStorage.setItem('sw_all_registrations', JSON.stringify(upsertRegistration(allRegs, registration)));
}

async function syncRegistrationToBackend(registration) {
  const token = localStorage.getItem('sw_token');
  if (!token) return;
  try {
    await fetch(`${CONFIG.BACKEND_URL}/api/auth/save-registration`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token,
      },
      body: JSON.stringify(registration),
    });
  } catch (e) {
    // Backend offline — localStorage already saved, no action needed
    console.log('Backend sync skipped (offline mode)');
  }
}

// ---- COUNTDOWN TIMER ----
function updateCountdown() {
  const now  = new Date();
  const diff = CONFIG.WEBINAR_DATE - now;
  if (diff <= 0) {
    document.getElementById('countdown').innerHTML =
      '<div style="color:#f5c878;font-size:1.1rem;font-weight:600;">🔴 Webinar is LIVE now!</div>';
    return;
  }
  const days    = Math.floor(diff / 86400000);
  const hours   = Math.floor((diff % 86400000) / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);
  const seconds = Math.floor((diff % 60000) / 1000);
  document.getElementById('days').textContent    = String(days).padStart(2,'0');
  document.getElementById('hours').textContent   = String(hours).padStart(2,'0');
  document.getElementById('minutes').textContent = String(minutes).padStart(2,'0');
  document.getElementById('seconds').textContent = String(seconds).padStart(2,'0');
}
setInterval(updateCountdown, 1000);
updateCountdown();

// ---- MOBILE MENU ----
function toggleMenu() {
  document.querySelector('.nav-links').classList.toggle('open');
}

// ---- NAVBAR AUTH STATE (index page) ----
function updateNavbarAuth() {
  const item = document.getElementById('authNavItem');
  if (!item) return;

  let user = null;
  try { user = JSON.parse(localStorage.getItem('sw_user') || 'null'); } catch { user = null; }
  const token = localStorage.getItem('sw_token');

  if (!user || !token) {
    item.innerHTML = '<a href="login.html">Login</a>';
    return;
  }

  const init = (user.firstName || user.name || 'U')[0].toUpperCase();
  const name = user.firstName || (user.name || '').split(' ')[0] || 'Account';

  item.innerHTML = `
    <div class="user-menu" style="position:relative;">
      <button class="user-avatar-btn" type="button" id="navUserBtn" style="display:flex;align-items:center;gap:8px;background:none;border:none;cursor:pointer;font-family:'Poppins',sans-serif;font-size:0.88rem;font-weight:600;color:#333;padding:6px 10px;border-radius:50px;">
        <span style="width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,#2d7a4f,#4CAF50);color:#fff;display:inline-flex;align-items:center;justify-content:center;font-weight:700;font-size:0.88rem;">${init}</span>
        <span>${name}</span><span style="font-size:0.7rem;">▾</span>
      </button>
      <div id="navUserDropdown" style="display:none;position:absolute;right:0;top:calc(100% + 8px);background:#fff;border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,0.15);border:1px solid #e0e7e3;min-width:200px;z-index:999;overflow:hidden;">
        <a href="dashboard.html" style="display:block;padding:12px 18px;font-size:0.87rem;color:#333;text-decoration:none;">📋 My Dashboard</a>
        <a href="dashboard.html?tab=bookings" style="display:block;padding:12px 18px;font-size:0.87rem;color:#333;text-decoration:none;">🎫 My Bookings</a>
        <hr style="border:none;border-top:1px solid #e8f0e9;margin:4px 0;"/>
        <a href="#" id="navLogoutLink" style="display:block;padding:12px 18px;font-size:0.87rem;color:#e53935;text-decoration:none;">🚪 Logout</a>
      </div>
    </div>`;

  const btn = document.getElementById('navUserBtn');
  const dd  = document.getElementById('navUserDropdown');
  const logout = document.getElementById('navLogoutLink');

  if (btn && dd) {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      dd.style.display = dd.style.display === 'none' ? 'block' : 'none';
    });
    document.addEventListener('click', (e) => {
      if (!item.contains(e.target)) dd.style.display = 'none';
    });
  }

  if (logout) {
    logout.addEventListener('click', (e) => {
      e.preventDefault();
      localStorage.removeItem('sw_user');
      localStorage.removeItem('sw_token');
      updateNavbarAuth();
      window.location.href = 'login.html';
    });
  }
}

// ---- ACCOUNT (inline signup fields) ----
function toggleAccountFields() {
  const cb = document.getElementById('createAccount');
  const box = document.getElementById('accountFields');
  if (!cb || !box) return;
  box.style.display = cb.checked ? 'block' : 'none';
}

function splitName(fullName) {
  const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] || 'Guest',
    lastName: parts.length > 1 ? parts.slice(1).join(' ') : '',
  };
}

function generateLocalTemporaryPassword() {
  const suffix = Math.random().toString(36).slice(2, 10).toUpperCase();
  return 'SW-' + suffix;
}

async function ensureAccountForRegistration() {
  const fullName = document.getElementById('fullName')?.value?.trim() || '';
  const email = document.getElementById('email')?.value?.trim() || '';
  const phone10 = document.getElementById('phone')?.value?.trim() || '';

  if (!fullName || !email || !phone10) {
    throw new Error('Please enter your name, WhatsApp number, and email first.');
  }

  const { firstName, lastName } = splitName(fullName);
  const phone = '+91' + phone10;

  // Try backend auto-account first. It creates or refreshes a temporary login password.
  try {
    const res = await fetch(CONFIG.BACKEND_URL + '/api/auth/auto-account', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ firstName, lastName, email, phone, whatsappConsent: true }),
    });
    const data = await res.json();

    if (data?.success && data?.token && data?.user && data?.temporaryPassword) {
      localStorage.setItem('sw_user', JSON.stringify(data.user));
      localStorage.setItem('sw_token', data.token);
      return {
        createdOrLoggedIn: true,
        mode: data.created ? 'auto_registered' : 'auto_login_refreshed',
        loginEmail: data.user.email || email,
        loginPassword: data.temporaryPassword,
      };
    }

    throw new Error(data?.message || 'Could not create your temporary login. Please try again.');
  } catch (e) {
    // Offline/local fallback (same storage model as auth.js)
    const temporaryPassword = generateLocalTemporaryPassword();
    const users = JSON.parse(localStorage.getItem('sw_users') || '[]');
    const existing = users.find(u => u.email === email);

    if (existing) {
      existing.password = temporaryPassword;
      existing.phone = existing.phone || phone;
      localStorage.setItem('sw_user', JSON.stringify(existing));
      localStorage.setItem('sw_token', 'local_' + existing.id);
      localStorage.setItem('sw_users', JSON.stringify(users));
      return {
        createdOrLoggedIn: true,
        mode: 'auto_login_refreshed_offline',
        loginEmail: existing.email,
        loginPassword: temporaryPassword,
      };
    }

    const newUser = {
      id: 'u_' + Date.now(),
      firstName,
      lastName,
      email,
      phone,
      password: temporaryPassword,
      city: '',
      whatsappConsent: true,
      memberType: 'FREE',
      registrations: [],
      joinedAt: new Date().toISOString(),
    };
    users.push(newUser);
    localStorage.setItem('sw_users', JSON.stringify(users));
    localStorage.setItem('sw_user', JSON.stringify(newUser));
    localStorage.setItem('sw_token', 'local_' + newUser.id);
    return {
      createdOrLoggedIn: true,
      mode: 'auto_registered_offline',
      loginEmail: email,
      loginPassword: temporaryPassword,
    };
  }
}

// ---- PAYMENT OPTION TOGGLE ----
function togglePayment(type) {
  document.getElementById('opt-free').classList.remove('active');
  document.getElementById('opt-paid').classList.remove('active');
  document.getElementById('opt-' + type).classList.add('active');
  document.getElementById('paymentMethodSection').style.display = type === 'paid' ? 'block' : 'none';
  const submitBtn = document.getElementById('submitBtn');
  if (type === 'paid') {
    submitBtn.textContent = 'Pay ₹99 with PhonePe';
    submitBtn.disabled = false;
  } else {
    submitBtn.textContent = 'Register & Get Meet Link';
    submitBtn.disabled = false;
  }
}

// ---- RAZORPAY PAYMENT ----
async function payWithRazorpay() {
  const name  = document.getElementById('fullName').value.trim();
  const phone = document.getElementById('phone').value.trim();
  const email = document.getElementById('email').value.trim();
  if (!name || !phone || !email) {
    alert('Please fill in your Name, WhatsApp number, and Email first.');
    return;
  }
  if (typeof Razorpay === 'undefined') {
    alert('Payment checkout could not load. Please refresh the page and try again.');
    return;
  }

  let order;
  try {
    const orderResponse = await fetch(`${CONFIG.BACKEND_URL}/api/payment/razorpay/create-order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, phone, email }),
    });
    order = await orderResponse.json();
    if (!orderResponse.ok || !order.success || !order.orderId) {
      alert(order.message || 'Could not create payment order. Please try again.');
      return;
    }
  } catch (_) {
    alert('Could not connect to payment server. Please try again.');
    return;
  }

  const options = {
    key:         order.keyId || CONFIG.RAZORPAY_KEY,
    amount:      order.amount || CONFIG.VIP_AMOUNT,
    currency:    order.currency || 'INR',
    order_id:    order.orderId,
    name:        'Sudha Wellness Webinar',
    description: 'VIP Webinar Registration',
    image:       'https://via.placeholder.com/60x60/2d7a4f/ffffff?text=SW',
    prefill:     { name, email, contact: '+91' + phone },
    theme:       { color: '#2d7a4f' },
    method:      { upi: true, card: true, netbanking: true, wallet: true },
    handler: async function (response) {
      let verified;
      try {
        const verifyResponse = await fetch(`${CONFIG.BACKEND_URL}/api/payment/razorpay/verify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...response, name, phone, email }),
        });
        verified = await verifyResponse.json();
        if (!verifyResponse.ok || !verified.success) {
          alert(verified.message || 'Payment could not be verified. Please contact support.');
          return;
        }
      } catch (_) {
        alert('Payment verification failed. Please contact support before retrying.');
        return;
      }

      const formData = collectFormData();
      formData.paymentId     = verified.paymentId || response.razorpay_payment_id;
      formData.paymentMethod = verified.paymentMethod || 'Razorpay';
      formData.regType       = 'VIP';
      try {
        const accountResult = await ensureAccountForRegistration();
        if (accountResult.createdOrLoggedIn) {
          formData.loginEmail = accountResult.loginEmail || formData.email;
          formData.loginPassword = accountResult.loginPassword || '';
        }
      } catch (e) {
        alert(e.message || 'Account setup failed.');
        return;
      }
      submitRegistration(formData);
    },
    modal: { ondismiss: function () { console.log('Razorpay closed'); } },
  };
  const rzp = new Razorpay(options);
  rzp.on('payment.failed', function (response) {
    alert('Payment failed: ' + response.error.description + '\nPlease try again.');
  });
  rzp.open();
}

// ---- PHONEPE PAYMENT ----
async function payWithPhonePe() {
  const name  = document.getElementById('fullName').value.trim();
  const phone = document.getElementById('phone').value.trim();
  const email = document.getElementById('email').value.trim();
  if (!name || !phone || !email) {
    alert('Please fill in your Name, WhatsApp number, and Email first.');
    return;
  }

  let accountResult = { createdOrLoggedIn: false };
  try {
    accountResult = await ensureAccountForRegistration();
  } catch (e) {
    alert(e.message || 'Account setup failed.');
    return;
  }

  // Store pending data so we can save after redirect-back
  const pending = { name, phone: '+91' + phone, email,
                    goal: document.getElementById('goal').value,
                    regType: 'VIP', paymentMethod: 'PhonePe',
                    loginEmail: accountResult.loginEmail || email,
                    loginPassword: accountResult.loginPassword || '' };
  localStorage.setItem('sw_pending_reg', JSON.stringify(pending));

  const submitBtn = document.getElementById('submitBtn');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Opening PhonePe...';
  }

  fetch(`${CONFIG.BACKEND_URL}/api/payment/phonepe/initiate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      phone,
      email,
      goal: pending.goal,
      loginEmail: pending.loginEmail,
      loginPassword: pending.loginPassword,
    }),
  })
    .then(r => r.json())
    .then(data => {
      if (data.success && data.redirectUrl) {
        window.location.href = data.redirectUrl;
      } else {
        alert(data.message || 'PhonePe initiation failed. Please try again.');
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Pay ₹99 with PhonePe';
        }
      }
    })
    .catch(() => {
      alert('Could not connect to payment server. Please try again.');
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Pay ₹99 with PhonePe';
      }
    });
}

// ---- COLLECT FORM DATA ----
function collectFormData() {
  return {
    name:  document.getElementById('fullName').value.trim(),
    phone: '+91' + document.getElementById('phone').value.trim(),
    email: document.getElementById('email').value.trim(),
    goal:  document.getElementById('goal').value,
    regType: document.querySelector('input[name="regType"]:checked').value === 'paid' ? 'VIP' : 'FREE',
    utrId: null,
    registeredAt: new Date().toISOString(),
  };
}

// ---- MAIN FORM SUBMIT ----
async function handleRegistration(event) {
  event.preventDefault();

  const regType = document.querySelector('input[name="regType"]:checked').value;
  if (regType === 'paid') {
    payWithPhonePe();
    return;
  }

  let accountResult = { createdOrLoggedIn: false };
  try {
    accountResult = await ensureAccountForRegistration();
  } catch (e) {
    alert(e.message || 'Account setup failed.');
    return;
  }

  const formData = collectFormData();
  if (accountResult.createdOrLoggedIn) {
    formData.loginEmail = accountResult.loginEmail || formData.email;
    formData.loginPassword = accountResult.loginPassword || '';
  }
  await submitRegistration(formData);
}

// ---- SUBMIT REGISTRATION (core function) ----
async function submitRegistration(formData) {
  if (isSubmittingRegistration) return;
  isSubmittingRegistration = true;

  const submitBtn = document.getElementById('submitBtn');
  if (submitBtn) {
    submitBtn.disabled    = true;
    submitBtn.textContent = '⏳ Saving your registration...';
  }

  // Build once — stable id prevents duplicate rows in dashboard
  const registration = buildRegistrationRecord(formData);
  const requiresVerifiedPayment = formData.regType === 'VIP';

  try {
    // Save free registrations locally first. Paid registrations wait for backend verification.
    if (!requiresVerifiedPayment) saveRegistrationToUser(registration);

    // Try to register on backend (sends email + WhatsApp)
    const response = await fetch(`${CONFIG.BACKEND_URL}/api/register`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        name:      formData.name,
        phone:     formData.phone,
        email:     formData.email,
        goal:      formData.goal,
        regType:   formData.regType,
        paymentId: formData.paymentId    || null,
        paymentMethod: formData.paymentMethod || null,
        utrId:     formData.utrId        || null,
        loginEmail: formData.loginEmail  || null,
        loginPassword: formData.loginPassword || null,
      }),
    });
    const data = await response.json();
    if (!response.ok || !data.success) {
      throw new Error(data.message || 'Registration could not be saved.');
    }
    if (requiresVerifiedPayment && data.regType !== 'VIP') {
      throw new Error('Payment was not verified, so VIP registration was not created.');
    }

    if (data.registrationId) registration.backendId = data.registrationId;
    registration.regType = data.regType || registration.regType;
    registration.amount = Number(data.amount ?? registration.amount) || 0;
    registration.paymentId = data.paymentId || registration.paymentId || null;
    registration.paymentMethod = data.paymentMethod || registration.paymentMethod || null;
    formData.regType = registration.regType;
    formData.paymentId = registration.paymentId;
    formData.paymentMethod = registration.paymentMethod;

    saveRegistrationToUser(registration);

    // Sync registration to the user account on backend
    await syncRegistrationToBackend(registration);

    showSuccessModal(formData, registration, false, data);

  } catch (error) {
    console.warn('Registration save failed:', error.message);
    if (requiresVerifiedPayment) {
      alert(error.message || 'Payment verification failed. Please try again.');
    } else {
      showSuccessModal(formData, registration, true);
    }
  } finally {
    isSubmittingRegistration = false;
    if (submitBtn) {
      submitBtn.disabled    = false;
      submitBtn.textContent = 'Register & Get Meet Link';
    }
  }
}

// ---- SUCCESS MODAL ----
function showSuccessModal(formData, registration, offline = false, delivery = null) {
  const modalMsg     = document.getElementById('modalMessage');
  const modalDetails = document.getElementById('modalDetails');
  const session      = JSON.parse(localStorage.getItem('sw_user') || 'null');

  if (offline) {
    modalMsg.textContent = 'You\'re registered! Our team will send your Meet link on email and WhatsApp shortly.';
  } else if (delivery && !delivery.emailSent && !delivery.whatsappSent) {
    modalMsg.textContent = 'You\'re registered! Automatic email/WhatsApp delivery is not configured yet.';
  } else {
    const sentTo = [
      delivery?.emailSent ? formData.email : null,
      delivery?.whatsappSent ? formData.phone : null,
    ].filter(Boolean).join(' and ');
    modalMsg.textContent = `Your Meet link has been sent to ${sentTo || 'your registered contact details'}.`;
  }

  const payLine = formData.regType === 'VIP'
    ? `💳 Payment: ₹99 ${formData.paymentId ? '(' + formData.paymentId + ')' : '(confirmed)'}`
    : '🎁 Registration: FREE';

  const dashLine = session
    ? '👉 <a href="dashboard.html" style="color:#2d7a4f;font-weight:700;">View in My Dashboard →</a>'
    : '👉 <a href="register.html" style="color:#2d7a4f;font-weight:700;">Create account to track your booking →</a>';

  modalDetails.innerHTML = `
    <strong>📋 Registration Confirmed!</strong><br/><br/>
    👤 Name: <strong>${formData.name}</strong><br/>
    📧 Email: ${formData.email}<br/>
    📱 WhatsApp: ${formData.phone}<br/>
    📅 Date: <strong>Tuesday, 21 July 2026 at 7:00 PM UTC</strong><br/>
    💻 Platform: Google Meet<br/>
    🎫 Type: <strong>${formData.regType}</strong> Registration<br/>
    ${payLine}<br/><br/>
    🔗 Meet Link: <code style="font-size:0.75rem;word-break:break-all;">${CONFIG.MEET_LINK}</code><br/><br/>
    ${dashLine}
  `;

  document.getElementById('successModal').style.display = 'flex';

  // Reset form
  document.getElementById('registerForm').reset();
  document.getElementById('paymentMethodSection').style.display = 'none';
  document.getElementById('opt-free').classList.add('active');
  document.getElementById('opt-paid').classList.remove('active');
}

// ---- CLOSE MODAL ----
function closeModal() {
  document.getElementById('successModal').style.display = 'none';
}
document.getElementById('successModal').addEventListener('click', function (e) {
  if (e.target === this) closeModal();
});

// ---- HANDLE PHONEPE REDIRECT BACK ----
(function handlePhonePeReturn() {
  const params  = new URLSearchParams(window.location.search);
  const payment = params.get('payment');
  if (!payment) return;

  window.history.replaceState({}, document.title, window.location.pathname + window.location.hash);

  const pending = JSON.parse(localStorage.getItem('sw_pending_reg') || 'null');
  if (payment === 'success' && pending) {
    localStorage.removeItem('sw_pending_reg');
    pending.paymentId     = params.get('txnId') || ('PP_' + Date.now());
    pending.paymentMethod = 'PhonePe';
    submitRegistration(pending);
    // Scroll to registration section
    setTimeout(() => document.getElementById('register')?.scrollIntoView({ behavior: 'smooth' }), 300);
  } else if (payment === 'failed') {
    alert('❌ Payment was not successful. Please try again.');
  }
})();

// ---- FAQ ACCORDION ----
function toggleFAQ(btn) {
  const answer = btn.nextElementSibling;
  const isOpen = answer.classList.contains('show');
  document.querySelectorAll('.faq-a').forEach(a => a.classList.remove('show'));
  document.querySelectorAll('.faq-q').forEach(q => q.classList.remove('open'));
  if (!isOpen) { answer.classList.add('show'); btn.classList.add('open'); }
}

// ---- NAVBAR SCROLL ----
window.addEventListener('scroll', () => {
  document.querySelector('.navbar').style.boxShadow = window.scrollY > 20
    ? '0 4px 30px rgba(0,0,0,0.15)'
    : '0 2px 20px rgba(0,0,0,0.08)';
});

// ---- SMOOTH SCROLL ----
document.querySelectorAll('a[href^="#"]').forEach(a => {
  a.addEventListener('click', e => {
    const target = document.querySelector(a.getAttribute('href'));
    if (target) {
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      document.querySelector('.nav-links').classList.remove('open');
    }
  });
});

// ---- INIT (safe on all pages that include app.js) ----
document.addEventListener('DOMContentLoaded', () => {
  loadWebinarDetails();
  updateNavbarAuth();
  toggleAccountFields();
});

window.addEventListener('layoutReady', updateNavbarAuth);
