/** A minimal barbell in an accent tile; decorative only. */
export function LogoMark() {
  return (
    <div className="logo-mark" aria-hidden="true">
      <svg viewBox="0 0 32 32" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 16h26" />
        <path d="M10 8v16M22 8v16" />
        <path d="M5.5 11.5v9M26.5 11.5v9" />
      </svg>
    </div>
  );
}
