export function Footer({ legalSnapshot, packVersion }: { legalSnapshot: string; packVersion: string }) {
  return (
    <footer className="footer">
      <div className="wrap footer-inner">
        <p className="footer-brand">DataStrata</p>
        <p className="footer-note">
          Identifies duties, methods, proof &amp; decisions · not legal advice · calculation &amp; advisory
          partnered.
          <br />
          CSRD knowledge pack {packVersion}, legal snapshot {legalSnapshot}. All requirement content is draft
          and unratified; results are preliminary until expert ratification and national review.
        </p>
      </div>
    </footer>
  );
}
