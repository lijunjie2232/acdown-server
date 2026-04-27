/**
 * Derive a 32-byte key from the encryption key using SHA-256
 * @param {string} keyString - The encryption key string
 * @returns {Promise<CryptoKey>} CryptoKey object
 */
async function deriveKey(keyString) {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(keyString);
  const hashBuffer = await crypto.subtle.digest('SHA-256', keyData);
  
  return crypto.subtle.importKey(
    'raw',
    hashBuffer,
    { name: 'AES-CBC' },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypt data object to base64 string
 * @param {Object} data - Data to encrypt
 * @param {string} encryptionKey - Encryption key from environment
 * @returns {Promise<string>} Encrypted string in format "iv:encryptedData"
 */
export async function encrypt(data, encryptionKey) {
  const key = await deriveKey(encryptionKey);
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(JSON.stringify(data));
  
  // Generate random IV
  const iv = crypto.getRandomValues(new Uint8Array(16));
  
  // Encrypt
  const encryptedBuffer = await crypto.subtle.encrypt(
    { name: 'AES-CBC', iv },
    key,
    dataBuffer
  );
  
  // Convert to base64
  const ivBase64 = btoa(String.fromCharCode(...iv));
  const encryptedBase64 = btoa(String.fromCharCode(...new Uint8Array(encryptedBuffer)));
  
  return `${ivBase64}:${encryptedBase64}`;
}

/**
 * Decrypt base64 string to data object
 * @param {string} encryptedString - Encrypted string in format "iv:encryptedData"
 * @param {string} encryptionKey - Encryption key from environment
 * @returns {Promise<Object>} Decrypted data object
 */
export async function decrypt(encryptedString, encryptionKey) {
  try {
    const parts = encryptedString.split(':');
    if (parts.length !== 2) {
      throw new Error('Invalid encrypted string format');
    }
    
    const key = await deriveKey(encryptionKey);
    
    // Convert from base64
    const iv = Uint8Array.from(atob(parts[0]), c => c.charCodeAt(0));
    const encrypted = Uint8Array.from(atob(parts[1]), c => c.charCodeAt(0));
    
    // Decrypt
    const decryptedBuffer = await crypto.subtle.decrypt(
      { name: 'AES-CBC', iv },
      key,
      encrypted
    );
    
    const decoder = new TextDecoder();
    const decryptedString = decoder.decode(decryptedBuffer);
    
    return JSON.parse(decryptedString);
  } catch (error) {
    throw new Error(`Decryption failed: ${error.message}`);
  }
}
