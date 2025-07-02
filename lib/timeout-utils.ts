/**
 * Utility functions for handling timeouts and network requests
 */

export interface TimeoutConfig {
  default: number;
  firebase: number;
  device: number;
  scanner: number;
}

export const TIMEOUT_CONFIG: TimeoutConfig = {
  default: 10000,  // 10 seconds for general requests
  firebase: 15000, // 15 seconds for Firebase operations
  device: 8000,    // 8 seconds for device status checks
  scanner: 5000,   // 5 seconds for scanner connections
};

/**
 * Create a fetch request with automatic timeout
 */
export async function fetchWithTimeout(
  url: string, 
  options: RequestInit = {}, 
  timeoutMs: number = TIMEOUT_CONFIG.default
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Request timeout after ${timeoutMs}ms`);
    }
    
    throw error;
  }
}

/**
 * Wrapper for Promise with timeout
 */
export function withTimeout<T>(
  promise: Promise<T>, 
  timeoutMs: number,
  errorMessage?: string
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(errorMessage || `Operation timeout after ${timeoutMs}ms`));
      }, timeoutMs);
    })
  ]);
}

/**
 * Retry a function with exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  initialDelay: number = 1000
): Promise<T> {
  let lastError: Error;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Unknown error');
      
      if (attempt === maxRetries) {
        break;
      }
      
      const delay = initialDelay * Math.pow(2, attempt);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError!;
}
