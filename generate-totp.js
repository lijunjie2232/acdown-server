#!/usr/bin/env node

/**
 * Generate current TOTP code for testing
 * Usage: node generate-totp.js
 */

const { totp } = require('otplib');
const config = require('./config');

console.log('='.repeat(60));
console.log('TOTP Code Generator');
console.log('='.repeat(60));
console.log('\nUsing TOTP_SECRET from .env file');
console.log('Secret:', config.totpSecret);
console.log('\nCurrent TOTP Code:', totp.generate(config.totpSecret));
console.log('\nThis code is valid for 30 seconds');
console.log('='.repeat(60));
