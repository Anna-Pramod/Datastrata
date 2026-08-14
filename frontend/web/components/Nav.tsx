export function Nav() {
  return (
    <nav className="nav" aria-label="Primary">
      <div className="wrap nav-inner">
        <a className="brand" href="#top" style={{ textDecoration: 'none', color: 'inherit' }}>
          <span className="brand-mark" aria-hidden="true"><span /></span>
          DataStrata
        </a>
        <div className="nav-links">
          <a href="#checker">Free check</a>
          <a href="#what">What it does</a>
          <a href="#watch">What we watch</a>
          <a href="#pricing">Pricing</a>
        </div>
        {/* Placeholder destinations: there is no product to sign into yet. */}
        <a className="btn btn-sm btn-ghost" href="#checker">Sign in</a>
        <a className="btn btn-sm btn-primary" href="#checker">Try the free check →</a>
      </div>
    </nav>
  );
}
