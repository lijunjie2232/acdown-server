// In-memory session store (in production, use KV or D1)
const sessions = new Map();

/**
 * Generate a random session token
 */
function generateSessionToken() {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Convert base32 string to bytes
 */
function base32ToBytes(base32) {
  const base32Chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const bits = base32.replace(/=+$/, '').split('').map(char => {
    const index = base32Chars.indexOf(char.toUpperCase());
    if (index === -1) throw new Error('Invalid base32 character');
    return index.toString(2).padStart(5, '0');
  }).join('');
  
  const bytes = [];
  for (let i = 0; i < bits.length; i += 8) {
    const byte = bits.substr(i, 8);
    if (byte.length === 8) {
      bytes.push(parseInt(byte, 2));
    }
  }
  
  return new Uint8Array(bytes);
}

/**
 * Generate TOTP token using Web Crypto API
 */
async function generateTOTP(key, timeWindow) {
  // Convert time window to 8-byte buffer
  const timeBuffer = new ArrayBuffer(8);
  const view = new DataView(timeBuffer);
  view.setBigUint64(0, BigInt(timeWindow), false); // Big-endian
  
  // Import key for HMAC-SHA1
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key,
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign']
  );
  
  // Generate HMAC
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, timeBuffer);
  const hmac = new Uint8Array(signature);
  
  // Dynamic truncation
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary = ((hmac[offset] & 0x7f) << 24) |
                ((hmac[offset + 1] & 0xff) << 16) |
                ((hmac[offset + 2] & 0xff) << 8) |
                (hmac[offset + 3] & 0xff);
  
  // Generate 6-digit code
  const otp = binary % 1000000;
  return otp.toString().padStart(6, '0');
}

/**
 * Verify TOTP code and create session
 * @param {string} code - TOTP code from authenticator
 * @param {string} totpSecret - TOTP secret from environment
 * @param {Object} env - Environment variables
 * @returns {Object|null} Session token or null if invalid
 */
export async function verifyTOTP(code, totpSecret, env) {
  try {
    // Decode base32 secret
    const key = base32ToBytes(totpSecret);
    
    // Get current time window
    const epoch = Math.floor(Date.now() / 1000);
    const timeWindow = Math.floor(epoch / 30);
    
    // Check current and adjacent time windows (for clock skew)
    let isValid = false;
    for (let offset = -1; offset <= 1; offset++) {
      const currentTime = timeWindow + offset;
      const expectedToken = await generateTOTP(key, currentTime);
      
      if (code === expectedToken) {
        isValid = true;
        break;
      }
    }
    
    if (!isValid) {
      return null;
    }
    
    // Get token expiry from environment (default: 7 days = 604800 seconds)
    const tokenExpirySeconds = parseInt(env.TOKEN_EXPIRY) || 604800;
    const SESSION_TTL = tokenExpirySeconds * 1000; // Convert to milliseconds
    
    // Create session
    const token = generateSessionToken();
    const expiresAt = Date.now() + SESSION_TTL;
    
    sessions.set(token, { expiresAt });
    
    // Clean up expired sessions periodically
    cleanupExpiredSessions();
    
    return { token, expiresAt };
  } catch (error) {
    console.error('TOTP verification error:', error);
    return null;
  }
}

/**
 * Validate session token
 * @param {string} token - Session token
 * @returns {boolean} True if valid
 */
export function validateSession(token) {
  if (!token || !sessions.has(token)) {
    return false;
  }
  
  const session = sessions.get(token);
  
  // Check if session has expired
  if (Date.now() > session.expiresAt) {
    sessions.delete(token);
    return false;
  }
  
  return true;
}

/**
 * Clean up expired sessions
 */
function cleanupExpiredSessions() {
  const now = Date.now();
  for (const [token, session] of sessions.entries()) {
    if (now > session.expiresAt) {
      sessions.delete(token);
    }
  }
}

/**
 * Authentication middleware for Workers
 * @param {Request} request - Fetch request
 * @param {Object} env - Environment variables
 * @returns {Response|null} Error response or null if authenticated
 */
export function authMiddleware(request, env) {
  const token = request.headers.get('x-auth-token');
  
  if (!token) {
    return new Response(
      JSON.stringify({
        success: false,
        error: {
          code: 'AUTH_REQUIRED',
          message: 'Authentication token is required',
        },
      }),
      {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
  
  if (!validateSession(token)) {
    return new Response(
      JSON.stringify({
        success: false,
        error: {
          code: 'AUTH_INVALID',
          message: 'Invalid or expired authentication token',
        },
      }),
      {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
  
  return null; // Authenticated
}
