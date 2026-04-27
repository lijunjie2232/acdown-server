/**
 * Validate URL format and protocol
 * @param {string} url - URL to validate
 * @returns {boolean} True if valid
 */
export function isValidUrl(url) {
  try {
    const parsed = new URL(url);
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch (error) {
    return false;
  }
}

/**
 * Analyze remote file for size and range support
 * @param {string} url - File URL to analyze
 * @param {number} maxFileSize - Maximum allowed file size (-1 for unlimited)
 * @returns {Object} Analysis result
 */
export async function analyzeFile(url, maxFileSize) {
  // Validate URL
  if (!isValidUrl(url)) {
    throw new Error('INVALID_URL');
  }
  
  try {
    // Send HEAD request to get file metadata
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
    
    const response = await fetch(url, {
      method: 'HEAD',
      signal: controller.signal,
      redirect: 'follow',
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok && response.status >= 500) {
      throw new Error('ANALYSIS_FAILED');
    }
    
    // Get file size from Content-Length header
    const contentLength = response.headers.get('content-length');
    const fileSize = parseInt(contentLength, 10);
    
    if (isNaN(fileSize) || fileSize < 0) {
      throw new Error('UNKNOWN_FILE_SIZE');
    }
    
    // Check if server supports range requests
    const acceptRanges = response.headers.get('accept-ranges');
    const contentRange = response.headers.get('content-range');
    const supportsRange = acceptRanges === 'bytes' || 
                          response.status === 206 ||
                          contentRange !== null;
    
    // Check file size against maximum allowed
    const isAllowed = maxFileSize === -1 || fileSize <= maxFileSize;
    
    return {
      url,
      size: fileSize,
      supportsRange,
      allowed: isAllowed,
    };
  } catch (error) {
    if (error.message === 'INVALID_URL' || error.message === 'UNKNOWN_FILE_SIZE') {
      throw error;
    }
    
    if (error.name === 'AbortError') {
      throw new Error('REQUEST_TIMEOUT');
    }
    
    throw new Error('ANALYSIS_FAILED');
  }
}
