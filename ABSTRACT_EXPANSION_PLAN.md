# Abstract Popup — Research & Expansion Plan

## Current State

| Metric | Count |
|--------|-------|
| Study cards in guide | 122 |
| Abstract entries in `abstracts.json` | 83 |
| Cards with **no** abstract key at all | 23 |
| Abstract entries with `status: not_found` | 12 |
| Abstract entries with `status: ok` | 71 |

The 23 missing cards are all **new citations added in the last editing session** (Sathorn, Evans, Krasner, Shabahang, Zehnder, Peters, Costa, etc.) — the fetch script was never re-run after they were added to the guide.

---

## Step 1 — Re-run the abstract fetcher (highest ROI, ~5 min)

The existing `fetch_abstracts.py` script queries PubMed for every card in `guide-data.json` and saves results incrementally to `abstracts.json`. It **skips already-cached entries**, so running it again only fetches the 23 new ones.

```bash
cd /home/user/treatment-rationale-guide
python3 fetch_abstracts.py
```

After it finishes, rebuild:

```bash
python3 build.py
```

**Expected outcome:** Most of the 23 missing citations (Sathorn, Evans, Zehnder, Peters, Basrani, Krasner, Burch & Hulen, Ricucci & Langeland, etc.) will get real PubMed abstracts injected into the popup.

**Watch for:** Entries scored < 0.10 — low scores mean the top hit is probably the wrong article. Review those manually (see Step 3).

---

## Step 2 — Manually fix the 12 `not_found` entries

