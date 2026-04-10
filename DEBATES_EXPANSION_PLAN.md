# Endo Debates Expansion + Quiz Mode

## Context
User wants to expand the endo-debates.html page from 5 debates to 19 debates (14 new topics), and add an interactive drag-to-match quiz mode where users match author names to study findings.

## Task Breakdown

### Part 1: Add 14 New Debate Topics to DEBATES Array

**File to modify:** `/home/user/treatment-rationale-guide/endo-debates.html`
**Location:** Insert before line 338 (before the closing `];` of the DEBATES array)

**The 14 new debate topics to add (in order):**

1. **Reciprocation vs. Continuous Rotation** (`id: "reciprocation-vs-rotation"`)
   - Question: WaveOne/Reciproc vs. ProTaper/Vortex — better fracture resistance, debris extrusion, centering?
   - Consensus: Reciprocation reduces fatigue fracture risk but continuous rotation may have better centering; both viable
   - Key studies: Yared 2008+, You 2010, Capar 2014, De-Deus 2013 (6-8 entries, mix of pro/nuanced)

2. **Larger Apical Preps vs. Minimal Enlargement** (`id: "apical-prep-size"`)
   - Question: Shape to 40/.06 or stop at 25/.06 for disinfection vs. dentin conservation?
   - Consensus: Modern cleaning/shaping + irrigation can work with minimal enlargement; larger prep not needed for disinfection
   - Key studies: Siqueira, Card, Mickel (5-7 entries)

3. **Bioceramic Sealers vs. Resin-Based Sealers** (`id: "bioceramic-vs-resin"`)
   - Question: BC Sealer/TotalFill bioactivity claims vs. decades of AH Plus evidence?
   - Consensus: Bioceramic sealer biocompatibility superior but long-term outcome data still emerging
   - Key studies: Camilleri, Donnermeyer, Marques (7-10 entries, pro/nuanced/con)

4. **Warm Vertical Compaction vs. Single-Cone + Bioceramic** (`id: "warm-vs-single-cone"`)
   - Question: Is warm condensation still justified or is single-cone with bioceramic equivalent?
   - Consensus: Single-cone + bioceramic sealer showing equivalent outcomes; simpler technique gaining traction
   - Key studies: Ng, Ørstavik, Gagliani (6-8 entries)

5. **MTA vs. Biodentine** (`id: "mta-vs-biodentine"`)
   - Question: For perforation repair, apexification, VPT — does Biodentine match MTA?
   - Consensus: Biodentine easier to use, shorter set time, but long-term outcome data less robust than MTA
   - Key studies: Grech, Atmeh, Bortoluzzi (6-9 entries)

6. **CBCT: Routine vs. Selective Use** (`id: "cbct-routine-vs-selective"`)
   - Question: AAE/AAOMR selective use position vs. clinical reality — when is 3D truly justified?
   - Consensus: Selective use recommended but diagnostic yield varies; most modern practices use liberally
   - Key studies: AAE Position, AAOMR, Patel, Scarfe (5-7 entries, expert-heavy)

7. **Cracked Tooth: Treat or Extract?** (`id: "cracked-tooth-prognosis"`)
   - Question: When RCT + restoration can save a cracked tooth vs. when extraction is wiser?
   - Consensus: Diagnosis unreliable, prognosis unpredictable; crack size + location + depth matter most
   - Key studies: Cameron, Kahler, Reuterving (5-8 entries, mix of outcomes)

8. **Nonsurgical Retreatment vs. Apicoectomy vs. Implant** (`id: "retreatment-vs-apico-vs-implant"`)
   - Question: When primary RCT fails, which path offers best long-term outcome and cost-effectiveness?
   - Consensus: Nonsurgical retreatment has higher success than apicoectomy; implant long-term outcomes excellent but cost/time/bone loss factors
   - Key studies: Friedman, Tsesis, Baumann (7-10 entries)

9. **Regenerative Endodontics (REPs) vs. MTA Apexification** (`id: "rep-vs-mta-apexification"`)
   - Question: For immature necrotic teeth — continued root development vs. predictable apical barrier?
   - Consensus: REPs promising for root development but technique-sensitive, not yet standard-of-care; MTA apexification more predictable
   - Key studies: Witherspoon, Cehreli, Huang (6-8 entries, nuanced-heavy)

10. **Intentional Replantation vs. Apicoectomy** (`id: "intentional-replantation"`)
    - Question: For posterior teeth with limited surgical access — underutilized or unpredictable?
    - Consensus: Success 50-95% depending on technique; viable adjunct for select cases but not first-line
    - Key studies: Andersson, Chong, Cohenca (5-7 entries)

11. **Antibiotics in Endodontics: When, If Ever?** (`id: "antibiotics-endo"`)
    - Question: Massive global overuse vs. genuine indications — localized vs. spreading infection?
    - Consensus: Antibiotics indicated only for systemic spread signs/symptoms, not for symptomatic irreversible pulpitis alone
    - Key studies: European position, ESC, AAE guidelines (6-8 entries, expert-heavy)

