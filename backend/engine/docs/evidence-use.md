# Evidence use — the reviewer's designation beside a verification result

A verification result's evidence makes claims about the corpus: a quote,
that its text is in the document it names, at the hash it pins; an absence
item, that its term occurs in none of the documents it names; an edge, that
the corpus index records the relation it cites. Writing the result
establishes none of these; only re-checking them against the corpus does —
the sign gate's re-check, and `checkResultEvidence` as a measurement before
any signature. A signature needs more of a positive legal proposition: an
occurrence of a supporting quote located wholly inside an authored
operative-provision range, the occurrence identified rather than inferred,
and the whole designation bound to the exact result. This file is how the
reviewer states that, and the sign gate refuses without it.

## Where it lives

Beside the result it is for:

```
verification/<packId>/<requirementId>/verification-result.json
verification/<packId>/<requirementId>/evidence-use.json      ← this file
```

`npm run verify -- sheet <packId>` renders the designation **before any
signature exists**: for each set, the occurrence that would be recorded with
the surrounding text, every contextual quote with its reason, and every
unresolved choice with its candidates. Nothing is written by the sheet.
`npm run verify -- sign …` reads the same file, resolves it again, and either
refuses by name or seals the resolved record into the signing entry.

## Format

```json
{
  "resultSha256": "<sha256 of the result, as `resultSha256()` computes it>",
  "sets": [
    { "set": "<record path>", "use": "context", "reason": "<why this whole set is contextual>" },
    { "set": "<record path>", "use": "support",
      "items": [
        { "item": "<quote path>", "use": "support" },
        { "item": "<quote path>", "use": "support",
          "selection": { "docId": "DOC-…", "rangeId": "<range id>", "offset": 116298 } },
        { "item": "<quote path>", "use": "context", "reason": "<why this quote is contextual>" }
      ] }
  ]
}
```

- `resultSha256` binds the file to one result. A result that has changed, even
  in one statement, has a different hash, and the designation is refused.
- `set` is the record path the review sheet and every refusal print:
  `reading.elements[0] (R1).evidence`, `challenges[0] (C1).evidence`,
  `challenges[0] (C1).adjudicationEvidence`. Every set the result carries
  must appear exactly once. A set named twice is a contradiction and is
  refused, whatever the two declarations say.
- A **contextual set** carries a `reason` and no `items`; it covers all its
  contents. A reading element is a positive legal proposition and may not be
  a contextual set. Whether an adjudication is an affirmative legal claim or a
  genuinely contextual finding is the reviewer's judgement.
- A **support set** carries `items` naming every quote in the set — nested
  ones included, as `evidence[2].hops[1].quote`, `evidence[3].from`,
  `evidence[3].to` — each either `support` or `context` with its own
  `reason`. A quote left unnamed is refused; nothing is context by default.
  At least one item must support.
- A supporting item needs one occurrence of its quote lying wholly inside a
  currently declared operative range of its document. When exactly one is
  eligible it is taken. When more than one is, the refusal lists them with
  their stored-text offsets, and `selection` names one by `docId`, `rangeId`
  and `offset`. A selection must identify exactly one located occurrence;
  a line number is not enough, because a line can hold two copies of a
  phrase.

## What is recorded

The signing entry carries `evidenceUse[]`: for each set its use, its reason
if contextual, the occurrences relied upon (item, document, hash, range with
its anchors, offset, length, line) and the contextual items with their
reasons. The gate re-verifies that record against the result and the corpus
rather than trusting the resolution. Afterwards, withdrawing or changing a
range relied upon, or a result whose sets the entry no longer covers, reads
`stale_ranges` on every status surface.

## What it establishes

Completeness, provenance and containment: every set designated, every reading
element supported, each selected occurrence a genuine occurrence of the cited
quote in the pinned document, wholly inside the named range as declared now.
Whether the located words support the proposition is the reviewer's judgement.
No positional check proves it.

## Example — CSRD-S-002 over the first-case documents

The consolidation `DOC-32013L0034` declares `art-1`, `art-2`, `art-3` and
`art-29a`; the Omnibus `DOC-32026L0470` declares `art-2-pt-5`. A reading whose
first element quotes the threshold sentence, which occurs in Article 1 and in
Article 29a, and whose second element quotes the title line of the Omnibus
beside an operative sentence from its amending point:

```json
{
  "resultSha256": "…",
  "sets": [
    { "set": "reading.elements[0] (R1).evidence", "use": "support",
      "items": [
        { "item": "evidence[0]", "use": "support",
          "selection": { "docId": "DOC-32013L0034", "rangeId": "art-29a", "offset": 116298 } }
      ] },
    { "set": "reading.elements[1] (R2).evidence", "use": "support",
      "items": [
        { "item": "evidence[0]", "use": "context",
          "reason": "The title line identifies the amending act; it is not operative text." },
        { "item": "evidence[1]", "use": "support" }
      ] },
    { "set": "challenges[0] (P0-C1).evidence", "use": "context",
      "reason": "The prosecutor quotes the consolidation header to show the miscitation the challenge is about." },
    { "set": "challenges[0] (P0-C1).adjudicationEvidence", "use": "support",
      "items": [ { "item": "evidence[0]", "use": "support" } ] }
  ]
}
```

The offset `116298` is the occurrence at line 2309 inside Article 29a; the
same sentence at offset `4170` lies inside Article 1, and the one at `59920`
lies in Article 19a, which declares no range and is not selectable.
