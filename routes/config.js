/**
 * Handle config routes for Cloudflare Workers
 * @param {Request} request - Fetch request
 * @param {Object} env - Environment variables
 * @returns {Response} Response
 */
export async function handleConfigRoutes(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;

  // GET /api/config
  if (path === '/api/config' && request.method === 'GET') {
    return await handleGetConfig(env);
  }

  return new Response(
    JSON.stringify({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: 'Config endpoint not found',
      },
    }),
    {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    }
  );
}

/**
 * Handle get config endpoint
 * Returns server configuration without sensitive information
 */
async function handleGetConfig(env) {
  try {
    // Parse environment variables with defaults
    const chunkSize = parseInt(env.CHUNK_SIZE) || 67108864; // Default: 64MB
    const maxFileSize = parseInt(env.MAX_FILE_SIZE) || -1; // Default: unlimited
    const tokenExpiry = parseInt(env.TOKEN_EXPIRY) || 604800; // Default: 7 days

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          chunkSize: chunkSize,
          maxFileSize: maxFileSize,
          tokenExpiry: tokenExpiry,
          // Helper fields for client convenience
          chunkSizeMB: Math.round(chunkSize / (1024 * 1024)),
          tokenExpiryDays: Math.round(tokenExpiry / 86400),
          maxFileSizeUnlimited: maxFileSize === -1,
        },
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Config error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: {
          code: 'CONFIG_ERROR',
          message: 'Failed to retrieve configuration',
        },
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}
