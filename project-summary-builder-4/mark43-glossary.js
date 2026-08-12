// mark43-glossary.js
//
// Reference sheet distilled from (a) comparing multiple Mark43 SOWs/Order Forms
// (Jersey Village PD [TX], Lakewood PD [OH], AZ Dept of Liquor Licenses & Control
// [AZ, reseller/FedRAMP] so far) and (b) canonical internal sources pulled directly
// from Confluence (Mark43 Product SKU Catalogue Summary, per-state Standard
// Implementation Guides, Data Migration SKU Strategy). Purpose: teach the drafting
// model which patterns are fixed Mark43 boilerplate (safe to normalize/paraphrase)
// vs. which vary per-agency/state and must be extracted verbatim, never assumed —
// and to ground SKU/interface-naming claims in the actual source of truth rather
// than reverse-engineering them purely from a handful of customer documents.
//
// Import into server.js and prepend to the prompt in both /api/draft and
// /api/publish-page — do NOT let this drift out of sync between the two routes.
//
// Update this file every time a new agency's SOW/Order Form/Dealbook is reviewed,
// OR when the Confluence sources below are revisited (they carry dates — re-check
// periodically, since SKUs and state bundles evolve; e.g. the SKU catalogue is
// dated "as of December 2025" and explicitly lists Q1 2026 additions).

