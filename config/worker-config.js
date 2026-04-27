/**
 * Get configuration from environment variables
 * @param {Object} env - Cloudflare Worker environment
 * @returns {Object} Configuration object
 */
export function getConfig(env) {
  const chunkSize = parseInt(env.CHUNK_SIZE, 10) || 67108864; // 64MB default
  const maxFileSize = parseInt(env.MAX_FILE_SIZE, 10) || -1; // -1 for unlimited
  const totpSecret = env.TOTP_SECRET;
  const encryptionKey = env.ENCRYPTION_KEY;

  // Validate required configuration
  if (!totpSecret) {
    throw new Error('TOTP_SECRET environment variable is required');
  }

  if (!encryptionKey) {
    throw new Error('ENCRYPTION_KEY environment variable is required');
  }

  // Validate TOTP secret is valid Base32
  const base32Regex = /^[A-Z2-7]+=*$/;
  if (!base32Regex.test(totpSecret)) {
    throw new Error('TOTP_SECRET must be a valid Base32 string');
  }

  return {
    chunkSize,
    maxFileSize,
    totpSecret,
    encryptionKey,
  };
}
