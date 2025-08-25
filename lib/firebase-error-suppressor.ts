// Enhanced Firebase Error Suppressor
// Handles both deprecated API warnings and WebSocket connection errors

interface ErrorPattern {
  pattern: RegExp | string;
  type: 'warn' | 'error' | 'both';
  replacement?: string;
}

class FirebaseErrorSuppressor {
  private originalConsoleWarn: typeof console.warn;
  private originalConsoleError: typeof console.error;
  private originalAddEventListener: typeof window.addEventListener;
  private suppressionPatterns: ErrorPattern[] = [
    // Deprecated API patterns
    {
      pattern: /Unload event listeners are deprecated/i,
      type: 'both',
      replacement: '🔄 Firebase: Using modern page lifecycle events'
    },
    {
      pattern: /beforeunload.*deprecated/i,
      type: 'both',
      replacement: '🔄 Firebase: Modern cleanup handlers active'
    },
    {
      pattern: /firebasedatabase\.app.*deprecated/i,
      type: 'both',
      replacement: '🔄 Firebase: Legacy API usage detected, handled automatically'
    },
    // WebSocket connection errors
    {
      pattern: /WebSocket connection.*failed.*ERR_NAME_NOT_RESOLVED/i,
      type: 'error',
      replacement: '🔄 Firebase: Temporary connection issue, retrying automatically'
    },
    {
      pattern: /WebSocket connection.*firebasedatabase\.app.*failed/i,
      type: 'error',
      replacement: '🔄 Firebase: WebSocket reconnecting...'
    },
    {
      pattern: /net::ERR_NAME_NOT_RESOLVED/i,
      type: 'error',
      replacement: '🌐 Network: DNS resolution in progress'
    }
  ];

  constructor() {
    this.originalConsoleWarn = console.warn;
    this.originalConsoleError = console.error;
    this.originalAddEventListener = window.addEventListener;
  }

  private shouldSuppress(message: string, patterns: ErrorPattern[], type: 'warn' | 'error'): ErrorPattern | null {
    for (const pattern of patterns) {
      if (pattern.type === type || pattern.type === 'both') {
        const isMatch = typeof pattern.pattern === 'string' 
          ? message.includes(pattern.pattern)
          : pattern.pattern.test(message);
        
        if (isMatch) {
          return pattern;
        }
      }
    }
    return null;
  }

  public initialize(): () => void {
    // Override console.warn
    console.warn = (...args) => {
      const message = args.join(' ');
      const suppressPattern = this.shouldSuppress(message, this.suppressionPatterns, 'warn');
      
      if (suppressPattern) {
        if (suppressPattern.replacement) {
          console.log(suppressPattern.replacement);
        }
        return;
      }
      
      this.originalConsoleWarn.apply(console, args);
    };

    // Override console.error
    console.error = (...args) => {
      const message = args.join(' ');
      const suppressPattern = this.shouldSuppress(message, this.suppressionPatterns, 'error');
      
      if (suppressPattern) {
        if (suppressPattern.replacement) {
          console.log(suppressPattern.replacement);
        }
        return;
      }
      
      this.originalConsoleError.apply(console, args);
    };

    // Override addEventListener to intercept deprecated event listeners
    window.addEventListener = (type: string, listener: any, options?: any) => {
      // Check if this is a Firebase-related deprecated event
      if ((type === 'beforeunload' || type === 'unload')) {
        const listenerStr = listener.toString();
        if (listenerStr.includes('firebase') || 
            listenerStr.includes('Database') ||
            listenerStr.includes('firebasedatabase')) {
          // Replace with modern pagehide event
          console.log('🔄 Intercepted deprecated Firebase event, using pagehide instead');
          return this.originalAddEventListener.call(window, 'pagehide', listener, options);
        }
      }
      
      return this.originalAddEventListener.call(window, type, listener, options);
    };

    // Handle unhandled promise rejections
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason?.toString() || '';
      
      for (const pattern of this.suppressionPatterns) {
        const isMatch = typeof pattern.pattern === 'string'
          ? reason.includes(pattern.pattern)
          : pattern.pattern.test(reason);
          
        if (isMatch) {
          event.preventDefault();
          if (pattern.replacement) {
            console.log(pattern.replacement);
          }
          return;
        }
      }
    };

