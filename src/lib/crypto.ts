import crypto from "crypto";

/**
 * FIELD-LEVEL SYMMETRIC ENCRYPTION SERVICE
 * 
 * This module uses AES-256-GCM (Advanced Encryption Standard in Galois/Counter Mode).
 * It is the gold standard for symmetric encryption, providing both:
 * 1. Confidentiality (hiding the sensitive API key from plain sight)
 * 2. Authenticity/Integrity (detecting if any database record has been tampered with)
 */

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 12 bytes / 96 bits is the official GCM standard length

// Retrieve secret key from environment variables (fallback for local dev if missing)
const SECRET = process.env.ENCRYPTION_KEY || "dev-fallback-key-should-be-32-chars-long!";

/**
 * Encrypts a plaintext string into a secured ciphertext.
 * The output is structured as: "ivHex:authTagHex:encryptedTextHex"
 * 
 * @param text The plaintext sensitive string to encrypt (e.g. Guild Wars 2 API Key)
 */
export function encrypt(text: string): string {
  if (!text) return "";
  
  try {
    // 1. GENERATE A RANDOM INITIALIZATION VECTOR (IV)
    // An IV is a random sequence of bytes. A new IV is generated for EVERY single encryption.
    // Why: If two users have the same API Key, using a different IV ensures their encrypted ciphertexts
    // look completely different in the database. This prevents pattern analysis attacks.
    const iv = crypto.randomBytes(IV_LENGTH);
    
    // 2. DERIVE A SECURE CRYPTOGRAPHIC KEY
    // scryptSync derives a highly secure, fixed 32-byte key from our SECRET string and a salt.
    // AES-256 requires exactly a 256-bit (32-byte) key length.
    const key = crypto.scryptSync(SECRET, "gw2-givewars2-salt", 32);
    
    // 3. CREATE CIPHER & EXECUTE ENCRYPTION
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    
    let encrypted = cipher.update(text, "utf8", "hex");
    encrypted += cipher.final("hex");
    
    // 4. GENERATE AUTHENTICATION TAG
    // In GCM mode, the cipher automatically generates an "Auth Tag".
    // This is a checksum/digital-signature that proves the ciphertext has not been altered or tampered with.
    const authTag = cipher.getAuthTag().toString("hex");
    
    // 5. PACK DATA FOR STORAGE
    // The IV and Auth Tag are NOT secrets, so they can be stored in the database alongside the ciphertext.
    // We separate them by colons so our decrypt function can parse them back out later.
    return `${iv.toString("hex")}:${authTag}:${encrypted}`;
  } catch (err) {
    console.error("Encryption error:", err);
    throw new Error("Failed to secure sensitive data.");
  }
}

/**
 * Decrypts a packaged ciphertext back into a plaintext string.
 * Supports a graceful fallback for unencrypted plaintext keys (legacy support).
 * 
 * @param encryptedText The packaged string "ivHex:authTagHex:encryptedTextHex" from the database
 */
export function decrypt(encryptedText: string): string {
  if (!encryptedText) return "";
  
  try {
    const parts = encryptedText.split(":");
    
    // GRACEFUL LEGACY FALLBACK
    // If the database entry doesn't have 3 colon-separated parts, it is a legacy raw key.
    // We return it as-is so our application doesn't break for existing users!
    if (parts.length !== 3) {
      return encryptedText;
    }
    
    const [ivHex, authTagHex, encryptedDataHex] = parts;
    
    // Parse hex strings back into raw binary buffers
    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");
    const encryptedTextBuffer = Buffer.from(encryptedDataHex, "hex");
    
    // Derive the identical 32-byte key using our SECRET and the same salt
    const key = crypto.scryptSync(SECRET, "gw2-givewars2-salt", 32);
    
    // 1. INITIALIZE DECIPHER
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    
    // 2. SET AUTH TAG FOR INTEGRITY CHECKING
    // Decipher will check this tag during decryption. If even a single bit of the database entry
    // was modified by an attacker, decipher.final() will throw an error immediately!
    decipher.setAuthTag(authTag);
    
    // 3. EXECUTE DECRYPTION
    let decrypted = decipher.update(encryptedTextBuffer, undefined, "utf8");
    decrypted += decipher.final("utf8");
    
    return decrypted;
  } catch (err) {
    // If decryption fails (e.g. key tampered with or incorrect key used), return empty string
    console.error("Decryption failed. Database entry may be tampered with or corrupted:", err);
    return "";
  }
}
