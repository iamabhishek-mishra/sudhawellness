#!/usr/bin/env node

/**
 * WhatsApp Message Delivery Diagnostic
 * Checks why WhatsApp login confirmation messages aren't being sent
 */

require('dotenv').config();
const axios = require('axios');

console.log('\n🔍 WHATSAPP MESSAGE DELIVERY DIAGNOSTIC\n');
console.log('='.repeat(70));

// ============================================
// CHECK 1: WhatsApp Provider Configuration
// ============================================
console.log('\n📱 WhatsApp Provider Status:');
console.log('-'.repeat(70));

const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_WHATSAPP_FROM = process.env.TWILIO_WHATSAPP_FROM;

const META_WHATSAPP_TOKEN = process.env.META_WHATSAPP_TOKEN;
const META_PHONE_NUMBER_ID = process.env.META_PHONE_NUMBER_ID;
const META_TEMPLATE_NAME = process.env.META_TEMPLATE_NAME;

let activeProvider = null;

// Check Twilio
if (TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN) {
  if (TWILIO_ACCOUNT_SID.startsWith('AC')) {
    console.log('✅ Twilio WhatsApp: CONFIGURED');
    console.log(`   Account SID: ${TWILIO_ACCOUNT_SID.substring(0, 5)}...`);
    console.log(`   From: ${TWILIO_WHATSAPP_FROM}`);
    activeProvider = 'Twilio';
  } else {
    console.log('❌ Twilio WhatsApp: INVALID CONFIG');
    console.log(`   Account SID looks wrong: ${TWILIO_ACCOUNT_SID}`);
  }
} else {
  console.log('⏸️  Twilio WhatsApp: NOT CONFIGURED');
  if (!TWILIO_ACCOUNT_SID) console.log('   Missing: TWILIO_ACCOUNT_SID');
  if (!TWILIO_AUTH_TOKEN) console.log('   Missing: TWILIO_AUTH_TOKEN');
}

// Check Meta
if (META_WHATSAPP_TOKEN && META_PHONE_NUMBER_ID) {
  console.log('\n✅ Meta Cloud API: CONFIGURED');
  console.log(`   Token: ${META_WHATSAPP_TOKEN.substring(0, 10)}...`);
  console.log(`   Phone Number ID: ${META_PHONE_NUMBER_ID}`);
  console.log(`   Template Name: ${META_TEMPLATE_NAME || '❌ NOT SET (will send plain text)'}`);
  activeProvider = 'Meta';
} else {
  console.log('\n⏸️  Meta Cloud API: NOT FULLY CONFIGURED');
  if (!META_WHATSAPP_TOKEN) console.log('   Missing: META_WHATSAPP_TOKEN');
  if (!META_PHONE_NUMBER_ID) console.log('   Missing: META_PHONE_NUMBER_ID');
}

// ============================================
// CHECK 2: Which Provider Will Be Used
// ============================================
console.log('\n' + '='.repeat(70));
console.log('\n🎯 Provider Priority & Selection:');
console.log('-'.repeat(70));

if (META_WHATSAPP_TOKEN && META_PHONE_NUMBER_ID) {
  console.log('1️⃣  PRIMARY: Meta Cloud API (Official WhatsApp Business)');
  if (TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN) {
    console.log('2️⃣  FALLBACK: Twilio (if Meta fails)');
  }
  if (!META_TEMPLATE_NAME) {
    console.log('\n⚠️  WARNING: Meta will send PLAIN TEXT (not template)');
    console.log('   For production, set META_TEMPLATE_NAME in .env');
  }
} else if (TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN) {
  console.log('1️⃣  PRIMARY: Twilio WhatsApp Sandbox');
  console.log('\n⚠️  WARNING: Twilio sandbox needs phone number to be pre-approved');
  console.log('   Testing only works with numbers added to sandbox');
} else {
  console.log('❌ NO WHATSAPP PROVIDER CONFIGURED!');
  console.log('   Messages will NOT be sent.');
  console.log('   Set up either Twilio or Meta Cloud API.');
}