const MARK43_DOMAIN_GLOSSARY = `
MARK43 SOW/ORDER FORM DOMAIN REFERENCE
(Derived from comparing Jersey Village PD [TX, Tyler legacy] and Lakewood PD [OH,
"One Solution" legacy] SOWs/Order Forms. Confidence grows as more agencies are added —
treat "universal" items below as high-confidence, not certain, until more docs confirm.)

=== 1. STRUCTURE THAT IS UNIVERSAL ACROSS SOWs (safe to assume/normalize) ===
- Every SOW is built on the same section skeleton: Introduction & Overview → Scope of
  Services & Deliverables → Project Phases & Timeline → Assumptions & Constraints →
  Project Management & Governance → Change Order Process → Roles & Responsibilities →
  Signature Sheet → Appendix (data migration system scope).
- Project phases are always, in this order: Preparation and Planning → Discovery and
  Application Setup → Application Validation → Training and Change Management → Launch
  → Project Closeout. Treat any deviation from this list as worth flagging, not silently
  reconciling.
- "Foundation (Training and Testing)" tenant, "Data Migration" tenant (up to 3 migration
  round environments), and "Production" tenant are the fixed three-tenant model. Always
  extract the migration round cap verbatim if it differs from "three."
- Hypercare / post-launch support window: consistently 30 days across every SOW seen.
- Standard implementation timeline language: SOW term "twelve (12) months from the
  Effective Date"; standard implementation itself capped at "no more than six (6) months
  from the SOW Effective Date" (JVPD SOW states this explicitly; confirm per-doc, don't
  assume every SOW repeats the six-month sentence — Lakewood's did not include it).
- Signature block always separates "Customer" from Mark43 signers. Mark43-side signer
  roles seen: Chief Financial Officer (always present), and on newer SOWs also
  "Mark43 Professional Services" and "Mark43 Revenue Operations" as separate blank
  signature lines (seen on Lakewood, not on Jersey Village — newer template revision).
  Always extract exact names/titles/dates verbatim; never assume a role was filled if
  the source shows "Signature intentionally left blank."
- Standard closing responsibilities language: "Mark43 reserves the right, in its
  discretion, to pause any portion of the project if impacted by a lack of feedback or
  responsiveness and will not be liable for any resulting delays" — boilerplate, appears
  verbatim across agencies.

=== 2. TERMINOLOGY THAT VARIES BY SOW REVISION — DO NOT TREAT AS SYNONYMS SILENTLY ===
Watch for template-revision drift; these describe the SAME phase/activity but with
different labels depending on which SOW template version was used. Extract whichever
term the source document actually uses — don't silently normalize to one or the other
in a way that could misrepresent which template revision was in play:
- "Introduction call" / "Project Introduction" (Jersey Village) vs. "Kickoff call" /
  "Project Kickoff" (Lakewood) — same Preparation & Planning phase kickoff activity.
- "Code cutoff" is used in both, but confirm placement — it sits inside Application
  Validation (3.1.3) in both docs seen so far.

=== 3. DATA MIGRATION — NAMING VARIES BY AGENCY, STRUCTURE IS THE PATTERN ===
- Migration TYPES vary by what the agency actually purchased. Seen so far:
    Jersey Village (TX): Advanced Reports, Evidence, Investigations (Cases) — 3 appendix
      sections, legacy system "Tyler" for all three.
    Lakewood (OH): Report [Migration], Case [Migration], Evidence [Migration], CAD
      [Migration] — 4 appendix sections, legacy system listed generically as
      "One Solution" for all four (do not expand "One Solution" into a specific vendor
      name unless the source document itself does — it may be a placeholder/generic
      label in some templates rather than an actual named product).
    TAKEAWAY: migration type names and count are NOT fixed — always enumerate exactly
    what appendix sections are present in THIS SOW, never assume a fixed set of 3 or 4.
- "Standard RMS Data Migration" / "Standard RMS Migration for Reports, Cases, and
  Evidence" is Order-Form-side shorthand for bundling Report+Case+Evidence migration
  from a single source system — seen priced as one SKU-like line item on Lakewood's
  Order Form ("Standard Mark43 RMS Migration for Reports, Cases, and Evidence from a
  single source system (and version)"). CAD migration is priced/scoped as a fully
  separate line ("CAD Migration") — treat CAD migration as never bundled into the RMS
  migration price/scope even when both are purchased together.
- Universal migration entity pattern across ALL migration-type appendices: Users →
  Locations → Names/People/Organizations → Reports/Cases → Items → (Vehicles, if
  present) → Attachments → (Chains of Custody, if Evidence). Each entity section always
  states: what key data elements migrate, a Filter(s) note (what subset is in scope),
  and a Default(s)/Incomplete-data-handling note (what happens when source data doesn't
  meet Mark43's minimum requirements). When summarizing a migration appendix, preserve
  this Filter(s) vs Default(s) distinction — they answer different questions (what's
  included vs. what happens to messy data) and are easy to accidentally merge into one
  vague sentence.
- Universal fallback behaviors (seen worded near-identically across agencies — safe to
  treat as standard Mark43 migration policy, but still confirm the specific document
  states it before asserting it applies):
    - Users always migrate as disabled by default (historical users must be preserved).
    - Locations require min. Street Number + Street Name (or 2 Cross Streets, or valid
      Lat/Long) to become searchable location records; otherwise stored as a
      non-searchable legacy detail on the parent record.
    - Person/Organization profiles require min. First+Last Name (or an Organization
      name) to become searchable profiles; otherwise same non-searchable-detail fallback.
    - Items without a mapped Item Category default to a generic "Item"/"MIGRATED ITEM"
      bucket; Vehicles without a mapped type default similarly to "Vehicle"/"MIGRATED
      VEHICLE." Always extract the EXACT default label used in that document.
    - If no Case Types exist in the legacy system, cases migrate as Case Type
      "IMPORTED CASE" (verbatim label — Lakewood-confirmed; recheck if a doc uses a
      different literal string).
    - Evidence-specific: if no Custodial Property Report exists in the legacy system,
      Mark43 builds one from the Evidence Item's source reporting event number; a
      default Chain of Custody event named "Migrated" is created if none exists, in the
      "Main Facility" storage location, when the source has no chain of custody.
- Exclusions are agency-specific and MUST be extracted verbatim from the "Exclusions"
  or equivalent list, never assumed — e.g., Lakewood's SOW excludes "Warrants" and
  "NIBRS/UCR Offense Codes" from CAD migration scope; other SOWs may exclude other
  entities or none at all.

=== 4. PRODUCTS / MODULES — DO NOT ASSUME A FIXED SET ===
Confirmed core products across both agencies seen: RMS, CAD, Insights, Data Lake.
Modules that are NOT universal — confirm presence per-SOW before including or excluding
them from a summary:
- Booking Module: present in Lakewood's SOW (2.2) as its own top-level section;
  ABSENT entirely from Jersey Village's SOW. Never assume Booking is in scope unless
  its own numbered section appears in the source SOW.
- RMS Warrants Module: present in both agencies seen so far, but still confirm — do
  not assume universal without checking the specific SOW's 2.1.x numbering.
- OnScene (RMS) and First Responder/OnScene (CAD): present in both agencies as
  separate line items; extract module names exactly as titled in that SOW's TOC,
  since numbering (2.1.x vs 2.2.x vs 2.3.x) shifts between templates.
Report type core set (both agencies): Offense/Incident, Arrest, Supplement, Offense
Modifying Supplement, Property Evidence Summary Report, Citation, and a
crash-interface report type — NOTE the crash report type's exact NAME varies:
"Traffic Crash" (Jersey Village) vs. plain "Crash" (Lakewood). Always use the literal
report type name from the source, never normalize to one or the other.

=== 5. INTERFACES — NAMING/BUNDLING IS STATE- AND AGENCY-SPECIFIC ===
- Interfaces are always agency- and state-specific; never assume a fixed interface list.
  Always extract the Interface Name, Product+Direction, and Description columns
  verbatim from that SOW's interface table.
- Some states/regions bundle several interfaces under one named commercial bundle on
  the Order Form even though the SOW lists them individually — e.g., Jersey Village's
  SOW explicitly labels several interfaces "(part of Mark43 Texas Interface Bundle)":
  CRIS-Traffic Crash, MorphoTrak/LiveScan, RapidSOS, E911 (ANI/ALI), Flock Safety.
  Lakewood's SOW lists its interfaces (E911 ANI/ALI, Statewide Crash System–SOLVE,
  Statewide Citation System–SOLVE, Axon–Evidence.com, RapidSOS, Beast, Livescan/AFIS
  MorphoTrak, Matrix, ESO) with NO bundle name attached — treat bundle naming as
  something to report only when the source text itself names a bundle; don't infer one.
- State-run platform interfaces are named per-state and should never be normalized to a
  generic term: Texas uses "CRIS" (Traffic Crash) as its statewide crash system; Ohio
  uses "Statewide Crash System – SOLVE" and "Statewide Citation System – SOLVE" as its
  two SOLVE-branded interfaces. Extract the exact state platform name given.
- Recurring named third-party interface targets seen across states (same product,
  consistent naming — safe to recognize by name): RapidSOS, E911 (ANI/ALI), Flock
  Safety, ESO (fire RMS interchange), Livescan/AFIS MorphoTrak (mugshot/fingerprint
  interchange, sometimes called "MorphoTrak/LiveScan" instead), ProQA (fire/medical
  triage). Axon Evidence.com and "Beast" (evidence retrieval/creation) and "Matrix"
  (prosecutor system outbound) appear to be per-agency/vendor choices, not
  state-mandated — don't assume these appear elsewhere.

=== 6. TCOLE / STATE-CERTIFICATION FIELDS — DO NOT GENERALIZE ACROSS STATES ===
- TCOLE (Texas Commission on Law Enforcement) fields — e.g., "Completing TCOLE Report,"
  "Education Code Section/Subdivision" — appear inside Texas agencies' Stop/Field
  Contact report details. This is Texas-specific; do not project TCOLE terminology onto
  non-Texas agencies. Every state will have its own equivalent certifying-body
  terminology (e.g., Ohio's OPOTA) — extract whatever the specific state's fields
  actually are, never substitute a Texas term for an Ohio (or other state) document.

=== 7. ORDER FORM / SKU PATTERNS (from Lakewood Order Form — first real SKU sample) ===
- Order Forms use a "Quote Number" formatted like Q-XXXXX.X (e.g., Q-02076.2,
  Q-02325.6) — always extract this verbatim; it is the definitive deal identifier,
  more reliable than agency name for cross-referencing.
- SKU-style line-item naming convention observed (extract verbatim, do not paraphrase
  or invent a SKU code that isn't in the source):
    RMS product tiers: "RMS 1 ST" (RMS Reports Writing - STANDARD), "RMS 2 ST" (Case
      Management - STANDARD), "RMS 4" (Warrants Module), "RMS 7" (Fillable PDFs),
      "RMS 11" (Booking Module) — note the numbering is NOT sequential/dense; gaps are
      normal and do not imply missing modules.
    CAD product tiers: "CAD 1" (Dispatcher/Call-Taker), "CAD 2" (LE First Responder),
      "CAD 3" (Fire First Responder).
    Mobile: "MOB 1 RMS" (OnScene Mobile Application for RMS), "MOB 1 CAD" (OnScene
      Mobile Application for CAD) — same "MOB 1" numbering reused across RMS/CAD with
      the product suffix distinguishing them.
    Other observed SKU-like labels: "DLK 1" (Data Lake - Base), "Insights Informed -
      Small," "PAR 6" (ConnectCIC State Only), "PAR: CommSys Implementation," "Interface
      Maintenance: [API Interface | Platform | Standard | Custom 1 | Custom 2]" (a
      tiered classification of interface complexity that recurs on the SaaS/recurring
      side), "Interface Development: [same tiers]" (the one-time professional-services
      counterpart to Interface Maintenance), "Level 3 Implementation – CAD" / "Level 3
      Implementation - RMS," "Oversight - Dual Platform - [N]" (N = a numeric tier, seen
      as 20).
  IMPORTANT: treat every one of these SKU-like codes as needing VERBATIM extraction —
  never reconstruct a plausible-looking code (e.g., don't assume "RMS 3" exists just
  because RMS 1, 2, and 4 do). Only report SKUs that literally appear in the source.
- Interface complexity tiers ("API Interface" / "Platform" / "Standard" / "Custom 1" /
  "Custom 2") recur as a classification scheme across both Interface Maintenance and
  Interface Development line items — these tiers likely correspond to the "Interface
  Type" column values seen in SOW interface tables (Platform, Custom 1, 3rd Party,
  Standard). When summarizing, connect an interface's SOW-table "Interface Type" to its
  Order-Form pricing tier if both are present in source, but don't assume the mapping
  when only one appears.
- Order Forms show multi-year SaaS pricing (Year 1–5 seen on Lakewood, each with its own
  subtotal) plus a separate "Professional Services" table (one-time implementation
  costs) and a "Payment Schedule" table tied to milestones. Milestone names seen:
  "Order Form Start Date," "Milestone: Project Kickoff," "Milestone: Train the
  Trainer," "Milestone: Production Data Migration Complete" — these are payment
  triggers, not project-phase names; don't conflate them with the SOW's Section 3
  project phases even though they clearly correlate.
- Procurement vehicle citations are agency-specific and must be extracted verbatim,
  never assumed present — e.g., Lakewood's Order Form cites "Sourcewell's Cooperative
  Purchasing Program (Master Agreement Number 030425-MR43)"; other agencies may
  procure directly or via a different cooperative.
- Renewal terms are Order-Form-specific: Lakewood auto-renews for a 5-year term at 3%
  year-over-year increase absent 60 days' termination notice — always extract the
  specific percentage, term length, and notice period from the actual Order Form
  rather than assuming these figures.

=== 9. CANONICAL SKU CATALOG (source: Confluence "Mark43 Product SKU Catalogue
Summary," dated as-of December 2025 — treat as the ground truth for SKU codes;
re-verify against Confluence if a document date is later than this) ===
Use this list to validate/cross-check SKU codes seen in an Order Form — do NOT use
it to invent a SKU that isn't actually present in the source document, and do not
assume this list is exhaustive or permanently current (new SKUs launch regularly;
this snapshot already lists items "launched for sales in October [2025]" and items
with a "coming in 2026" status).
  RMS: RMS-1 (RMS Report Writing) — offered standalone; RMS-2 (Case Management);
    RMS-3 (Property and Evidence); RMS 4 (Warrants Module); RMS 7 (Fillable PDFs);
    RMS 11 (Booking Module) — offered standalone; RMS 12 (RMS Crash — sales launch
    2026, select markets); RMS 13 (RMS eCitations — launched Oct 2025, TX/CA select
    markets Q4 2025); RMS: ReportAI; RMS: BriefAI.
  CAD: CAD 1 (CAD Dispatcher/Call-Taker) — offered standalone; CAD 2 (LE First
    Responder); CAD 3 (Fire First Responder); CAD 6 (Alternate CAD) — offered
    standalone, an upsell product.
  Mobile Handheld: MOB-1-RMS (OnScene Mobile Application for RMS); MOB-1-CAD
    (OnScene Mobile Application for CAD); MOB-3-CAD (CarPlay).
  Universal Search: DEX 1 (CAD Data Exchange); USX (Universal Search — launched Oct
    2025, select-market rollout beginning Dec 2025).
  Analytics: INS-INF-X (Mark43 Insights Informed); INS-ADT (Insights Additional
    Tenant Management); DLK 1 (Data Lake – Base); DLK 2 (Data Lake – Dedicated);
    DLK 7 (Data Lake – Restricted).
  Security: SEC-FRT-X (Mark43 Fortified — launched Oct 2025); SEC: SCIM (launched
    Oct 2025).
  Naming-convention note: base SKU codes above (RMS-1, RMS 4, CAD 2, DLK 1, etc.)
  can appear with an environment or tier prefix/suffix layered on in an actual Order
  Form — see Section 10 below for the FedRAMP/reseller variant. Never assume the
  bare code and a prefixed/suffixed variant are different products; they are the
  same underlying SKU sold into a different environment or contract vehicle.

=== 10. FedRAMP / RESELLER ORDER FORM VARIANT (confirmed via AZ Dept of Liquor
Licenses and Control Order Form, "For Purchase Via Reseller") ===
- Some Order Forms are explicitly headed "ORDER FORM (For Purchase Via Reseller)"
  rather than the standard direct-sale Order Form — this variant is used when a
  Reseller (e.g. Carahsoft Technology Corp. — a large, GSA-affiliated reseller
  Mark43 works with, not agency-specific) sits between Mark43 and the Subscriber.
  In this variant: pricing tables show a Reseller Name/Address block in addition to
  Subscriber; invoicing language says "Reseller will issue the first invoice" (not
  Mark43); the Payment Schedule table's Due Date column may appear WITHOUT dollar
  amounts (pricing lives in the reseller's own contract layer, not Mark43's Order
  Form) — do not assume a missing "Amount Due" column means $0 or is an extraction
  error; and the renewal clause reads "at a price increase as determined by the
  Reseller" rather than stating a fixed percentage.
- FedRAMP-hosted deals prefix SKU codes with "FRH-" (e.g. FRH-RMS-1ST, FRH-RMS-2-ST,
  FRH-MOB 1-RMS) — this stands for FedRAMP High (Mark43's GovHigh/FedRAMP High cloud
  offering), confirmed via Confluence FedRAMP operations pages. The underlying
  product is identical to the non-prefixed SKU (e.g. FRH-RMS-1ST is the FedRAMP
  High-hosted instance of RMS-1); do not treat "FRH-" SKUs as a distinct product
  line when summarizing scope — do note the FedRAMP/GovHigh hosting distinction
  itself, since it's operationally significant (Subscriber may be a state/federal
  agency with elevated compliance requirements).
- Watch for inconsistent SKU-vs-description pairing within a single Order Form —
  e.g. the AZ Order Form lists SKU "FRH-RMS-2-ST" twice in the same year with two
  different descriptions ("Case Management - STANDARD - FedRAMP" and "FRH RMS 3
  STA: Property and Evidence - STANDARD - FedRAMP"), which is very likely a
  copy-paste error in the source Order Form's SKU column (the description clearly
  refers to RMS-3/Property and Evidence, not a second Case Management line). When
  this kind of mismatch appears, report BOTH the SKU code and the description
  exactly as written and flag the discrepancy rather than silently picking one or
  reconciling them — this is a source-document data quality issue, not something
  the drafting step should paper over.
- Reseller-variant SOWs also tend to pair with a materially different SOW template
  (see Section 11) — a reseller/FedRAMP deal and a "Standard Implementation Guide"
  state-bundle deal are not the same delivery track, and the two should not be
  assumed to share phase names, on-site visit patterns, or migration SKU naming.

=== 11. SOW TEMPLATE FAMILIES — AT LEAST TWO DISTINCT LINEAGES OBSERVED ===
Jersey Village (TX) and Lakewood (OH) both use the "Section N:" numbered-heading
SOW template (Section 1: Introduction and Overview, Section 2: Scope of Services...
through Section 7: Roles and Responsibilities, plus Signature Sheet and Appendix).
AZ Dept of Liquor Licenses and Control uses a COMPLETELY DIFFERENT, unnumbered SOW
template with different section names and different phase framing:
  - No "Section N:" numbering anywhere — headings are plain (e.g. "Scope of
    Services," "Application Setup," "Application Enablement," "Training," "Launch").
  - Has an explicit "Application Enablement" phase between Application Setup and
    Training that does NOT appear as its own named phase in the TX/OH template
    (TX/OH fold this into "Application Validation" instead — same concept,
    different template's section boundaries).
  - Has dedicated "Planned On-Site Visits" and "Resourcing" sections (deployment
    hour/day minimums, rescheduling notice requirements, 40-hour/week caps) not
    present at all in the TX/OH template — this AZ/reseller template appears to be
    used for engagements where on-site logistics are commercially significant
    enough to warrant their own contract section.
  - Uses "Project Scope Exclusions" and "Miscellaneous" as distinct section names
    instead of TX/OH's "Assumptions and Constraints" and "Change Order Process"
    framing — same underlying content (non-Mark43 product exclusions, one-year
    Professional Services expiration) worded and organized differently.
  - States "Professional Services shall expire one (1) year from the date of the
    Order" — a harder, agency-facing deadline than TX/OH's "SOW term... twelve (12)
    months" framing; extract whichever expiration language the specific document
    uses rather than assuming they're interchangeable phrasing for the same thing.
  - Data migration in this template is described as a single flat "Standard"
    migration type covering Reports+Cases+Evidence from "a single source" (no
    separate migration-type appendices titled "Report Migration"/"Case
    Migration"/etc. — instead ONE data migration section with THREE consecutive
    appendix subsections: Reports migration, Cases migration, Evidence migration —
    functionally similar content to the TX/OH appendices but organized as one
    continuous appendix rather than named as separate top-level migration types).
  TAKEAWAY: before drafting a summary, identify which template family the source
  SOW belongs to by its section headings — do not assume Section 3.1.1-style
  numbering, phase names, or appendix structure carry over from one template to
  the other. When in doubt, mirror the actual headings present in the source
  rather than forcing them into either template's shape.

=== 12. LEGACY SYSTEM NAMING — "GENERIC-SOUNDING" NAMES CAN BE LITERAL ===
AZ Dept of Liquor Licenses and Control's legacy system is named "Home Grown SQL DB"
in both the SOW body and the data migration appendix tables (Legacy System column).
This is NOT a placeholder or an extraction failure — some agencies genuinely run a
custom in-house database rather than a named commercial RMS product, and Mark43's
own documentation records it exactly this way. Combined with Lakewood's "One
Solution" (Section 3, prior entry — likely a real but generically-named legacy
vendor/product), the takeaway is: never assume a legacy system name that reads as
generic or placeholder-like is an extraction error — reproduce it verbatim, and
only flag it as uncertain if the surrounding context suggests OCR/extraction noise
(e.g. garbled characters), not merely because the name sounds unspecific.

=== 13. MIGRATION SKU NAMING IS CURRENTLY IN TRANSITION (source: Confluence
"[ARCHIVE] Data Migration SKU Strategy & Decision") ===
- The migration SKU historically called "Standard" (e.g. "Standard Mark43 RMS
  Migration for Reports, Cases, and Evidence from a single source system," "Standard
  Mark43 Migration," "Standard Evidence Migration," "Standard Cases/Investigations
  Migration" — all seen verbatim across JVPD/Lakewood/AZ Order Forms) was slated for
  rename to "Essential" starting September 2025, alongside a new, separately-priced
  "Essential CAD Migration" SKU. Order Forms signed before the rename will say
  "Standard"; ones signed after may say "Essential" for what is functionally the
  same migration scope. Always use whatever term the specific document contains —
  do not silently convert one to the other, but do recognize them as the same
  underlying migration product if a person asks about pricing/scope history.
- Historical root cause worth knowing for context (not for repeating to end users):
  CAD migration was frequently NOT included when agencies purchased RMS+CAD
  together and assumed CAD migration was bundled into "Standard" — this caused
  scope-mod change orders. This confirms and explains the pattern already noted in
  Section 3 above: CAD migration is priced and scoped as a fully separate line item
  from RMS/Reports/Cases/Evidence migration, and this is a known, historically
  costly point of confusion — worth flagging explicitly in a drafted summary if a
  SOW's data-migration table doesn't clearly show whether CAD migration was
  purchased, since its absence is a common source of downstream disputes.

=== 14. STATE STANDARD IMPLEMENTATION GUIDES EXIST — BUT NOT FOR EVERY STATE ===
Mark43 maintains internal "[State] - Standard Implementation Guide" pages on
Confluence for at least: Texas, California, New York, New Jersey, Massachusetts,
Florida, and Illinois (as of this glossary's last Confluence check). These guides
are the canonical source for a state's "standard pricing bundle" — the specific
RMS/CAD/Insights/Data Lake SKUs, standard report types, standard interfaces (split
into "Standard Interfaces" included in the bundle vs. "Add-On Interfaces" priced
separately), and standard training/launch delivery model for that state.
IMPORTANT CORRECTIONS/REFINEMENTS this surfaced vs. earlier assumptions in this
glossary:
  - Texas's actual STANDARD interface bundle (per the Confluence guide) is: State
    Crash System-Brazos, State Citations System-Brazos, TX DOT CRIS Crash, Saltus
    digiTICKET Citation Import, LexisNexis Ethos Citation Import, Mugshots/
    Fingerprints (Idemia or MorphoTrak), Esri GIS, Active Directory, CAD-to-RMS
    (for RMS-only customers), Axon, E911 (ANI/ALI), and Flock Safety. Notably,
    RapidSOS and ProQA — both present on Jersey Village's actual SOW as "part of
    Mark43 Texas Interface Bundle" — are NOT listed among Texas's standard
    interfaces in the canonical Confluence guide as platform-tier defaults; treat
    an individual agency's SOW as authoritative for THAT agency's actual purchased
    interfaces, and treat the Standard Implementation Guide as the state's default
    bundle baseline — the two can and do diverge per-deal (an agency can buy
    add-on interfaces beyond the state standard, or a SOW's own "bundle" framing
    may group things slightly differently than the internal guide does). Never
    treat "part of Mark43 [State] Interface Bundle" language in a customer-facing
    SOW as proof that interface is state-standard-bundle-included; it may instead
    mean commercially-bundled-into-this-specific-deal.
  - Texas's standard/default RMS report types per the Confluence guide are:
    Offense/Incident, Arrest, Supplement, Citation, Traffic Collision (note:
    "Traffic Collision," not "Traffic Crash" — yet another naming variant beyond
    the "Traffic Crash" vs. "Crash" split already noted in Section 4; always use
    the literal name in the specific source, since apparently even Mark43's own
    internal documentation isn't fully consistent on this name), Property Evidence
    Summary, and Offense Modifying Supplement.
  - No Standard Implementation Guide was found for Arizona or Ohio at time of
    writing — meaning Lakewood (OH) and AZ DLLC's SOWs likely reflect a bespoke or
    reseller-driven configuration rather than an established state-standard bundle.
    Do not assume every state has (or needs) a standard bundle; absence of a guide
    is itself informative and should not be treated as a gap in this glossary.
  - When drafting a summary and a Standard Implementation Guide exists for the
    relevant state, it can be used to sanity-check whether a given interface/report
    type/module is a state-standard inclusion or an agency-specific add-on — but
    the actual SOW/Order Form text is always authoritative for what THAT agency
    purchased; the guide is context, not a substitute for reading the deal's own
    documents.

=== 15. GENERAL ACCURACY DIRECTIVE FOR THIS GLOSSARY ===
Everything in sections 1 and parts of 3/8 marked "universal" is a working hypothesis
based on a small sample (currently 2 agencies). Use these patterns to know WHERE to
look and what shape to expect, not as a substitute for reading the actual source text.
If a source document contradicts anything stated here as "universal," trust the source
document and flag the discrepancy rather than silently forcing the source into this
glossary's shape.
`;

