/**
 * Download a specific byte range from a remote URL and return as Response
 * @param {Object} params - Download parameters
 * @param {string} params.url - Remote file URL
 * @param {number} params.start - Start byte position
 * @param {number} params.end - End byte position
 * @returns {Response} Response with the file part
 */
export async function downloadPart(params) {
  const { url, start, end } = params;
  
  try {
    // Make request with Range header
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 second timeout
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Range': `bytes=${start}-${end}`,
      },
      signal: controller.signal,
      redirect: 'follow',
    });
    
    clearTimeout(timeoutId);
    
    if (response.status !== 206 && response.status !== 200) {
      throw new Error('DOWNLOAD_FAILED');
    }
    
    // Get the content length from the response
    const contentLength = end - start + 1;
    const totalLength = response.headers.get('content-length') || '*';
    
    // Create a new response with appropriate headers
    const newHeaders = new Headers();
    if (response.headers.get('content-type')) {
      newHeaders.set('Content-Type', response.headers.get('content-type'));
    }
    newHeaders.set('Content-Length', contentLength.toString());
    newHeaders.set('Content-Range', `bytes ${start}-${end}/${totalLength}`);
    newHeaders.set('Accept-Ranges', 'bytes');
    
    return new Response(response.body, {
      status: 206,
      statusText: 'Partial Content',
      headers: newHeaders,
    });
  } catch (error) {
    console.error('Download part error:', error);
    
    if (error.name === 'AbortError') {
      return new Response(
        JSON.stringify({
          success: false,
          error: {
            code: 'DOWNLOAD_TIMEOUT',
            message: 'Download timed out',
          },
        }),
        {
          status: 504,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }
    
    return new Response(
      JSON.stringify({
        success: false,
        error: {
          code: 'DOWNLOAD_FAILED',
          message: 'Failed to download file part from remote server',
        },
      }),
      {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}
