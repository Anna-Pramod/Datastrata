# CHECKPOINT — DataStrata: five website directions
Resume file. Full brief is in chat message m0001. Update the STATUS list after every completed option.

## TURN 8 (m0029) — DONE
7a wired into 5a: hero stats strip → shelf layout (numbers row + full-width {{ v7.hero }}), tablet {{ v7.tab }} (706×180, titles+dates, animated), mobile {{ v7.mob }} (342×150, steps+counts only), login foot {{ v7.foot }} (1440×110 quiet). New JS: t7v(o) parameterized variant generator; v7 gained hero/tab/mob/foot. v5.trace/traceT/traceM/loginTrace now unused (left in place). Turn-7 closer updated to "wired". HANDOFF EMITTED: handoff/tokens.css (CSS custom properties: surfaces/hairlines/text/brand/semantic, rings, shadows, type scale, 8px spacing, radius 0, motion durations) + handoff/design-system.md (tailwind.config extend mapping, 7 system rules, component inventory w/ states: MarketingNav, Button, Input, Card, Popover, Chip×4, StatShelf, LiveTrace, CrossSectionChart, SidebarNavItem, Topbar, EvidenceBar, BriefingItem, LoginCard, Footer; Next.js file structure).

## Deliverable
One canvas DC: `DataStrata Directions.dc.html`. One <section>, five option columns side-by-side (ids 1a–1e, visible badges), gap 300px (motion notes overhang at left:1452, width ~230).
Per option column (width 1440, position:relative):
1. Badge header (id chip + "OPTION N — NAME" + one-line essence)
2. STYLE TILE strip (palette chips w/ hex, type specimen H1/body/data label, strata motif = {{ oN.motif }}, button default+hover, tokens line)
3. LANDING (full scroll, auto height) — caption above frame: "OPTION N — NAME — LANDING · 1440"
4. LOGIN 1440×900
5. DASHBOARD HOME 1440×900
6. Buying-logic line at bottom of column; ALSO a "when to choose which" strip after the row (placeholder <!--CHOICE-->).
Frames carry data-screen-label="Option N — Name — Screen".

## Build mechanics
- Template placeholders inside the row div: <!--OPT1--> ... <!--OPT5-->, then <!--CHOICE--> after row. Fill each via dc_html_str_replace (c_find = the placeholder comment).
- Logic class already written in full (all generators, all skins) in the first dc_write. Hole names below.
- Motion notes per landing wrapped in <sc-if value="{{ showNotes }}" hint-placeholder-val="{{ true }}"> (prop showMotionNotes).
- Helmet has: canvas meta, all fonts, keyframes dsDrift/dsSettle/dsBeam/dsDraw/dsPulse, reduced-motion kill, a/a:hover.

## Logic-class holes (renderVals)
- showNotes
- mk.o1..o5 (wordmark svg), ic.oN.* muted 18px icons, ica.oN.* accent icons, icp.oN.* 22px proof icons. Icon names: home uni obl chg cal evd rep pro srch cite app core chev
- o1: hero(1440×880 bg, scrim+ruler+core+labels), login(792×900 ambient), chart(820×406), t1 t2 t3 (value-trio steps, 420×300), motif
- o2: plate(640×600 hero engraving "FIG. 01 — YOUR COMPANY, IN SECTION"), band(1440×140 login foot), chart, t1–t3, motif
- o3: hero(1440×660 torn bands+core), login(792×900), chart, t1–t3, motif
- o4: trace(1248×200 hero seismic w/ labeled spikes CBAM JAN 2026 + OMNIBUS FEB 2026), login(1440×110 quiet trace), contours(560×340), chart, t1–t3, motif
- o5: hero(1440×1210 field: planes+beam+labels+noise), login(1440×900 field), chart(820), panel(700×400 mini chart for hero glass panel), t1–t3, motif