// ============================================
// CHECK 3: Test Meta API Connection
// ============================================
if (META_WHATSAPP_TOKEN && META_PHONE_NUMBER_ID) {
  console.log('\n' + '='.repeat(70));
  console.log('\n🧪 Testing Meta API Connection:');
  console.log('-'.repeat(70));

  (async () => {
    try {
      console.log('Testing Meta API with a test request...');
      
      // Try to get WhatsApp account info
      const response = await axios.get(
        `https://graph.facebook.com/v19.0/${META_PHONE_NUMBER_ID}`,
        {
          headers: {
            Authorization: `Bearer ${META_WHATSAPP_TOKEN}`,
          },
        }
      );

      console.log('✅ Meta API Connection: SUCCESS');
      console.log(`   Phone Number: ${response.data.display_phone_number || 'Unknown'}`);
      console.log(`   Phone ID: ${response.data.id}`);
      console.log(`   Status: ${response.data.status || 'Active'}`);

      // ============================================
      // CHECK 4: Test Message Sending
      // ============================================
      console.log('\n' + '='.repeat(70));
      console.log('\n📨 To Test Message Sending:');
      console.log('-'.repeat(70));

      console.log('\nRun this curl command:');
      console.log('\n```bash');
      console.log('curl -X POST http://localhost:3000/api/admin/resend-login-details \\');
      console.log('  -H "Content-Type: application/json" \\');
      console.log('  -H "x-admin-key: admin2025" \\');
      console.log('  -d \'{');
      console.log('    "name": "Test User",');
      console.log('    "phone": "+91YOUR_ACTUAL_WHATSAPP_NUMBER",');
      console.log('    "email": "your-email@example.com",');
      console.log('    "regType": "VIP"');
      console.log('  }\'');
      console.log('```\n');

      console.log('Then check backend logs for:');
      console.log('  ✅ "Meta WhatsApp sent to..."');
      console.log('  ✅ "Email sent to..."');
      console.log('  ❌ Error messages (if any)\n');

    } catch (err) {
      console.log('❌ Meta API Connection: FAILED');
      console.log(`   Error: ${err.response?.data?.error?.message || err.message}`);
      console.log('\n⚠️  Issues to check:');
      console.log('   1. Meta token expired or invalid');
      console.log('   2. Phone number ID incorrect');
      console.log('   3. Internet connection issue');
      console.log('   4. Rate limit exceeded\n');
    }

    // ============================================
    // CHECK 5: Common Issues
    // ============================================
    console.log('\n' + '='.repeat(70));
    console.log('\n🐛 Common Issues & Solutions:');
    console.log('-'.repeat(70));

    const issues = [];

    if (!META_TEMPLATE_NAME) {
      issues.push({
        title: 'No Template Set',
        problem: 'Messages sent as plain text, not template',
        solution: 'Set META_TEMPLATE_NAME in .env (recommended for production)',
      });
    }

    if (process.env.SMTP_PASS && process.env.SMTP_PASS.includes(' ')) {
      issues.push({
        title: 'Email Password Has Spaces',
        problem: 'Email delivery failing',
        solution: 'Update SMTP_PASS without spaces',
      });
    }

    if (process.env.PHONEPE_ENV === 'TEST' && process.env.PHONEPE_ENV !== 'PROD') {
      // Not an issue, just info
    }

    if (issues.length > 0) {
      issues.forEach((issue, i) => {
        console.log(`\n${i + 1}. ${issue.title}`);
        console.log(`   Problem: ${issue.problem}`);
        console.log(`   Solution: ${issue.solution}`);
      });
    } else {
      console.log('\n✅ No obvious issues detected');
    }

    // ============================================
    // CHECK 6: Backend Status
    // ============================================
    console.log('\n' + '='.repeat(70));
    console.log('\n✅ Next Steps:');
    console.log('-'.repeat(70));

    console.log('\n1. Restart backend:');
    console.log('   npm start\n');

    console.log('2. Test WhatsApp message sending:');
    console.log('   curl -X POST http://localhost:3000/api/admin/resend-login-details \\');
    console.log('     -H "Content-Type: application/json" \\');
    console.log('     -H "x-admin-key: admin2025" \\');
    console.log('     -d \'{...}\'\n');

    console.log('3. Check backend terminal for logs:');
    console.log('   ✅ "Meta WhatsApp sent to..."');
    console.log('   ✅ "Email sent to..."\n');

    console.log('4. Check your WhatsApp for incoming message\n');

    console.log('='.repeat(70) + '\n');
  })();
} else {
  console.log('\n' + '='.repeat(70));
  console.log('\n❌ FATAL: No WhatsApp Provider Configured');
  console.log('   Messages cannot be sent');
  console.log('   Set up Meta Cloud API or Twilio in .env\n');
  console.log('='.repeat(70) + '\n');
}
