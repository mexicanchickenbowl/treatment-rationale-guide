#!/usr/bin/env python3
"""
Second-pass fix for low-confidence or wrong abstract matches.

For each entry with score < 0.40 (or known wrong):
  - Build a finding-keyword-driven PubMed query
  - Try multiple query strategies in order
  - Accept the first candidate that scores > 0.35
  - Fall back to best-of-N if nothing clears the threshold
"""

import json, time, re
from collections import defaultdict
from urllib.request import urlopen, Request
from urllib.parse import urlencode
from urllib.error import URLError
from xml.etree import ElementTree

INPUT_DATA = "guide-data.json"
ABSTRACTS  = "abstracts.json"
BASE       = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/"
DELAY      = 0.4

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
    "endodontic","dental","pulpal","apical","periapical","canal","compared","showed",
}


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
        parts = []
        for at in article.findall(".//AbstractText"):
            label = at.get("Label", "")
            text  = "".join(at.itertext()).strip()
            if text:
                parts.append(f"{label}: {text}" if label else text)
        abstract = " ".join(parts)
        results.append(dict(pmid=pmid, title=title, abstract=abstract,
                            journal=journal, year=year))
    return results


def first_surname(author):
    a = re.sub(r'\s+et\s+al\.?', '', author, flags=re.IGNORECASE)
    a = re.sub(r'\s+(and|&)\s+.*', '', a, flags=re.IGNORECASE)
    return a.strip()


def key_terms(findings, n=4):
    """Extract top-n most specific/rare words from findings for querying."""
    text = " ".join(findings).lower()
    all_words = re.findall(r'\b[a-z]{5,}\b', text)
    filtered = [w for w in all_words if w not in STOP]
    # Prefer longer, more specific words
    by_len = sorted(set(filtered), key=lambda w: (-len(w), w))
    return by_len[:n]


def meaningful_words(text):
    return {w for w in re.findall(r'\b[a-z]{4,}\b', text.lower()) if w not in STOP}


def score_candidate(findings_words, candidate):
    haystack = (candidate["title"] + " " + candidate["abstract"]).lower()
    if not haystack.strip():
        return 0.0
    hits = sum(1 for w in findings_words if w in haystack)
    return hits / max(len(findings_words), 1)


def try_queries(queries, findings_words, threshold=0.30):
    """Run queries in order, return first result that beats threshold, or best overall."""
    best_score, best_result = 0.0, None
    for query in queries:
        try:
            time.sleep(DELAY)
            pmids = esearch(query, retmax=5)
            if not pmids:
                continue
            time.sleep(DELAY)
            candidates = efetch_articles(pmids)
            if not candidates:
                continue
            scored = sorted([(score_candidate(findings_words, c), c) for c in candidates],
                            key=lambda x: -x[0])
            score, c = scored[0]
            if score > best_score:
                best_score, best_result = score, c
            if score >= threshold:
                break  # Good enough — stop
        except Exception as e:
            print(f"    !! {e}")
            time.sleep(1)
    return best_score, best_result


def build_finding_queries(author, year, findings):
    sur = first_surname(author)
    terms = key_terms(findings, n=4)
    term_filters = [f"{t}[TiAb]" for t in terms]

    queries = []

    # Q1: author + year + top 2 finding terms
    if year and len(terms) >= 2:
        queries.append(f"{sur}[Author] AND {year}[PDAT] AND ({term_filters[0]} OR {term_filters[1]})")

    # Q2: author + year + all top finding terms (broader OR)
    if year and terms:
        queries.append(f"{sur}[Author] AND {year}[PDAT] AND ({' OR '.join(term_filters[:3])})")

    # Q3: author + year (plain)
    if year:
        queries.append(f"{sur}[Author] AND {year}[PDAT]")

    # Q4: author + top finding terms, no year restriction
    if len(terms) >= 2:
        queries.append(f"{sur}[Author] AND ({term_filters[0]} AND {term_filters[1]})")

    # Q5: author + any finding term, no year
    for tf in term_filters:
        queries.append(f"{sur}[Author] AND {tf}")

    # Q6: free-text search with top terms + endo context
    if len(terms) >= 2:
        queries.append(f"{sur}[Author] AND endodont*[TiAb] AND {term_filters[0]}")

    return queries


def main():
    with open(INPUT_DATA) as f:
        data = json.load(f)
    with open(ABSTRACTS) as f:
        abstracts = json.load(f)

    groups = defaultdict(list)
    for card in data["cards"]:
        groups[(card["author"], card["year"])].append(card["finding"])

    # Process only entries with score < 0.40
    THRESHOLD = 0.40
    to_fix = []
    for key, entry in abstracts.items():
        if entry.get("score", 0) < THRESHOLD:
            parts = key.split("|", 1)
            author = parts[0]
            year   = parts[1] if len(parts) > 1 else ""
            findings = groups.get((author, year), [])
            to_fix.append((key, author, year, findings, entry))

    to_fix.sort(key=lambda x: x[0])
    print(f"Re-fetching {len(to_fix)} low-confidence entries...\n")

    improved = 0
    for i, (key, author, year, findings, old_entry) in enumerate(to_fix, 1):
        label = f"{author} ({year})" if year else author
        old_score = old_entry.get("score", 0)

        if not findings:
            print(f"[{i:02d}] {label:<40} — no cards, skipping")
            continue

        findings_words = meaningful_words(" ".join(findings))
        queries = build_finding_queries(author, year, findings)

        print(f"[{i:02d}] {label:<40} (was {old_score:.2f}) searching with terms: {key_terms(findings)}")

        new_score, best = try_queries(queries, findings_words, threshold=0.40)

        if best is None:
            abstracts[key] = {"pmid": None, "title": "", "abstract": "",
                              "status": "not_found", "score": 0}
            print(f"      → still not found")
        elif new_score > old_score + 0.01:
            abstracts[key] = {
                "pmid":     best["pmid"],
                "title":    best["title"],
                "abstract": best["abstract"],
                "journal":  best["journal"],
                "pub_year": best["year"],
                "status":   "ok",
                "score":    round(new_score, 3),
            }
            improved += 1
            delta = f"+{new_score - old_score:.2f}"
            print(f"      → [{new_score:.2f}] ({delta}) {best['title'][:65]}")
        else:
            # Keep old result but log
            print(f"      → no improvement ({new_score:.2f} ≤ {old_score:.2f}), keeping original")

        with open(ABSTRACTS, "w") as f:
            json.dump(abstracts, f, indent=2, ensure_ascii=False)

    ok = sum(1 for v in abstracts.values() if v.get("status") == "ok")
    nf = sum(1 for v in abstracts.values() if v.get("status") == "not_found")
    print(f"\n{'─'*60}")
    print(f"Improved {improved}/{len(to_fix)} low-confidence entries")
    print(f"Final: {ok} found, {nf} not found out of {len(abstracts)} total")


if __name__ == "__main__":
    main()