module.exports = { MARK43_DOMAIN_GLOSSARY };

/* ---------------------------------------------------------------------------
SERVER.JS WIRING (apply by hand — shown here rather than auto-patched since
this file doesn't have your repo's server.js to edit directly):

1. Near the top of server.js, alongside the other requires:

     const { MARK43_DOMAIN_GLOSSARY } = require('./mark43-glossary');

2. In draftText(prompt), prepend the glossary to whatever prompt comes in,
   so BOTH /api/draft and /api/publish-page get it automatically (publish
   calls draftText internally) instead of needing two edits kept in sync:

     async function draftText(prompt) {
       const fullPrompt = MARK43_DOMAIN_GLOSSARY + '\n\n' + prompt;
       const data = await anthropicRequest({
         model: MODEL,
         max_tokens: MAX_TOKENS,
         messages: [{ role: 'user', content: fullPrompt }],
       });
       return stripFences(textOf(data));
     }

   This keeps index.html's ACCURACY_RULE/XHTML_RULE/prompt-building logic
   completely unchanged — the glossary rides along underneath it on the
   server side where it belongs, and grows over time without touching the
   client bundle.

3. As you review more agencies, edit MARK43_DOMAIN_GLOSSARY directly in this
   file — no other changes needed. Consider adding a version/date comment
   at the top of the glossary once it's wired in, so you can tell later
   which glossary version a given Confluence page was drafted against.

4. Sections 9-14 were pulled directly from live Confluence pages (Mark43 Product
   SKU Catalogue Summary, state Standard Implementation Guides, Data Migration SKU
   Strategy) rather than inferred from customer SOWs. These are higher-confidence
   than the customer-document-derived sections, but they're still snapshots as of
   the date they were checked — SKUs and state bundles change. If the app ever
   gets Atlassian/Confluence MCP access wired in directly (rather than this static
   glossary), consider having it re-check the SKU Catalogue Summary and the
   relevant state's Standard Implementation Guide live at draft time instead of
   relying on a frozen copy here — ask if that's worth building once the basic
   glossary approach proves out.
--------------------------------------------------------------------------- */
