import { handleAuthRoutes } from './routes/auth';
import { handleProxyRoutes } from './routes/proxy';
import { handleConfigRoutes } from './routes/config';

/**
 * Cloudflare Worker entry point
 */
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Auth-Token',
    };

    // Handle preflight requests
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders,
      });
    }

    try {
      // Health check endpoint
      if (path === '/health' && request.method === 'GET') {
        return new Response(
          JSON.stringify({
            success: true,
            data: {
              status: 'ok',
              timestamp: new Date().toISOString(),
            },
          }),
          {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
              ...corsHeaders,
            },
          }
        );
      }

      // Welcome page
      if (path === '/' && request.method === 'GET') {
        return await serveWelcomePage();
      }

      // Auth routes
      if (path.startsWith('/api/auth/')) {
        const response = await handleAuthRoutes(request, env);
        return addCorsHeaders(response, corsHeaders);
      }

      // Config routes
      if (path.startsWith('/api/config')) {
        const response = await handleConfigRoutes(request, env);
        return addCorsHeaders(response, corsHeaders);
      }

      // Proxy routes
      if (path.startsWith('/api/proxy/')) {
        const response = await handleProxyRoutes(request, env);
        return addCorsHeaders(response, corsHeaders);
      }

      // TOTP setup page
      if (path === '/totp-setup' && request.method === 'GET') {
        return await serveTOTPSetupPage();
      }

      // 404 handler
      return new Response(
        JSON.stringify({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Endpoint not found',
          },
        }),
        {
          status: 404,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders,
          },
        }
      );
    } catch (error) {
      console.error('Unhandled error:', error);
      return new Response(
        JSON.stringify({
          success: false,
          error: {
            code: 'INTERNAL_ERROR',
            message: 'An internal server error occurred',
          },
        }),
        {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders,
          },
        }
      );
    }
  },
};

/**
 * Add CORS headers to response
 */
function addCorsHeaders(response, corsHeaders) {
  const newHeaders = new Headers(response.headers);
  Object.entries(corsHeaders).forEach(([key, value]) => {
    newHeaders.set(key, value);
  });
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  });
}

/**
 * Serve TOTP setup page
 */
