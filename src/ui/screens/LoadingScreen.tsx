/**
 * Loading screen shown while the application initializes.
 * Branded per AETHRION identity. No gameplay content.
 */
export function LoadingScreen() {
  return (
    <div className="loading-screen">
      <div className="loading-content">
        <div className="brand-mark">A</div>
        <div className="brand-name">AETHRION</div>
        <div className="brand-slogan">BUILD YOUR EMPIRE. SHAPE THE FUTURE.</div>
        <div className="spinner" aria-label="Loading" role="status" />
        <div className="loading-note">Initializing empire foundation…</div>
      </div>
    </div>
  );
}
