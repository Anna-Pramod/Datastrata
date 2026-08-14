# Verification log — CSRD-S-001 (Individual Article 19a threshold scope)

## 2026-08-14 — encoding confirmed correct

**Verified by:** Anna (internal review — checked against source text, not a legal opinion)
**Verified against:** Directive 2013/34/EU, consolidated version of 18 March 2026 (identified by EUR-Lex as the current consolidated version); Directive (EU) 2026/470 (Omnibus I), Art. 1(4)(a)
**Outcome:** No change. Encoding stands.

### Challenge raised

The Accounting Directive's Art. 3(4) size test for a "large undertaking" is a
**two-of-three** test (balance sheet total, net turnover, average employees).
`CSRD-S-001` encodes Art. 19a as **cumulative** turnover *and* employees, and
`fact-types.json` contains no balance-sheet-total fact at all. Either Omnibus I
replaced the test, or the encoding dropped a criterion and its fact.

### Finding

Omnibus I replaced the test. Art. 19a(1) as amended states its own threshold
test directly and no longer routes through Art. 3(4):

> "Undertakings which, on their balance sheet dates, exceed a net turnover of
> EUR 450 000 000 and an average number of 1 000 employees during the financial
> year …"

Before Omnibus I, Art. 19a(1) opened with "Large undertakings, and small and
medium-sized undertakings … which are public-interest entities", and therefore
depended on the Art. 3 size categories. Directive (EU) 2026/470 substitutes that
formulation. This is enacted amendment language, not proposal language.

Art. 3(4) still exists and still uses two-of-three, but nothing in the amended
Art. 19a(1) refers to it.

Encoded condition is therefore correct as it stands:

```
net_turnover_eur > 450_000_000  AND  avg_employees > 1_000
```

### Consequences recorded

1. **"Large undertaking" ≠ Art. 19a scope.** An undertaking can satisfy Art. 3(4)
   and still fall outside Art. 19a, because being large is no longer sufficient.
   The reverse also holds. This is a live source of customer and adviser
   confusion and belongs in the requirement's `caution` field.
2. **Do not encode `large_undertaking AND employees > 1000`** for Art. 19a — that
   silently re-imports Art. 3(4)'s two-of-three machinery.
3. **No balance-sheet-total fact is needed** for Art. 19a. If one is added later
   for another program, it must not be wired into this requirement.
4. **`at_least_n_of` primitive not required** by this rule. The contingency
   described in the design spec (§10) is closed. Art. 3(4) itself would need it
   if ever encoded directly.

### Open questions carried forward

1. **Measurement period — "on their balance sheet dates" (plural).** The
   operative wording is plural, and the Accounting Directive's size machinery
   (Art. 3(10)) generally requires criteria to be exceeded on **two consecutive**
   balance sheet dates before a category is entered or left. The encoded
   condition tests a single financial year with no consecutive-years logic, and
   the pack holds no prior-year turnover or headcount facts. Whether the amended
   Art. 19a(1) imports a consecutive-years rule is **unresolved**. If it does,
   this requirement needs two additional facts and a revised condition.
2. **`CSRD-S-002` is not settled by this check.** Art. 29a is a separate
   provision. Its encoding is structurally parallel and probably correct by the
   same reasoning, but the amendment language for Art. 29a(1) has not been read.
   Verify separately before signing.

### Status

Remains `draft` pending the `verified` status machinery (design spec §4). The
substantive check is complete; only the recording mechanism is outstanding.
Open question 1 must be resolved before this can be signed.
