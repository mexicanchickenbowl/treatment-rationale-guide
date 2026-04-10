#!/usr/bin/env python3
"""
Fetch and curate PubMed abstracts for every unique citation in guide-data.json.

Strategy per citation:
  1. Search PubMed: Author[Author] + Year[PDAT] + dental/endo context terms
  2. If no hits, retry without the context filter
  3. If multiple hits, score each candidate by word-overlap with the card findings
  4. Save the best match (or not_found) to abstracts.json incrementally

Run:  python3 fetch_abstracts.py
"""

import json, time, re, sys
from collections import defaultdict
from urllib.request import urlopen, Request
from urllib.parse import urlencode
from urllib.error import URLError
from xml.etree import ElementTree

INPUT   = "guide-data.json"
OUTPUT  = "abstracts.json"
BASE    = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/"
DELAY   = 0.4   # NCBI allows 3 req/sec without API key; 0.4s is safe

STOP = {
    "that","with","from","this","than","have","been","more","also","when","after","before",
    "which","their","there","these","those","using","used","were","could","should","would",
    "about","both","into","each","they","some","then","them","will","such","only","very",
    "most","much","many","over","under","during","following","within","without","between",
    "among","the","and","for","are","was","not","can","but","per","all","its","any","one",
    "two","has","had","may","who","shows","showed","show","found","find","compared","versus",
    "significantly","significant","patients","results","study","studies","treatment",
    "clinical","associated","group","groups","cases","case","data","effect","effects",
    "rate","rates","success","failure","teeth","tooth","canal","canals","root","pulp",
}


# ── PubMed helpers ────────────────────────────────────────────────────────────

def fetch_url(url, retries=3):
    for attempt in range(retries):
        try:
            req = Request(url, headers={"User-Agent": "EndoGuideAbstractFetcher/1.0"})
            with urlopen(req, timeout=15) as r:
                return r.read()
        except URLError as e:
            if attempt < retries - 1:
                time.sleep(2 ** attempt)
            else:
                raise


def esearch(query, retmax=5):
    params = urlencode({"db": "pubmed", "term": query,
                        "retmode": "json", "retmax": retmax})
    data = json.loads(fetch_url(f"{BASE}esearch.fcgi?{params}"))
    return data.get("esearchresult", {}).get("idlist", [])


def efetch_articles(pmids):
    """Return list of dicts with pmid/title/abstract/journal/year."""
    if not pmids:
        return []
    params = urlencode({"db": "pubmed", "id": ",".join(pmids),
                        "rettype": "abstract", "retmode": "xml"})
    xml_bytes = fetch_url(f"{BASE}efetch.fcgi?{params}")
    tree = ElementTree.fromstring(xml_bytes)
    results = []
    for article in tree.findall(".//PubmedArticle"):
        pmid_el    = article.find(".//PMID")
        title_el   = article.find(".//ArticleTitle")
        journal_el = article.find(".//Journal/Title")
        year_el    = article.find(".//PubDate/Year")

        pmid    = pmid_el.text if pmid_el is not None else ""
        title   = "".join(title_el.itertext()) if title_el is not None else ""
        journal = journal_el.text if journal_el is not None else ""
        year    = year_el.text if year_el is not None else ""

        # Structured abstracts have multiple <AbstractText Label="..."> sections
        abstract_parts = []
        for at in article.findall(".//AbstractText"):
            label = at.get("Label", "")
            text  = "".join(at.itertext()).strip()
            if text:
                abstract_parts.append(f"{label}: {text}" if label else text)
        abstract = " ".join(abstract_parts)

        results.append(dict(pmid=pmid, title=title, abstract=abstract,
                            journal=journal, year=year))
    return results


# ── Author / query helpers ────────────────────────────────────────────────────

def first_surname(author):
    """'de Chevigny et al.' → 'de Chevigny'  |  'Mainkar and Kim' → 'Mainkar'"""
    a = re.sub(r'\s+et\s+al\.?', '', author, flags=re.IGNORECASE)
    a = re.sub(r'\s+(and|&)\s+.*', '', a, flags=re.IGNORECASE)
    return a.strip()