These entries failed the automated search. Some have no year or unusual author names. Research each on [PubMed](https://pubmed.ncbi.nlm.nih.gov/) and add the result directly to `abstracts.json`.

### Format for a manual entry

```json
"Trowbridge|": {
  "pmid": "6590091",
  "title": "Intradental sensory units: physiological and clinical aspects.",
  "abstract": "This paper reviews the mechanisms of dentinal...",
  "journal": "Journal of Endodontics",
  "pub_year": "1985",
  "status": "ok",
  "score": 1.0
}
```

### Entries to research manually

| Key | What to search on PubMed | Card finding snippet |
|-----|--------------------------|----------------------|
| `Trowbridge|` | "Trowbridge dentin hydrodynamic" | Cold testing mechanism: outward hydrodynamic fluid flow |
| `Bhaskar and Rappaport|` | "Bhaskar Rappaport periapical cyst" | Periapical lesion histology |
| `Grossman|1976` | "Grossman 1976 endodontics" | Seal importance |
| `Harrington|` | "Harrington endodontic periodontal" | Endo-perio lesion diagnosis |
| `Hulsmann|2000` | "Hulsmann 2000 root canal preparation" | Canal preparation |
| `Fan|2004` | "Fan 2004 C-shaped canal" | C-shaped canal morphology |
| `Gillhooly|2000` | "Gillhooly 2000 root canal irrigation" | Irrigation efficacy |
| `Kumar|2021` | "Kumar 2021 endodontics" | Check card finding for context |
| `Lawley|2004` | "Lawley 2004 mandibular molar" | Canal anatomy |
| `Peng|2007` | "Peng 2007 root canal" | Obturation or outcome |
| `Sedley|2005` | "Sedley 2005 pulp sensory" | Pulp sensory testing |
| `Shanbhag|` | "Shanbhag endodontics" | Check card finding for context |

**Workflow for each:**
1. Go to https://pubmed.ncbi.nlm.nih.gov/
2. Search using the terms above
3. Open the best match, copy the PMID from the URL
4. Add the entry to `abstracts.json` with `"status": "ok"`
5. After all entries added, run `python3 build.py`

---

## Step 3 — Review low-confidence matches (score < 0.25)

After the fetch script runs, check `abstracts.json` for entries where `"score"` is low — these are likely the wrong PubMed article. Run this audit:

```bash
python3 -c "
import json
with open('abstracts.json') as f:
    ab = json.load(f)
low = [(k, v['score'], v.get('title','')[:70]) for k,v in ab.items()
       if v.get('status')=='ok' and v.get('score', 1) < 0.25]
for k, s, t in sorted(low, key=lambda x: x[1]):
    print(f'{s:.2f}  {k:<35}  {t}')
"
```

For each low-score entry, manually verify on PubMed and replace if wrong.

---

## Step 4 — Fix the `AAE and AAO 2015` key mismatch

The card `author = "AAE and AAO 2015 joint position statement"` doesn't match any abstract key. The fetch script uses the full author string as the key. Two fixes needed:

**A. Add the abstract manually to `abstracts.json`:**
```json
"AAE and AAO 2015 joint position statement|": {
  "pmid": "25732401",
  "title": "AAE and AAOMR Joint Position Statement: Use of Cone Beam Computed Tomography in Endodontics 2015 Update",
  "abstract": "...",
  "journal": "Journal of Endodontics",
  "pub_year": "2015",
  "status": "ok",
  "score": 1.0
}
```

**B. Or normalize the author name** in `endo-guide.md` from:
```
{{cite: AAE and AAO 2015 joint position statement — ...}}
```
to:
```
{{cite: AAE 2015 — ...}}
```
…so it matches key `"AAE|2015"` which the fetcher can find.

---

## Step 5 — Improve the matching logic in the popup (optional)

The current `openAbstract` function does exact key matching only. Some cite texts (especially prose-detected ones like "de Chevigny et al. 2008") may not match the stored key format perfectly. Improvements to consider in `endo-guide.template.html`:

### A. Fuzzy fallback: try first-author-only match
```javascript
const openAbstract = useCallback((citeText) => {
  const yearMatch = citeText.match(/\b(\d{4})\b/);
  const year   = yearMatch ? yearMatch[1] : "";
  const author = citeText.replace(/\s*\b\d{4}\b/, "").replace(/\s+et\s+al\.?/i, "").trim();
  
  const abs = DATA?.abstracts || {};
  
  // Try progressively looser matches
  const abstract =
    abs[`${author}|${year}`] ||          // exact: "Peters|2001"
    abs[`${author}|`] ||                  // no year: "Peters|"
    // First surname only
    Object.entries(abs).find(([k]) => {
      const kAuthor = k.split("|")[0].toLowerCase();
      const kYear   = k.split("|")[1] || "";
      return kAuthor.startsWith(author.split(" ")[0].toLowerCase()) &&
             (!year || !kYear || kYear === year);
    })?.[1] ||
    null;
  ...
```

### B. Show "no abstract" more gracefully
When `abstract` is null AND `card` is null, currently shows nothing useful. Add a fallback showing just the cite text and a direct PubMed search link:
```
https://pubmed.ncbi.nlm.nih.gov/?term=Author+Year+endodontics
```

### C. Add a "Search PubMed" button to every popup
Even when we have an abstract, a link to search PubMed for the full paper is useful:
```jsx
<a href={`https://pubmed.ncbi.nlm.nih.gov/?term=${encodeURIComponent(author + ' ' + year)}`}
   target="_blank" rel="noopener noreferrer"
   className="text-xs text-slate-400 hover:underline">
  Search PubMed
</a>
```

---

## Step 6 — Add more citations to the guide (ongoing content work)

Sections that still lack strong citation coverage (from the original audit):

| Section | Gap | Suggested citations to add |
|---------|-----|---------------------------|
| §3.2 | Ledge formation mechanism | Esposito & Cunningham 1995 |
| §5.3 | Apical patency debate | Vera 2012; Lambrianidis 2006 |
| §6.3 | EDTA smear layer removal | Yamada 1983; Çalt & Serper 2002 |
| §9.1 | MTA vs. calcium silicate outcomes | Torabinejad 2010; Parirokh & Torabinejad 2010 |
| §14  | Resorption classification | Heithersay 1999 |
| §15  | Traumatic injury outcomes | Andreasen 1994 |

For each: add a `{{cite: Author Year — Finding}}` marker in `endo-guide.md`, re-run `python3 build.py`, then re-run `python3 fetch_abstracts.py` to pull the abstract.

---

## Recommended execution order

1. `python3 fetch_abstracts.py` — automated, covers ~20 new entries
2. `python3 build.py` — rebuild
3. Run the low-score audit (Step 3) — review ~5–10 entries manually
4. Fix the 12 `not_found` entries manually (Step 2) — ~30 min of PubMed searching
5. Fix the AAE/AAO key (Step 4) — 5 min
6. Rebuild and push
7. Tackle Step 5 (fuzzy matching) and Step 6 (new citations) as separate sessions
