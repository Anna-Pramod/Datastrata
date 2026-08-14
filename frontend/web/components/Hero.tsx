export function Hero({ sourcesWatched }: { sourcesWatched: number }) {
  return (
    <header className="hero section" id="top">
      <div className="hero-blob-a" aria-hidden="true" />
      <div className="hero-blob-b" aria-hidden="true" />
      <div className="wrap hero-body">
        <span className="hero-tag">EU sustainability market access</span>
        <h1>
          Know what applies, what changed, and what to do <em>by when.</em>
        </h1>
        <p className="lede" style={{ maxWidth: 530 }}>
          DataStrata watches the rules for your business, turns obligations into owned work, and keeps a
          replayable evidence trail. Start with a free check — no account needed.
        </p>
        <div className="hero-cta">
          <a className="btn btn-dark" href="#checker">Run my free check</a>
          <span className="hero-stat">
            {sourcesWatched} official sources watched
            <br />
            every determination cited
          </span>
        </div>
      </div>
    </header>
  );
}