ENDO_FILTER = (
    "(endodont*[TiAb] OR root canal[TiAb] OR pulp[TiAb] "
    "OR periapical[TiAb] OR dental[TiAb] OR dentin[TiAb])"
)


def build_queries(author, year):
    """Return a list of queries to try in order (most specific first)."""
    sur = first_surname(author)
    queries = []
    if year:
        queries.append(f"{sur}[Author] AND {year}[PDAT] AND {ENDO_FILTER}")
        queries.append(f"{sur}[Author] AND {year}[PDAT]")
    queries.append(f"{sur}[Author] AND {ENDO_FILTER}")
    queries.append(f"{sur}[Author]")
    return queries


# ── Scoring ───────────────────────────────────────────────────────────────────

def meaningful_words(text):
    return {w for w in re.findall(r'\b[a-z]{4,}\b', text.lower()) if w not in STOP}


def score_candidate(findings_words, candidate):
    haystack = (candidate["title"] + " " + candidate["abstract"]).lower()
    if not haystack.strip():
        return 0.0
    hits = sum(1 for w in findings_words if w in haystack)
    return hits / max(len(findings_words), 1)


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    with open(INPUT) as f:
        data = json.load(f)

    groups = defaultdict(list)
    for card in data["cards"]:
        groups[(card["author"], card["year"])].append(card["finding"])

    # Load existing results (allows resume)
    try:
        with open(OUTPUT) as f:
            abstracts = json.load(f)
        print(f"Resuming — {len(abstracts)} already cached.\n")
    except FileNotFoundError:
        abstracts = {}

    pairs = sorted(groups.items())
    total = len(pairs)
    found_n = not_found_n = error_n = 0

    for idx, ((author, year), findings) in enumerate(pairs, 1):
        key = f"{author}|{year}"
        label = f"{author} ({year})" if year else author

        if key in abstracts:
            st = abstracts[key].get("status", "?")
            print(f"[{idx:02d}/{total}] {label:<40} ✓ cached ({st})")
            if st == "ok":       found_n += 1
            elif st == "not_found": not_found_n += 1
            else:                error_n += 1
            continue

        findings_words = meaningful_words(" ".join(findings))
        result = None

        for query in build_queries(author, year):
            try:
                time.sleep(DELAY)
                pmids = esearch(query, retmax=5)
                if not pmids:
                    continue

                time.sleep(DELAY)
                candidates = efetch_articles(pmids)
                if not candidates:
                    continue

                # Score + pick best
                scored = sorted(
                    [(score_candidate(findings_words, c), c) for c in candidates],
                    key=lambda x: -x[0]
                )
                best_score, best = scored[0]

                result = {
                    "pmid":     best["pmid"],
                    "title":    best["title"],
                    "abstract": best["abstract"],
                    "journal":  best["journal"],
                    "pub_year": best["year"],
                    "status":   "ok",
                    "score":    round(best_score, 3),
                    "query":    query,
                }
                # Stamp confidence / needs_review so the UI can surface
                # low-confidence matches.
                s = result["score"]
                result["confidence"] = ("high"   if s >= 0.55 else
                                        "medium" if s >= 0.35 else "low")
                result["needs_review"] = result["confidence"] != "high"
                break  # found a result — stop trying queries

            except Exception as e:
                print(f"  !! error on query '{query}': {e}")
                time.sleep(1)
                continue

        if result is None:
            result = {"pmid": None, "title": "", "abstract": "",
                      "status": "not_found", "score": 0,
                      "confidence": "unknown", "needs_review": True}
            not_found_n += 1
            print(f"[{idx:02d}/{total}] {label:<40} ✗ not found")
        else:
            found_n += 1
            title_preview = result["title"][:70] if result["title"] else "(no title)"
            score_str = f"{result['score']:.2f}"
            print(f"[{idx:02d}/{total}] {label:<40} [{score_str}] {title_preview}")

        abstracts[key] = result

        # Save after every entry so we can resume on interrupt
        with open(OUTPUT, "w") as f:
            json.dump(abstracts, f, indent=2, ensure_ascii=False)

    print(f"\n{'─'*60}")
    print(f"Total: {total}  |  Found: {found_n}  |  Not found: {not_found_n}  |  Errors: {error_n}")
    print(f"Results saved to {OUTPUT}")


if __name__ == "__main__":
    main()
