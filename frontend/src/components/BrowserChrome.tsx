interface Props {
  url: string;
  reloading: boolean;
  canBack: boolean;
  showBack: boolean;
  onBack: () => void;
  onReload: () => void;
}

export function BrowserChrome({ url, reloading, canBack, showBack, onBack, onReload }: Props) {
  return (
    <div className="browser-chrome">
      {showBack && (
        <button
          className="chrome-nav"
          title="Back"
          aria-label="Back"
          disabled={!canBack}
          onClick={onBack}
        >
          <svg viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
      )}
      <button className="chrome-nav" title="Forward" aria-label="Forward" disabled>
        <svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      <button
        className={"chrome-nav" + (reloading ? " spinning" : "")}
        title="Reload"
        aria-label="Reload"
        onClick={onReload}
      >
        <svg viewBox="0 0 24 24"><path d="M4 12a8 8 0 0 1 14-5.3L21 4v6h-6l2.6-2.6A6 6 0 1 0 18 14h2a8 8 0 0 1-16-2z" fill="currentColor" /></svg>
      </button>
      <div className="chrome-url">
        <svg className="chrome-lock" viewBox="0 0 24 24"><path d="M12 2a4 4 0 0 0-4 4v3H6a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2h-2V6a4 4 0 0 0-4-4zm-2 7V6a2 2 0 1 1 4 0v3h-4z" fill="currentColor" /></svg>
        <span>{url}</span>
      </div>
    </div>
  );
}
