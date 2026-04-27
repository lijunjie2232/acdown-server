import { authMiddleware } from '../middleware/auth-worker';
import { encrypt, decrypt } from '../utils/encryption-worker';
import { analyzeFile } from '../services/fileAnalyzer-worker';
import { downloadPart } from '../services/partDownloader-worker';
import { getConfig } from '../config/worker-config';

/**
 * Handle proxy routes for Cloudflare Workers
 * @param {Request} request - Fetch request
 * @param {Object} env - Environment variables
 * @returns {Response} Response
 */
export async function handleProxyRoutes(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;

  // Check authentication
  const authError = authMiddleware(request, env);
  if (authError) {
    return authError;
  }

  // POST /api/proxy/analyze
  if (path === '/api/proxy/analyze' && request.method === 'POST') {
    return await handleAnalyze(request, env);
  }

  // GET /api/proxy/part/:encryptedParams
  if (path.startsWith('/api/proxy/part/')) {
    const encryptedParams = path.substring('/api/proxy/part/'.length);
    return await handlePartDownload(encryptedParams, env);
  }

  return new Response(
    JSON.stringify({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: 'Proxy endpoint not found',
      },
    }),
    {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    }
  );
}

/**
 * Handle analyze endpoint
 */
async function handleAnalyze(request, env) {
  try {
    const config = getConfig(env);
    const body = await request.json();
    const { url } = body;

    if (!url) {
      return new Response(
        JSON.stringify({
          success: false,
          error: {
            code: 'MISSING_URL',
            message: 'URL is required',
          },
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Analyze the file
    const analysis = await analyzeFile(url, config.maxFileSize);

    // Check if file is allowed
    if (!analysis.allowed) {
      return new Response(
        JSON.stringify({
          success: false,
          error: {
            code: 'FILE_TOO_LARGE',
            message: `File size (${analysis.size} bytes) exceeds maximum allowed size`,
          },
        }),
        {
          status: 413,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // For files larger than chunk size, range support is required
    if (analysis.size > config.chunkSize && !analysis.supportsRange) {
      return new Response(
        JSON.stringify({
          success: false,
          error: {
            code: 'RANGE_NOT_SUPPORTED',
            message: 'File does not support range requests and exceeds chunk size',
          },
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Calculate parts
    const parts = [];
    const totalParts = Math.ceil(analysis.size / config.chunkSize);

    for (let i = 0; i < totalParts; i++) {
      const start = i * config.chunkSize;
      const end = Math.min(start + config.chunkSize - 1, analysis.size - 1);

      // Create part parameters
      const partParams = {
        url: analysis.url,
        start,
        end,
        index: i,
        total: totalParts,
      };

      // Encrypt the parameters
      const encryptedParams = await encrypt(partParams, config.encryptionKey);
      parts.push(encryptedParams);
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          fileSize: analysis.size,
          totalParts: parts.length,
          chunkSize: config.chunkSize,
          parts: parts,
        },
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Analyze error:', error);

    switch (error.message) {
      case 'INVALID_URL':
        return new Response(
          JSON.stringify({
            success: false,
            error: {
              code: 'INVALID_URL',
              message: 'Invalid or unsupported URL',
            },
          }),
          {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      case 'UNKNOWN_FILE_SIZE':
        return new Response(
          JSON.stringify({
            success: false,
            error: {
              code: 'UNKNOWN_FILE_SIZE',
              message: 'Could not determine file size',
            },
          }),
          {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      case 'REQUEST_TIMEOUT':
        return new Response(
          JSON.stringify({
            success: false,
            error: {
              code: 'REQUEST_TIMEOUT',
              message: 'Request to remote server timed out',
            },
          }),
          {
            status: 504,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      default:
        return new Response(
          JSON.stringify({
            success: false,
            error: {
              code: 'ANALYSIS_FAILED',
              message: 'Failed to analyze file',
            },
          }),
          {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          }
        );
    }
  }
}

/**
 * Handle part download endpoint
 */
async function handlePartDownload(encryptedParams, env) {
  try {
    const config = getConfig(env);

    // Decrypt the parameters
    let params;
    try {
      params = await decrypt(encryptedParams, config.encryptionKey);
    } catch (error) {
      return new Response(
        JSON.stringify({
          success: false,
          error: {
            code: 'INVALID_PART',
            message: 'Invalid or corrupted part parameter',
          },
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Validate required fields
    if (!params.url || params.start === undefined || params.end === undefined) {
      return new Response(
        JSON.stringify({
          success: false,
          error: {
            code: 'INVALID_PART',
            message: 'Part parameters are missing required fields',
          },
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Download and return the part
    return await downloadPart(params);
  } catch (error) {
    console.error('Part download error:', error);

    return new Response(
      JSON.stringify({
        success: false,
        error: {
          code: 'PART_DOWNLOAD_FAILED',
          message: 'Failed to download file part',
        },
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}
