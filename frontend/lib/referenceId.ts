/**
 * Decode a reference_id to extract the timestamp when it was created.
 * 
 * The reference_id is encoded as:
 * 1. Timestamp in milliseconds since 2025-01-01 00:00:00 UTC, converted to base36
 * 2. Two random alphanumeric characters appended
 * 3. A hyphen inserted before the last 4 characters
 * 
 * @param referenceId - The reference ID string (e.g., "ABC123-XY")
 * @returns The timestamp in milliseconds since epoch, or null if invalid
 */
export function decodeReferenceId(referenceId: string): number | null {
  try {
    // Remove the hyphen
    const withoutHyphen = referenceId.replace('-', '');
    
    // Remove the last 2 characters (random alphanumeric)
    const base36String = withoutHyphen.slice(0, -2);
    
    // Convert base36 string back to number
    const timestampMs = parseInt(base36String, 36);
    
    if (isNaN(timestampMs)) {
      return null;
    }
    
    // The timestamp is relative to 2025-01-01 00:00:00 UTC
    // Epoch for 2025-01-01 00:00:00 UTC in milliseconds
    const epoch2025 = 1735689600000;
    
    // Convert to absolute timestamp
    return epoch2025 + timestampMs;
  } catch (error) {
    console.error('Error decoding reference_id:', error);
    return null;
  }
}

/**
 * Get the creation date from a reference_id.
 * 
 * @param referenceId - The reference ID string
 * @returns The Date object when the reference was created, or null if invalid
 */
export function getReferenceIdDate(referenceId: string): Date | null {
  const timestampMs = decodeReferenceId(referenceId);
  if (timestampMs === null) {
    return null;
  }
  return new Date(timestampMs);
}

/**
 * Format the creation date from a reference_id as a human-readable string.
 * 
 * @param referenceId - The reference ID string
 * @returns Formatted date string, or null if invalid
 */
export function formatReferenceIdDate(referenceId: string): string | null {
  const date = getReferenceIdDate(referenceId);
  if (date === null) {
    return null;
  }
  return date.toUTCString();
}

