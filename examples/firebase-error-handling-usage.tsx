// Test Firebase Error Handling System
// This file demonstrates how to use the new Firebase error handling system

import { useFirebaseErrorHandling } from '@/hooks/use-firebase-error-handling'
import { FirebasePermissionError } from '@/components/firebase-permission-error'

// Example usage in a component
export function ExampleComponent() {
  const firebaseErrorHandling = useFirebaseErrorHandling({
    enableConnectionMonitoring: true,
    maxRetries: 3,
    retryDelay: 1000
  })

  const handleFirebaseOperation = async () => {
    try {
      // Your Firebase operation here
      // await someFirebaseOperation()
      
    } catch (error) {
      // Handle the error using the new system
      const isRecoverable = await firebaseErrorHandling.handleError(error, 'your-operation')
      
      if (isRecoverable && firebaseErrorHandling.canRetry) {
        // Attempt automatic retry
        const success = await firebaseErrorHandling.retry(async () => {
          // Retry the operation
          // await someFirebaseOperation()
        })
        
        if (!success) {
          console.error('Failed to recover from error')
        }
      }
    }
  }

  // Display error UI if needed
  if (firebaseErrorHandling.hasError) {
    return (
      <FirebasePermissionError
        error={firebaseErrorHandling.error!}
        onRetry={async () => {
          firebaseErrorHandling.clearError()
          await handleFirebaseOperation()
        }}
        showConnectionStatus={true}
      />
    )
  }

  return (
    <div>
      {/* Your component content */}
      <button onClick={handleFirebaseOperation}>
        Perform Firebase Operation
      </button>
      
      {firebaseErrorHandling.isRetrying && (
        <div>Retrying... ({firebaseErrorHandling.retryCount}/3)</div>
      )}
      
      {!firebaseErrorHandling.isOnline && (
        <div>⚠️ Device is offline</div>
      )}
    </div>
  )
}

// Example with Higher-Order Component
import { withFirebaseErrorHandling } from '@/hooks/use-firebase-error-handling'

interface MyComponentProps {
  data: any[]
  firebaseErrorHandling?: ReturnType<typeof useFirebaseErrorHandling>
}

function MyComponent({ data, firebaseErrorHandling }: MyComponentProps) {
  // Component can access firebaseErrorHandling via props
  return (
    <div>
      {firebaseErrorHandling?.hasError ? (
        <div>Error: {firebaseErrorHandling.error}</div>
      ) : (
        <div>Data: {data.length} items</div>
      )}
    </div>
  )
}

// Wrap component with error handling
export const MyComponentWithErrorHandling = withFirebaseErrorHandling(MyComponent, {
  enableConnectionMonitoring: true,
  maxRetries: 2
})
