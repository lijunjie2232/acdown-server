// In-memory session store removed - using stateless tokens instead
// Tokens are self-contained with HMAC signature for verification

/**
 * Generate a stateless authentication token with HMAC signature
 * Format: base64url(payload).base64url(signature)
 * @param {Object} env - Environment variables
 * @returns {string} Signed token
 */
function generateStatelessToken(env) {
  // Get token expiry from environment (default: 7 days = 604800 seconds)
  const tokenExpirySeconds = parseInt(env.TOKEN_EXPIRY) || 604800;
  const expiresAt = Date.now() + (tokenExpirySeconds * 1000);
  
  // Create payload
  const payload = {
    exp: expiresAt,
    iat: Date.now(),
  };
  
  // Convert payload to base64url
  const payloadStr = JSON.stringify(payload);
  const payloadBase64 = btoa(payloadStr).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  
  // Create HMAC signature using ENCRYPTION_KEY as signing key
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(env.ENCRYPTION_KEY),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  ).then(async (key) => {
    const signature = await crypto.subtle.sign(
      'HMAC',
      key,
      new TextEncoder().encode(payloadBase64)
    );
    
    // Convert signature to base64url
    const signatureBase64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
    
    return {
      token: `${payloadBase64}.${signatureBase64}`,
      expiresAt: expiresAt,
    };
  });
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
 * Verify TOTP code and generate stateless token
 * @param {string} code - TOTP code from authenticator
 * @param {string} totpSecret - TOTP secret from environment
 * @param {Object} env - Environment variables
 * @returns {Object|null} Token object or null if invalid
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
    
    // Generate stateless token
    return await generateStatelessToken(env);
  } catch (error) {
    console.error('TOTP verification error:', error);
    return null;
  }
}

/**
 * Validate stateless token by verifying HMAC signature and expiry
 * @param {string} token - Stateless token
 * @param {Object} env - Environment variables
 * @returns {boolean} True if valid
 */
export async function validateStatelessToken(token, env) {
  try {
    if (!token) {
      return false;
    }
    
    // Split token into payload and signature
    const parts = token.split('.');
    if (parts.length !== 2) {
      return false;
    }
    
    const [payloadBase64, signatureBase64] = parts;
    
    // Verify HMAC signature
    const signatureValid = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(env.ENCRYPTION_KEY),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    ).then(async (key) => {
      // Convert base64url signature back to bytes
      const signatureStr = signatureBase64.replace(/-/g, '+').replace(/_/g, '/');
      const padding = '='.repeat((4 - signatureStr.length % 4) % 4);
      const signatureBytes = Uint8Array.from(atob(signatureStr + padding), c => c.charCodeAt(0));
      
      return await crypto.subtle.verify(
        'HMAC',
        key,
        signatureBytes,
        new TextEncoder().encode(payloadBase64)
      );
    });
    
    if (!signatureValid) {
      return false;
    }
    
    // Decode payload
    const payloadStr = atob(payloadBase64.replace(/-/g, '+').replace(/_/g, '/'));
    const payload = JSON.parse(payloadStr);
    
    // Check expiration
    if (Date.now() > payload.exp) {
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('Token validation error:', error);
    return false;
  }
}

/**
 * Validate session token (legacy support - always returns false)
 * @param {string} token - Session token
 * @returns {boolean} True if valid
 */
export function validateSession(token) {
  // Deprecated: use validateStatelessToken instead
  return false;
}

/**
 * Authentication middleware for Workers (stateless)
 * @param {Request} request - Fetch request
 * @param {Object} env - Environment variables
 * @returns {Promise<Response|null>} Error response or null if authenticated
 */
export async function authMiddleware(request, env) {
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
  
  const isValid = await validateStatelessToken(token, env);
  if (!isValid) {
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