## Domain data (already in JS, mirrors dashboard copy)
Regimes rows: CSRD, CBAM, EUDR, BRSR Core, EcoVadis, CDP. Cores cols: Meridian GmbH · DE, Rotterdam DC · NL, IN→EU lane · coils, TR→DE lane · fasteners, UK→EU lane, Pune Works · IN, US→EU lane, Group HoldCo.
Matrix (A/N/J): CSRD AANNJNNA · CBAM NAAANNAN · EUDR NAJNNNNN · BRSR NNNNNANN · EcoVadis ANNNNANA · CDP AJNNNNNA → totals A14 N31 J3 ✓ posture cards.
Deadline flags (6): (0,0)(1,1)(1,2)(1,3)(4,0)(5,7) — drawn as neutral-ink corner triangles (warm color appears ONLY on the right-rail deadline chip).
Hero layer states: A A J N A N.

## Shared copy spine (identical all options — verbatim)
NAV: Product · How it works · Coverage · Pricing · btn "Check what applies →"
H1 "Know what applies. What changed. And what to do — by when."
Sub "Sustainability regulation accumulates like sediment — CSRD, CBAM, EUDR, BRSR, buyer codes — layer upon shifting layer. DataStrata reads every layer for your company and returns one clear, cited, continuously maintained answer."
CTA1 "Check what applies to you — free" micro "8 questions · 2 minutes · personalised report" CTA2 "See a sample report"
Trust "Covers: CSRD · CBAM · EUDR · BRSR Core · EcoVadis · CDP"
Problem H "The rules that decide whether you can sell now change faster than you can track." Pains: "A German buyer emails demanding verified CBAM emissions data by Friday." / "The Omnibus rewrote CSRD scope after you spent a year preparing." / "A 200-question customer audit lands on the one person who also runs EHS."
Trio: S1 "What applies to you" / "One core sample. Every layer, answered." / "Enter your profile once. The engine drills through every regime and returns applies, does not apply, or requires judgment — with the why, cited to official sources. No silent “does not apply.”"
S2 "What changed" / "New rules land like fresh sediment. You see them settle." / "Monitored sources become a dated weekly briefing. Each change is traced to your specific obligations. When nothing needs you, it says so: “You are current.”"
S3 "What to do, by when" / "From strata to schedule." / "Obligations become owned, dated actions — exportable to your calendar and inbox."
Proof "Built to survive inspection." + 3 lines (derivation trace/official sources · versions not overwrites, appended like strata, never erased · deterministic core decides; AI drafts and explains, never decides, never publishes into the record). Icons: cite / app / core.
How it works: Profile once → Applicability determined and cited → A living calendar plus a weekly briefing.
Closing: repeat free checker large. Footer: nav columns + "DataStrata provides regulatory intelligence, not legal advice." + © 2026 DataStrata.
LOGIN: split 45/55 (O2 centered card + foot band; O5 card over full field). Wordmark, "Welcome back", EMAIL (shown FOCUSED w/ ring + "(focus)" note), PASSWORD dots, magic-link link "Email me a magic link instead", SSO Google + Microsoft, "Continue →", status "Since you left: 2 changes absorbed · 0 need your attention." Overlay on visual "The record accumulates. Nothing is overwritten."
DASHBOARD: left nav Home(active), Regulatory Universe(shown :hover + "(hover)" note), Obligations, Changes, Actions & Calendar, Evidence, Reports, Company Profile. Top bar "Meridian Steelworks — EU lanes" + chev, search, avatar AK. Status "You are current." + "Last sweep this morning · 2 changes absorbed this week". Cards: Applies 14 / Does not apply 31 / Requires judgment 3 / Deadlines · next 90 days 6. Chart card "Regulatory Universe — cross-section view" + certainty chips Deterministic/Expert-signed/Requires judgment. Rail: THIS WEEK'S BRIEFING — "12 Aug · CBAM: certificate sale window confirmed — affects 2 obligations" (deterministic) / "11 Aug · CSRD: ESRS S1 datapoint guidance updated — drafting note added" (expert-signed) / "9 Aug · EUDR: DDS API v1.4 published — no action required" (you are current). ONE warm deadline chip "CBAM Q3 report — due 31 Oct · 74 days". EVIDENCE HEALTH bars: Emissions data 92 / Supplier attestations 78 / Chain of custody 64. Red appears zero times.