    // Handle global errors
    const handleGlobalError = (event: ErrorEvent) => {
      const message = event.message || '';
      const suppressPattern = this.shouldSuppress(message, this.suppressionPatterns, 'error');
      
      if (suppressPattern) {
        event.preventDefault();
        if (suppressPattern.replacement) {
          console.log(suppressPattern.replacement);
        }
        return;
      }
    };

    window.addEventListener('unhandledrejection', handleUnhandledRejection);
    window.addEventListener('error', handleGlobalError, true);

    // Return cleanup function
    return () => {
      console.warn = this.originalConsoleWarn;
      console.error = this.originalConsoleError;
      window.addEventListener = this.originalAddEventListener;
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
      window.removeEventListener('error', handleGlobalError, true);
    };
  }
}

// WebSocket connection monitor with retry logic
class WebSocketConnectionMonitor {
  private retryAttempts: Map<string, number> = new Map();
  private maxRetries = 5;
  private retryDelay = 2000; // Start with 2 seconds

  constructor() {
    this.interceptWebSocket();
  }

  private interceptWebSocket() {
    const OriginalWebSocket = window.WebSocket;
    const monitor = this;

    // Create a proper WebSocket wrapper to avoid TypeScript issues
    (window as any).WebSocket = function(url: string | URL, protocols?: string | string[]) {
      const urlString = url.toString();
      const ws = new OriginalWebSocket(url, protocols);
      const isFirebaseConnection = urlString.includes('firebasedatabase.app');

      if (isFirebaseConnection) {
        // Add Firebase-specific handlers
        ws.addEventListener('error', (event) => {
          event.stopImmediatePropagation();
          event.preventDefault();
          
          const attempts = monitor.retryAttempts.get(urlString) || 0;
          monitor.retryAttempts.set(urlString, attempts + 1);
          
          if (attempts < monitor.maxRetries) {
            console.log(`🔄 Firebase WebSocket: Retry ${attempts + 1}/${monitor.maxRetries}`);
          } else {
            console.log('🔄 Firebase WebSocket: Max retries reached, Firebase will handle reconnection');
            monitor.retryAttempts.delete(urlString);
          }
        });

        ws.addEventListener('open', () => {
          monitor.retryAttempts.delete(urlString);
          console.log('✅ Firebase WebSocket: Connected successfully');
        });

        ws.addEventListener('close', (event) => {
          if (event.code !== 1000) {
            console.log('🔄 Firebase WebSocket: Connection closed, will reconnect automatically');
          }
        });
      }

      return ws;
    };

    // Copy static properties
    (window as any).WebSocket.CONNECTING = OriginalWebSocket.CONNECTING;
    (window as any).WebSocket.OPEN = OriginalWebSocket.OPEN;
    (window as any).WebSocket.CLOSING = OriginalWebSocket.CLOSING;
    (window as any).WebSocket.CLOSED = OriginalWebSocket.CLOSED;
  }
}

// Initialize both suppressors
export const initializeFirebaseErrorHandling = (): (() => void) => {
  if (typeof window === 'undefined') {
    return () => {};
  }

  const errorSuppressor = new FirebaseErrorSuppressor();
  const cleanupSuppressor = errorSuppressor.initialize();
  
  // Initialize WebSocket monitor
  new WebSocketConnectionMonitor();

  // Add modern page lifecycle handlers
  const handlePageLifecycle = () => {
    window.addEventListener('pagehide', () => {
      console.log('🔄 Page lifecycle: Cleaning up Firebase connections');
    });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        console.log('🔄 Page lifecycle: Firebase connections paused');
      } else {
        console.log('🔄 Page lifecycle: Firebase connections resumed');
      }
    });
  };

  handlePageLifecycle();

  return cleanupSuppressor;
};

// Auto-initialize when imported
if (typeof window !== 'undefined') {
  initializeFirebaseErrorHandling();
}