12. **Corticosteroids for Post-Op Pain** (`id: "corticosteroids-postop-pain"`)
    - Question: Intracanal dexamethasone, systemic prednisolone — effective adjunct or unnecessary?
    - Consensus: Weak to moderate evidence for corticosteroid benefit; adjunctive role but not first-line
    - Key studies: Alem, Nosrat, Nagendrababu (5-7 entries, nuanced)

13. **Post and Core: Still Needed?** (`id: "post-and-core-necessity"`)
    - Question: Fiber post vs. cast post vs. no post — modern adhesive dentistry changed the calculus?
    - Consensus: Post needed only when insufficient coronal tooth structure remains; adhesive restoration often sufficient for posts not needed
    - Key studies: Sorensen, Freedman, Naumann (6-8 entries)

14. **Full-Coverage Crown vs. Conservative Restoration** (`id: "crown-vs-conservative-resto"`)
    - Question: "Always crown" dogma vs. evidence for onlays/overlays on premolars and anterior teeth?
    - Consensus: Conservative restoration with adequate support can work; crown not always necessary; depends on tooth structure and material
    - Key studies: Mannocci, Grandini, Corti (6-9 entries)

---

### Part 2: Add Drag-to-Match Quiz Mode

**File to modify:** `/home/user/treatment-rationale-guide/endo-debates.html`

**Changes:**
1. Add new CSS styles (before closing `</style>` tag) for quiz mode:
   - Draggable author pills styling
   - Drop zones for findings
   - Feedback states (correct/incorrect)
   - Animations for successful matches

2. Add new React components after the DebatesApp component:
   - `QuizMode` component: 
     - Render list of author names as draggable pills
     - Render corresponding findings as drop zones
     - Track matches via state
     - Show feedback (green checkmark for correct, shake for wrong)
     - Reset button to start over
   - Implement drag & drop event handlers (onDragStart, onDragOver, onDrop)
   - Score tracking display

3. Update `DebatesApp` component:
   - Add state for `showQuiz` (toggle between timeline view and quiz mode)
   - Add button in header or sidebar to toggle to Quiz mode
   - Pass current debate data to QuizMode when active

4. Update Header component:
   - Add "Quiz Mode" toggle button next to debate selector

---

## Data Entry Notes

For each of the 14 new debates:
- **Minimum 5 entries per debate, ideally 6-8**
- Entry structure: `{ year, author, citeKey, pmid (nullable), evidence, stance, finding }`
- Evidence types: `sr-meta`, `rct`, `cohort`, `case-series`, `expert`
- Stance types: `pro`, `con`, `nuanced`
- Finding text: 100-250 words, summarizing the study's contribution to the debate
- Year range: Spread across 15-30 year spans when possible
- PMIDs: Real PubMed IDs where available; null if not found

---

## Files to Modify

1. **`/home/user/treatment-rationale-guide/endo-debates.html`** (single file, ~3500 lines after expansion)
   - Insert 14 debate objects into DEBATES array (lines 135-337)
   - Add CSS styles for quiz mode (~50-100 lines)
   - Add QuizMode component (~150-200 lines)
   - Update Header component to include quiz toggle
   - Update DebatesApp to manage quiz state

---

## Git Workflow

**Branch:** `claude/brainstorm-debate-topics-FAtkt` (already created)

**Commit message:**
```
Add 14 new debate topics + drag-to-match quiz mode

- Expand debates from 5 to 19 topics covering:
  - Instrumentation (reciprocation vs rotation, apical prep size)
  - Materials (bioceramic vs resin, warm vs single-cone, MTA vs Biodentine)
  - Diagnosis & imaging (CBCT, cracked tooth)
  - Retreatment & tooth preservation (nonsurgical vs surgical, REPs, intentional replantation)
  - Pharmacology (antibiotics, corticosteroids)
  - Post-endodontic restoration (posts, crowns)
- Add interactive drag-to-match quiz mode for evidence timelines
- Each debate includes 5-10 landmark studies with stances, evidence types, findings
```

---

## Verification

After implementation:
1. Load endo-debates.html in browser
2. Verify all 19 debates appear in sidebar
3. Click through each debate; verify entries display chronologically
4. Test drag-to-match quiz:
   - Drag author pill to correct finding zone → should highlight green
   - Drag author to wrong finding → should show error feedback
   - Reset button clears all matches
5. Verify abstracts still load (abstracts.json)
6. Check responsive design on mobile (select dropdown works)

---

## Notes for Next Session

- The existing 5 debates already have detailed evidence entries; use them as a template for tone, length, and citation key format
- PMIDs may not exist for all historical papers — that's okay; `pmid: null` is acceptable
- The citeKey format is critical: `"Author|Year"` (e.g., `"Yared|2008"`) for abstract lookup to work
- Don't add consensus callouts longer than 500 words; keep them punchy
- The timeline rail automatically handles year spacing and dot stacking; no manual layout needed
- Quiz mode scoring can be simple: just count correct matches, show final score at end