## Option skins (palette/type shorthand)
O1 Core Sample: bg #0B0F14 surface #121821 hair #1F2937 text #E7EEF6 mut #93A1B0 ramp #0F766E→#22D3EE→#A5F3FC amber #F59E0B (CTA+deadline chip ONLY) green #34D399 only "You are current". Space Grotesk / Inter / IBM Plex Mono. radius 6·10.
O2 Survey Plate: bone #FAF6EE ink #14181D hair #D9D2C2 oxide #A93B2A (above fold: CTA only) ochre #C08A2D slate #3E5C76. Source Serif 4 / Inter / IBM Plex Mono smallcaps "FIG. 0N —" eyebrows. Hatched fills. radius 1·2.
O3 Sediment: sand #F4EDE3 cards #FBF7F0 umber #3B2F27 terracotta #C05B3C clay #A98467 moss #6C7A58 pool #22456B (links+data). Fraunces / Albert Sans, NO mono. radius 12·16. Deadline chip text #241B15 on terracotta.
O4 Seismograph: #FFFFFF panels #F2F5F8 ink #0A1520 grid #E3E8EE blue #0038FF orange #FF4D00 (spikes + deadline chip only). Archivo caps / Inter / JetBrains Mono (nav+numbers mono). radius 0·2. 150ms.
O5 Deep Field: grad #0B1026→#221B4E→#0E3A54, glass rgba(255,255,255,.06)+1px inner light, teal #2DD4BF iris #8B5CF6 ice #EAF4FF coral #FB7185 (deadline only). Sora / Inter. radius 12·18. Charts on solid #0D1430 panels.

## Buying-logic closers (final strip)
1a technical buyers; product must feel like serious instrumentation from the first pixel.
1b trust/auditability is the sale — reports shown to regulators and auditors.
1c buyer is an overwhelmed team of one; the promise is relief — software that lowers your pulse.
1d champion lives in ops/engineering; calm as a measurable output.
1e signal frontier tech to investors and early adopters without losing enterprise credibility.

## TURN 7 (m0021) — DONE
6b chosen → refined as 7a, new top section. t7() generator (1248×200): choreographed one-pass plotter sequence ~3.5s — tread draws, orange riser strikes, deposit square dsDropIn, register entry dsFadeIn (event title + capacity chip DETERMINISTIC/EXPERT-SIGNED + lowercase gloss), survey ticks on treads (sweeps w/ 0 deltas → flat = maintained), pulsing endpoint + "FLAT = MAINTAINED · 14 IN FORCE · YOU ARE CURRENT". Helmet: added dsFadeIn/dsDropIn keyframes; reduced-motion now also forces .dsdraw stroke-dashoffset:0 (finished drawing). Keys v7.{steps,ctx}. In-context frame: hero stats shelf w/ trace on its own full-width row. NOT yet wired into 5a (hero/tablet/mobile/login) — offered, awaiting user pick.

## TURN 6 (m0014) — DONE
Live-trace component alternatives (EKG read rejected). New top section, 4 options in oxide skin, same 1248×200 slot: 6a Event register (lollipop timeline), 6b Accumulation steps (cumulative obligations 12→14, animated dsDraw treads, orange risers) — RECOMMENDED, 6c Sweep log (barcode/rug, ~110 neutral ticks), 6d Monitor grid (3 source rows × 12 months heat cells). JS: generators t6a–t6d + helpers MON/mAxis/EVX before assembly; keys v6.{a,b,c,d}. Winner still to be wired into 5a hero/tablet/mobile/login (v5.trace/traceT/traceM/loginTrace).

