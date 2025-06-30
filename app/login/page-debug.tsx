"use client"

export default function LoginPageDebug() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="bg-white p-8 rounded-lg shadow-md">
        <h1 className="text-2xl font-bold mb-4">Debug Login Page</h1>
        <p>This is a test page to debug rendering issues.</p>
        <form>
          <input 
            type="text" 
            placeholder="Username" 
            className="block w-full p-2 border rounded mb-2"
          />
          <input 
            type="password" 
            placeholder="Password" 
            className="block w-full p-2 border rounded mb-4"
          />
          <button 
            type="submit"
            className="w-full bg-blue-500 text-white p-2 rounded hover:bg-blue-600"
          >
            Login
          </button>
        </form>
      </div>
    </div>
  )
}