async function serveTOTPSetupPage() {
  try {
    // For Cloudflare Workers with assets, we can embed the HTML directly
    // This is a fallback if assets binding doesn't work
    const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>TOTP Secret Generator</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
            padding: 20px;
        }

        .container {
            background: white;
            border-radius: 16px;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
            padding: 40px;
            max-width: 600px;
            width: 100%;
        }

        h1 {
            color: #333;
            margin-bottom: 10px;
            font-size: 28px;
            text-align: center;
        }

        .subtitle {
            color: #666;
            text-align: center;
            margin-bottom: 30px;
            font-size: 14px;
        }

        .section {
            margin-bottom: 30px;
            padding: 20px;
            background: #f8f9fa;
            border-radius: 8px;
        }

        .section-title {
            font-size: 18px;
            color: #333;
            margin-bottom: 15px;
            font-weight: 600;
        }

        .qr-container {
            display: flex;
            justify-content: center;
            margin: 20px 0;
        }

        #qrcode {
            padding: 10px;
            background: white;
            border-radius: 8px;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        }

        .secret-display {
            display: flex;
            align-items: center;
            gap: 10px;
            margin-top: 15px;
        }

        .secret-value {
            flex: 1;
            padding: 12px;
            background: white;
            border: 2px solid #e0e0e0;
            border-radius: 6px;
            font-family: 'Courier New', monospace;
            font-size: 16px;
            color: #333;
            word-break: break-all;
        }

        .copy-btn {
            padding: 12px 20px;
            background: #667eea;
            color: white;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-size: 14px;
            transition: all 0.3s;
            white-space: nowrap;
        }

        .copy-btn:hover {
            background: #5568d3;
            transform: translateY(-2px);
        }

        .copy-btn:active {
            transform: translateY(0);
        }

        .copy-btn.copied {
            background: #4caf50;
        }

        .verify-form {
            display: flex;
            flex-direction: column;
            gap: 15px;
        }

        .input-group {
            display: flex;
            flex-direction: column;
            gap: 8px;
        }

        .input-group label {
            font-size: 14px;
            color: #555;
            font-weight: 500;
        }

        .input-group input {
            padding: 12px;
            border: 2px solid #e0e0e0;
            border-radius: 6px;
            font-size: 16px;
            transition: border-color 0.3s;
        }

        .input-group input:focus {
            outline: none;
            border-color: #667eea;
        }

        .verify-btn {
            padding: 14px;
            background: #667eea;
            color: white;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-size: 16px;
            font-weight: 600;
            transition: all 0.3s;
        }

        .verify-btn:hover {
            background: #5568d3;
            transform: translateY(-2px);
        }

        .verify-btn:disabled {
            background: #ccc;
            cursor: not-allowed;
            transform: none;
        }

        .result {
            padding: 15px;
            border-radius: 6px;
            margin-top: 15px;
            display: none;
        }

        .result.success {
            background: #d4edda;
            color: #155724;
            border: 1px solid #c3e6cb;
            display: block;
        }

        .result.error {
            background: #f8d7da;
            color: #721c24;
            border: 1px solid #f5c6cb;
            display: block;
        }

        .loading {
            text-align: center;
            color: #667eea;
            padding: 20px;
        }

        .instructions {
            background: #e7f3ff;
            border-left: 4px solid #667eea;
            padding: 15px;
            margin-bottom: 20px;
            border-radius: 4px;
        }

        .instructions h3 {
            color: #667eea;
            margin-bottom: 10px;
            font-size: 16px;
        }

        .instructions ol {
            margin-left: 20px;
            color: #555;
            line-height: 1.8;
        }

        .instructions li {
            margin-bottom: 5px;
        }

        .generate-btn {
            width: 100%;
            padding: 14px;
            background: #764ba2;
            color: white;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-size: 16px;
            font-weight: 600;
            transition: all 0.3s;
            margin-bottom: 20px;
        }

        .generate-btn:hover {
            background: #653a91;
            transform: translateY(-2px);
        }

        .generate-btn:disabled {
            background: #ccc;
            cursor: not-allowed;
            transform: none;
        }

        .secret-input-section {
            margin-bottom: 20px;
            padding: 20px;
            background: #f8f9fa;
            border-radius: 8px;
        }

        .secret-input-section .section-title {
            font-size: 18px;
            color: #333;
            margin-bottom: 15px;
            font-weight: 600;
        }

        .input-with-button {
            display: flex;
            gap: 10px;
            align-items: stretch;
        }

        .input-with-button input {
            flex: 1;
            padding: 12px;
            border: 2px solid #e0e0e0;
            border-radius: 6px;
            font-size: 16px;
            font-family: 'Courier New', monospace;
            transition: border-color 0.3s;
        }

        .input-with-button input:focus {
            outline: none;
            border-color: #667eea;
        }

        .input-with-button button {
            padding: 12px 24px;
            background: #667eea;
            color: white;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 600;
            transition: all 0.3s;
            white-space: nowrap;
        }

        .input-with-button button:hover {
            background: #5568d3;
            transform: translateY(-2px);
        }

        .input-with-button button:disabled {
            background: #ccc;
            cursor: not-allowed;
            transform: none;
        }

        .or-divider {
            text-align: center;
            margin: 20px 0;
            position: relative;
            color: #999;
        }

        .or-divider::before,
        .or-divider::after {
            content: '';
            position: absolute;
            top: 50%;
            width: 45%;
            height: 1px;
            background: #e0e0e0;
        }

        .or-divider::before {
            left: 0;
        }

        .or-divider::after {
            right: 0;
        }

        .hidden {
            display: none;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🔐 TOTP Secret Generator</h1>
        <p class="subtitle">Generate and verify TOTP secrets for Cloudflare Workers</p>

        <div class="secret-input-section">
            <div class="section-title">Option 1: Use Existing Secret</div>
            <div class="input-with-button">
                <input 
                    type="text" 
                    id="existingSecret" 
                    placeholder="Enter your existing TOTP secret (Base32)"
                    autocomplete="off"
                >
                <button id="useExistingBtn" type="button">Use This Secret</button>
            </div>
        </div>

        <div class="or-divider">OR</div>

        <button id="generateBtn" class="generate-btn">✨ Generate New Secret</button>

        <div id="content" class="hidden">
            <div class="instructions">
                <h3>📱 Setup Instructions:</h3>
                <ol>
                    <li>Scan the QR code with Google Authenticator or any TOTP app</li>
                    <li>Copy the secret and save it to Cloudflare Workers environment variable <code>TOTP_SECRET</code></li>
                    <li>Enter the 6-digit code from your authenticator app below to verify</li>
                </ol>
            </div>

            <div class="section">
                <div class="section-title">Step 1: Scan QR Code</div>
                <div class="qr-container">
                    <div id="qrcode"></div>
                </div>
            </div>

            <div class="section">
                <div class="section-title">Step 2: Copy Secret</div>
                <div class="secret-display">
                    <div id="secretValue" class="secret-value"></div>
                    <button id="copyBtn" class="copy-btn">📋 Copy</button>
                </div>
            </div>

            <div class="section">
                <div class="section-title">Step 3: Verify Code</div>
                <form id="verifyForm" class="verify-form">
                    <div class="input-group">
                        <label for="totpCode">Enter 6-digit TOTP Code:</label>
                        <input 
                            type="text" 
                            id="totpCode" 
                            placeholder="123456" 
                            maxlength="6" 
                            pattern="[0-9]{6}"
                            required
                        >
                    </div>
                    <button type="submit" class="verify-btn">Verify Code</button>
                </form>
                <div id="verifyResult" class="result"></div>
            </div>
        </div>

        <div id="loading" class="loading hidden">Generating secret...</div>
    </div>

    <script src="https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js"></script>
    <script>
        let currentSecret = null;

        // Use existing secret
        document.getElementById('useExistingBtn').addEventListener('click', () => {
            const existingSecretInput = document.getElementById('existingSecret');
            const secret = existingSecretInput.value.trim().toUpperCase();

            if (!secret) {
                alert('Please enter a TOTP secret');
                return;
            }

            // Basic validation for Base32 format
            const base32Regex = /^[A-Z2-7]+=*$/;
            if (!base32Regex.test(secret)) {
                alert('Invalid Base32 format. Secret should only contain characters A-Z and 2-7.');
                return;
            }

            currentSecret = secret;
            displaySecret(currentSecret);
            
            // Clear the input
            existingSecretInput.value = '';
            
            // Show content
            const content = document.getElementById('content');
            content.classList.remove('hidden');
            
            // Scroll to content
            content.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });

        // Generate new secret
        document.getElementById('generateBtn').addEventListener('click', async () => {
            const loading = document.getElementById('loading');
            const content = document.getElementById('content');
            const generateBtn = document.getElementById('generateBtn');

            generateBtn.disabled = true;
            loading.classList.remove('hidden');
            content.classList.add('hidden');

            try {
                const response = await fetch('/api/auth/generate-secret');
                const data = await response.json();

                if (data.success) {
                    currentSecret = data.data.secret;
                    displaySecret(currentSecret);
                    loading.classList.add('hidden');
                    content.classList.remove('hidden');
                } else {
                    alert('Failed to generate secret: ' + data.error.message);
                }
            } catch (error) {
                console.error('Error:', error);
                alert('Error generating secret');
            } finally {
                generateBtn.disabled = false;
            }
        });

        // Display secret and generate QR code
        function displaySecret(secret) {
            // Display secret value
            document.getElementById('secretValue').textContent = secret;

            // Generate QR code with otpauth URI
            const otpauthUri = \`otpauth://totp/ACDown%20Server?secret=\${secret}&issuer=ACDown%20Server\`;
            
            // Clear previous QR code
            const qrContainer = document.getElementById('qrcode');
            qrContainer.innerHTML = '';

            // Generate new QR code
            new QRCode(qrContainer, {
                text: otpauthUri,
                width: 200,
                height: 200,
                colorDark: '#000000',
                colorLight: '#ffffff',
                correctLevel: QRCode.CorrectLevel.M
            });
        }

        // Copy secret to clipboard
        document.getElementById('copyBtn').addEventListener('click', async () => {
            const secret = document.getElementById('secretValue').textContent;
            const copyBtn = document.getElementById('copyBtn');

            try {
                await navigator.clipboard.writeText(secret);
                copyBtn.textContent = '✓ Copied!';
                copyBtn.classList.add('copied');

                setTimeout(() => {
                    copyBtn.textContent = '📋 Copy';
                    copyBtn.classList.remove('copied');
                }, 2000);
            } catch (error) {
                // Fallback for older browsers
                const textArea = document.createElement('textarea');
                textArea.value = secret;
                document.body.appendChild(textArea);
                textArea.select();
                document.execCommand('copy');
                document.body.removeChild(textArea);

                copyBtn.textContent = '✓ Copied!';
                copyBtn.classList.add('copied');

                setTimeout(() => {
                    copyBtn.textContent = '📋 Copy';
                    copyBtn.classList.remove('copied');
                }, 2000);
            }
        });

        // Verify TOTP code
        document.getElementById('verifyForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const totpCode = document.getElementById('totpCode').value;
            const verifyBtn = e.target.querySelector('.verify-btn');
            const resultDiv = document.getElementById('verifyResult');

            if (!currentSecret) {
                showResult('Please generate a secret first', 'error');
                return;
            }

            if (!/^\\d{6}$/.test(totpCode)) {
                showResult('Please enter a valid 6-digit code', 'error');
                return;
            }

            verifyBtn.disabled = true;
            verifyBtn.textContent = 'Verifying...';

            try {
                // Use Web Crypto API to verify TOTP locally
                const isValid = await verifyTOTP(totpCode, currentSecret);
                
                if (isValid) {
                    showResult('✅ Verification successful! The code is valid.', 'success');
                } else {
                    showResult('❌ Verification failed. The code is invalid or has expired.', 'error');
                }
            } catch (error) {
                console.error('Verification error:', error);
                showResult('Error during verification', 'error');
            } finally {
                verifyBtn.disabled = false;
                verifyBtn.textContent = 'Verify Code';
            }
        });

        // Show result message
        function showResult(message, type) {
            const resultDiv = document.getElementById('verifyResult');
            resultDiv.textContent = message;
            resultDiv.className = \`result \${type}\`;
        }

        // TOTP verification using Web Crypto API
        async function verifyTOTP(token, secret) {
            try {
                // Decode base32 secret
                const key = base32ToBytes(secret);
                
                // Get current time window
                const epoch = Math.floor(Date.now() / 1000);
                const timeWindow = Math.floor(epoch / 30);
                
                // Check current and adjacent time windows (for clock skew)
                for (let offset = -1; offset <= 1; offset++) {
                    const currentTime = timeWindow + offset;
                    const expectedToken = await generateTOTP(key, currentTime);
                    
                    if (token === expectedToken) {
                        return true;
                    }
                }
                
                return false;
            } catch (error) {
                console.error('TOTP verification error:', error);
                return false;
            }
        }

        // Generate TOTP token
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

        // Convert base32 string to bytes
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
    </script>
</body>
</html>`;
    
    return new Response(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
      },
    });
  } catch (error) {
    console.error('Error serving TOTP setup page:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: {
          code: 'PAGE_NOT_FOUND',
          message: 'TOTP setup page not found',
        },
      }),
      {
        status: 404,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
  }
}

