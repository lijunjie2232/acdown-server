import { verifyTOTP } from '../middleware/auth-worker';

/**
 * Generate a random TOTP secret (base32 encoded)
 * @returns {string} Base32 encoded secret
 */
function generateTOTPSecret() {
  // Generate 20 random bytes (160 bits) for the secret
  const randomBytes = new Uint8Array(20);
  crypto.getRandomValues(randomBytes);
  
  // Convert to base32
  const base32Chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let base32 = '';
  
  for (let i = 0; i < randomBytes.length; i += 5) {
    const byte1 = randomBytes[i];
    const byte2 = randomBytes[i + 1] || 0;
    const byte3 = randomBytes[i + 2] || 0;
    const byte4 = randomBytes[i + 3] || 0;
    const byte5 = randomBytes[i + 4] || 0;
    
    base32 += base32Chars[(byte1 >> 3) & 0x1F];
    base32 += base32Chars[((byte1 & 0x07) << 2) | ((byte2 >> 6) & 0x03)];
    base32 += base32Chars[(byte2 >> 1) & 0x1F];
    base32 += base32Chars[((byte2 & 0x01) << 4) | ((byte3 >> 4) & 0x0F)];
    base32 += base32Chars[((byte3 & 0x0F) << 1) | ((byte4 >> 7) & 0x01)];
    base32 += base32Chars[(byte4 >> 2) & 0x1F];
    base32 += base32Chars[((byte4 & 0x03) << 3) | ((byte5 >> 5) & 0x07)];
    base32 += base32Chars[byte5 & 0x1F];
  }
  
  return base32;
}

/**
 * Handle auth routes for Cloudflare Workers
 * @param {Request} request - Fetch request
 * @param {Object} env - Environment variables
 * @returns {Response} Response
 */
export async function handleAuthRoutes(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;

  // POST /api/auth/login
  if (path === '/api/auth/login' && request.method === 'POST') {
    return await handleLogin(request, env);
  }

  // GET /api/auth/generate-secret
  if (path === '/api/auth/generate-secret' && request.method === 'GET') {
    return await handleGenerateSecret();
  }

  return new Response(
    JSON.stringify({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: 'Auth endpoint not found',
      },
    }),
    {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    }
  );
}

/**
 * Handle login endpoint
 */
async function handleLogin(request, env) {
  try {
    const body = await request.json();
    const { totpCode } = body;

    if (!totpCode) {
      return new Response(
        JSON.stringify({
          success: false,
          error: {
            code: 'MISSING_TOTP',
            message: 'TOTP code is required',
          },
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    const result = await verifyTOTP(totpCode, env.TOTP_SECRET, env);

    if (!result) {
      return new Response(
        JSON.stringify({
          success: false,
          error: {
            code: 'TOTP_INVALID',
            message: 'Invalid TOTP code',
          },
        }),
        {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          token: result.token,
          expiresAt: result.expiresAt,
        },
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Login error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: {
          code: 'LOGIN_FAILED',
          message: 'Login failed due to server error',
        },
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}

/**
 * Handle generate secret endpoint
 */
async function handleGenerateSecret() {
  try {
    const secret = generateTOTPSecret();
    
    return new Response(
      JSON.stringify({
        success: true,
        data: {
          secret: secret,
        },
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Generate secret error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: {
          code: 'GENERATE_SECRET_FAILED',
          message: 'Failed to generate secret',
        },
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}