## TURN 5 (m0002, Aug 19 2026) — DONE
5a Seismograph/Oxide at full fidelity, new top section. Full landing (1d structure verbatim spine, oxide skin, warm hairlines), tablet 834 + mobile 390 heroes (v5.traceT/traceM; mobile = stacked CTAs + hamburger), login default 1440×900 (grid paper #F0EAE4, v5.loginTrace) + state strip empty/loading/error (loader = v5.loader plotter line via dsDraw infinite; error uses oxide, no new hues), production dashboard: chart('v5c',C4R,820,406,{r:1,c:0}) draws hover ring+crosshair in-SVG; HTML popover (CBAM×Meridian citation trace, Reg (EU) 2023/956, FACT/TEST/RULE/DUTY + v3 footer) absolutely positioned left:252 top:104 in chart card; provenance strip under chart. New in JS: chart() optional 5th arg hi{r,c}; skin T4R; keys v5.{trace,traceT,traceM,loginTrace,chart,contours,t1,t2,t3,icp,loader}.

## TURN 4 (m0016) — DONE
4a Deep Field/Ledger: 1e evolved institutional. Flat ink-navy grads (#0A0F1E→#101A32→#0C2333), solid panels (no glass blur), warm ice #F2EFE6, teal kept (+solid CTA #17877A), violet desaturated #8B87C9 judgment-only, amber #D9A13B semantic. New causalMap generator (5-col DAG: fact→threshold→regulation→obligation→deadline, dsDraw staggered edges). Landing = full story scroll w/ functional UI demos (applicability card w/ citations, Omnibus diff card 250→1,000 struck/highlighted, actions list) + append-only RECORD table as trust moment. Dashboard: "since you last looked" rail, provenance strip under chart, skin C5R. o5Field gained glowOp/beamOp/beamLn/fillA params. Keys v4.{field,map,chart}, v4i.{mut,acc}, v4mk.

## TURN 3 (m0011) — DONE
3a Seismograph/Oxide: 1d with #0038FF→#A93B2A everywhere (nav, CTAs, trace, chart C4R, bars, tags); #FF4D00 kept for spikes + deadline chip; hairlines warmed (#F0EAE4/#D9CFC9, panels #F7F3EE). Keys v3.{trace,chart}, v3i.{mut,acc}, v3mk. Section above turn 2.

## TURN 2 (m0006) — DONE
New <section> ABOVE turn 1: color studies of 1d/1e, hero+dashboard only. 2a Deep Field/Ember (grad #150826→#451B4E→#8A3E1C, gold #FFC24B, iris, coral) · 2b Deep Field/Abyss (#020617→#0B2038→#08425C, cyan #4CE0FF, slate #A9CFE6, coral) · 2c Seismograph/Night (bg #0B0E13, blue #3D7BFF, orange #FF6A2B) · 2d Seismograph/Violet (paper #FBFAF7, violet #5B2EFF, amber #E8890C). Generators parameterized: o5Field(acc/grad/accHi/beamHi/jur/jurHi/labA/labJ/ice), o4Trace(blue/orange/ink/gridC/mut/dash), o4Contours(o). New skins C4N/C4V/C5E/C5M; renderVals keys v2.{a,b,c,d}, v2i (icon sets eMut/eAcc/mMut/mAcc/nMut/nW/vMut/vAcc), v2mk.{e,m,n,v}.

## STATUS
- [x] CHECKPOINT.md
- [x] dc_write scaffold + full logic class
- [x] Option 1 filled (<!--OPT1-->)
- [ ] Option 2 filled
- [ ] Option 3 filled
- [x] Option 2 filled
- [x] Option 3 filled
- [x] Option 4 filled
- [x] Option 5 filled
- [x] <!--CHOICE--> strip + ready_for_verification — ALL DONE; file complete. Any further work = user feedback iterations.
