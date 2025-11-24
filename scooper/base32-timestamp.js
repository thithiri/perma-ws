#!/usr/bin/env node

/**
 * Base36 encode/decode script for timestamps (milliseconds input, seconds encoding)
 * Uses a reference timestamp to encode deltas for shorter output
 * 
 * Usage:
 *   Encode: node base32-timestamp.js encode <timestamp> [options]
 *   Decode: node base32-timestamp.js decode <base36-string> [options]
 *   Example: node base32-timestamp.js encode 1763452207818
 *   Example: node base32-timestamp.js decode BYUJFP
 * 
 * Default reference: 2024-01-01 00:00:00 UTC (1704067200000)
 * Note: Encodes in seconds (loses millisecond precision, rounds to nearest second)
 */

// Base36 alphabet (0-9, A-Z)
const BASE36_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

// Default reference timestamp: 2024-01-01 00:00:00 UTC
// This is a fixed point in the past, so all future timestamps will be positive deltas
const DEFAULT_REFERENCE = 1704067200000; // 2024-01-01 00:00:00 UTC

/**
 * Encode a number (timestamp in milliseconds) to base36
 */
function encodeBase36(num) {
  if (num === 0) return BASE36_ALPHABET[0];
  
  let result = '';
  let value = BigInt(num);
  
  while (value > 0) {
    result = BASE36_ALPHABET[Number(value % 36n)] + result;
    value = value / 36n;
  }
  
  return result;
}

/**
 * Encode a timestamp relative to a reference timestamp (for shorter output)
 * Converts to seconds before encoding
 * @param {number} timestamp - Timestamp in milliseconds
 * @param {number} reference - Reference timestamp (default: DEFAULT_REFERENCE)
 */
function encodeTimestamp(timestamp, reference = DEFAULT_REFERENCE) {
  // Convert to seconds (divides by 1000, much smaller number)
  const value = Math.floor(timestamp / 1000);
  const refSeconds = Math.floor(reference / 1000);
  
  const delta = value - refSeconds;
  
  if (delta < 0) {
    throw new Error(`Timestamp ${timestamp} is before reference ${reference}. Use a later reference or absolute encoding.`);
  }
  
  return encodeBase36(delta);
}

/**
 * Decode a base36 string to a number (timestamp in milliseconds)
 */
function decodeBase36(str) {
  str = str.toUpperCase();
  
  let result = 0n;
  
  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    const index = BASE36_ALPHABET.indexOf(char);
    
    if (index === -1) {
      throw new Error(`Invalid base36 character: ${char}`);
    }
    
    result = result * 36n + BigInt(index);
  }
  
  return Number(result);
}

/**
 * Decode a base36 string back to a timestamp using a reference
 * Assumes encoding was done in seconds, converts back to milliseconds
 * @param {string} encoded - Encoded string
 * @param {number} reference - Reference timestamp (default: DEFAULT_REFERENCE)
 */
function decodeTimestamp(encoded, reference = DEFAULT_REFERENCE) {
  const delta = decodeBase36(encoded);
  
  // Work with seconds throughout
  const referenceSeconds = Math.floor(reference / 1000);
  const resultSeconds = referenceSeconds + delta;
  return resultSeconds * 1000; // Convert back to milliseconds
}

/**
 * Generate a random base36 character
 */
function randomBase36Char() {
  return BASE36_ALPHABET[Math.floor(Math.random() * 36)];
}

/**
 * Encode a timestamp with a random 4-character suffix to reduce collisions
 * @param {number} timestamp - Timestamp in milliseconds
 * @param {number} reference - Reference timestamp (default: DEFAULT_REFERENCE)
 * @returns {string} Encoded timestamp with 4 random characters appended
 */
function encodeId(timestamp, reference = DEFAULT_REFERENCE) {
  const encoded = encodeTimestamp(timestamp, reference);
  const randomSuffix = randomBase36Char() + randomBase36Char() + randomBase36Char() + randomBase36Char();
  return encoded + randomSuffix;
}

/**
 * Decode an ID back to a timestamp, removing the random 4-character suffix
 * @param {string} encodedId - Encoded ID with 4 random characters at the end
 * @param {number} reference - Reference timestamp (default: DEFAULT_REFERENCE)
 * @returns {number} Decoded timestamp in milliseconds
 */
function decodeId(encodedId, reference = DEFAULT_REFERENCE) {
  if (encodedId.length < 4) {
    throw new Error('Encoded ID must be at least 4 characters long');
  }
  
  // Remove last 4 characters (random suffix)
  const encoded = encodedId.slice(0, -4);
  return decodeTimestamp(encoded, reference);
}

/**
 * Main function
 */
function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.error('Usage:');
    console.error('  Encode: node base32-timestamp.js encode <timestamp> [options]');
    console.error('  Decode: node base32-timestamp.js decode <encoded-string> [options]');
    console.error('');
    console.error('Options:');
    console.error('  --reference <timestamp>  Custom reference timestamp');
    console.error('');
    console.error('Examples:');
    console.error('  node base32-timestamp.js encode 1763452207818');
    console.error('  node base32-timestamp.js decode BYUJFP');
    console.error('');
    console.error(`Default reference: ${DEFAULT_REFERENCE} (${new Date(DEFAULT_REFERENCE).toISOString()})`);
    process.exit(1);
  }
  
  const command = args[0].toLowerCase();
  const input = args[1];
  
  // Parse options
  let reference = DEFAULT_REFERENCE;
  
  for (let i = 2; i < args.length; i++) {
    if (args[i] === '--reference' && args[i + 1]) {
      reference = parseInt(args[i + 1], 10);
      i++;
    }
  }
  
  try {
    if (command === 'encode') {
      const timestamp = parseInt(input, 10);
      
      if (isNaN(timestamp)) {
        throw new Error('Invalid timestamp. Must be a number.');
      }
      
      // Encode with selected options
      const relativeEncoded = encodeTimestamp(timestamp, reference);
      const absoluteEncoded = encodeBase36(Math.floor(timestamp / 1000));
      
      const deltaSeconds = Math.floor((timestamp - reference) / 1000);
      
      console.log(`Timestamp: ${timestamp}`);
      console.log(`Date:      ${new Date(timestamp).toISOString()}`);
      console.log(`Reference: ${reference} (${new Date(reference).toISOString()})`);
      console.log(`Delta:     ${deltaSeconds} seconds`);
      console.log('');
      console.log(`Selected:  ${relativeEncoded} (base36, relative, seconds, ${relativeEncoded.length} chars)`);
      console.log(`Absolute:  ${absoluteEncoded} (base36, absolute seconds, ${absoluteEncoded.length} chars)`);
      console.log(`Saved:     ${absoluteEncoded.length - relativeEncoded.length} characters`);
      
    } else if (command === 'decode') {
      // Decode with selected options
      const decoded = decodeTimestamp(input, reference);
      
      console.log(`Encoded:   ${input}`);
      console.log(`Encoding:  base36 (seconds)`);
      console.log(`Reference: ${reference} (${new Date(reference).toISOString()})`);
      console.log(`Decoded:   ${decoded}`);
      console.log(`Date:      ${new Date(decoded).toISOString()}`);
      
    } else {
      throw new Error(`Unknown command: ${command}. Use 'encode' or 'decode'.`);
    }
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}` || require.main === module) {
  main();
}

export { encodeBase36, decodeBase36, encodeTimestamp, decodeTimestamp, encodeId, decodeId };

