'use client';

/**
 * Last-resort boundary: catches failures in the root layout itself, so it must
 * render its own <html> and cannot rely on the app's CSS having loaded.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#FAFAF7',
          fontFamily: 'system-ui, sans-serif',
          color: '#0F1115',
        }}
      >
        <div
          style={{
            maxWidth: 400,
            padding: 32,
            border: '1px solid #E7E9EC',
            borderRadius: 8,
            background: '#FFFFFF',
            textAlign: 'center',
          }}
        >
          <h1 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>Roster could not start</h1>
          <p style={{ fontSize: 14, color: '#5B6472', marginTop: 8, lineHeight: 1.5 }}>
            A fatal error occurred while rendering. Check the server logs, and that DATABASE_URL,
            NEXTAUTH_SECRET and ENCRYPTION_KEY are all set.
          </p>
          {error.digest && (
            <p style={{ fontSize: 11, color: '#5B6472', marginTop: 12, fontFamily: 'monospace' }}>
              Reference: {error.digest}
            </p>
          )}
          <button
            onClick={reset}
            style={{
              marginTop: 24,
              padding: '10px 20px',
              border: 'none',
              borderRadius: 6,
              background: '#E8A33D',
              color: '#1C1403',
              fontSize: 14,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
