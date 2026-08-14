/**
 * Everything in this section is read from the live CSRD pack — the pending acts
 * are its real `changeWatch` entries, with the requirement IDs they would move.
 * No invented "11 changes reviewed this week" counter.
 */

const STATUS_COPY: Record<string, string> = {
  adopted_not_effective: 'Adopted, not in force',
  in_progress: 'In progress',
  in_development: 'In development',
  proposed: 'Proposed',
  in_force: 'In force',
};

export interface WatchItem {
  id: string;
  title: string;
  status: string;
  affectsRequirements: string[];
  note?: string;
}

export function ChangeWatch({
  items,
  sourceCount,
  requirementCount,
}: {
  items: WatchItem[];
  sourceCount: number;
  requirementCount: number;
}) {
  return (
    <section className="section-tight" id="watch" aria-labelledby="watch-h">
      <div className="wrap">
        <div className="card">
          <div className="watch-head">
            <div>
              <span className="eyebrow">Currently tracked</span>
              <h2 id="watch-h" style={{ fontSize: 'clamp(22px, 3vw, 26px)', margin: '10px 0 0' }}>
                {items.length} pending acts that could move your answer
              </h2>
              <p style={{ font: '500 13px/1.6 var(--sans)', color: 'var(--brown)', marginTop: 8, maxWidth: 560 }}>
                Pending law never binds. Each item below is watched, tied to the exact requirements it would
                change, and only flips a determination once it is actually in force.
              </p>
            </div>
            <p className="watch-count">
              {requirementCount}
              <span>requirements encoded<br />across {sourceCount} official sources</span>
            </p>
          </div>

          <div className="watch-list">
            {items.map((w) => (
              <article className="watch-item" key={w.id}>
                <span className="watch-status">{STATUS_COPY[w.status] ?? w.status}</span>
                <div className="watch-body">
                  <h3 className="watch-title">{w.title}</h3>
                  {w.note ? <p className="watch-note">{w.note}</p> : null}
                  <p className="watch-affects">Would affect {w.affectsRequirements.join(', ')}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