/**
 * Serve welcome page
 */
async function serveWelcomePage() {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>ACDown Server - Welcome</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
            padding: 20px;
        }

        .container {
            background: white;
            border-radius: 20px;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
            padding: 60px 40px;
            max-width: 800px;
            width: 100%;
            text-align: center;
        }

        .logo {
            font-size: 64px;
            margin-bottom: 20px;
        }

        h1 {
            color: #333;
            font-size: 36px;
            margin-bottom: 10px;
            font-weight: 700;
        }

        .tagline {
            color: #666;
            font-size: 18px;
            margin-bottom: 40px;
        }

        .features {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin: 40px 0;
            text-align: left;
        }

        .feature {
            padding: 20px;
            background: #f8f9fa;
            border-radius: 12px;
            transition: transform 0.3s, box-shadow 0.3s;
        }

        .feature:hover {
            transform: translateY(-5px);
            box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
        }

        .feature-icon {
            font-size: 32px;
            margin-bottom: 10px;
        }

        .feature-title {
            font-size: 16px;
            font-weight: 600;
            color: #333;
            margin-bottom: 5px;
        }

        .feature-desc {
            font-size: 14px;
            color: #666;
            line-height: 1.5;
        }

        .cta-section {
            margin-top: 40px;
            padding: 30px;
            background: linear-gradient(135deg, #667eea15 0%, #764ba215 100%);
            border-radius: 12px;
            border: 2px solid #667eea30;
        }

        .cta-title {
            font-size: 20px;
            color: #333;
            margin-bottom: 10px;
            font-weight: 600;
        }

        .cta-desc {
            color: #666;
            margin-bottom: 20px;
            font-size: 15px;
        }

        .btn {
            display: inline-block;
            padding: 16px 40px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            text-decoration: none;
            border-radius: 8px;
            font-size: 16px;
            font-weight: 600;
            transition: all 0.3s;
            box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
            border: none;
            cursor: pointer;
        }

        .btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 6px 20px rgba(102, 126, 234, 0.6);
        }

        .btn:active {
            transform: translateY(0);
        }

        .links {
            margin-top: 30px;
            display: flex;
            justify-content: center;
            gap: 20px;
            flex-wrap: wrap;
        }

        .link {
            color: #667eea;
            text-decoration: none;
            font-size: 14px;
            transition: color 0.3s;
        }

        .link:hover {
            color: #764ba2;
            text-decoration: underline;
        }

        .footer {
            margin-top: 40px;
            padding-top: 20px;
            border-top: 1px solid #e0e0e0;
            color: #999;
            font-size: 13px;
        }

        @media (max-width: 600px) {
            .container {
                padding: 40px 20px;
            }

            h1 {
                font-size: 28px;
            }

            .tagline {
                font-size: 16px;
            }

            .features {
                grid-template-columns: 1fr;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="logo">🚀</div>
        <h1>ACDown Server</h1>
        <p class="tagline">Secure File Proxy & Download Server</p>

        <div class="features">
            <div class="feature">
                <div class="feature-icon">🔐</div>
                <div class="feature-title">TOTP Authentication</div>
                <div class="feature-desc">Secure two-factor authentication with time-based one-time passwords</div>
            </div>
            <div class="feature">
                <div class="feature-icon">📦</div>
                <div class="feature-title">Chunked Downloads</div>
                <div class="feature-desc">Split large files into encrypted chunks for efficient downloading</div>
            </div>
            <div class="feature">
                <div class="feature-icon">⚡</div>
                <div class="feature-title">Streaming Support</div>
                <div class="feature-desc">Direct streaming from remote servers with range request support</div>
            </div>
            <div class="feature">
                <div class="feature-icon">🛡️</div>
                <div class="feature-title">Encrypted Parameters</div>
                <div class="feature-desc">All download parameters encrypted using AES-256-CBC</div>
            </div>
        </div>

        <div class="cta-section">
            <div class="cta-title">🎯 Get Started</div>
            <p class="cta-desc">Set up TOTP authentication to secure your server</p>
            <a href="/totp-setup" class="btn">Setup TOTP Authentication →</a>
        </div>

        <div class="links">
            <a href="/health" class="link">Health Check</a>
            <a href="https://lijunjie2232.github.io/acdown-server/" class="link">API Documentation</a>
            <a href="https://github.com" class="link" target="_blank">GitHub</a>
        </div>

        <div class="footer">
            <p>Powered by Cloudflare Workers • Secure & Fast</p>
        </div>
    </div>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
    },
  });
}
