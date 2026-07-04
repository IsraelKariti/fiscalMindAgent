interface Props {
  userEmail: string | null;
  onLogout: () => void;
}

/**
 * Shown to signed-in users whose email is not on the paid-access whitelist.
 * The API rejects everything for them anyway (403); this is the friendly face
 * of that gate.
 */
export function AccessPending({ userEmail, onLogout }: Props) {
  return (
    <div className="screen-center">
      <div className="card login-card">
        <div className="brand login-brand">
          <img className="brand-mark" src="/logo.png" alt="הלוגו של FiscalMind" />
          <span>FiscalMind</span>
        </div>
        <div className="access-pending-icon" aria-hidden="true">
          🔒
        </div>
        <h2 className="access-pending-title">החשבון שלכם עדיין לא הופעל</h2>
        <p className="muted">
          FiscalMind זמין ללקוחות משלמים בלבד. פנו למנהל המערכת כדי להפעיל גישה עבור
          {userEmail ? <strong> {userEmail}</strong> : ' החשבון שלכם'}. לאחר ההפעלה, התחברו שוב והדשבורד שלכם
          יהיה מוכן.
        </p>
        <button className="btn btn-ghost" onClick={onLogout}>
          התחברות עם חשבון אחר
        </button>
      </div>
    </div>
  );
}
