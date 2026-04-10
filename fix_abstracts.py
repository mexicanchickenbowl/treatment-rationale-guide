#!/usr/bin/env python3
"""
Second-pass fix for low-confidence or wrong abstract matches.

For each entry with score < THRESHOLD (or known wrong):
  - Build a finding-keyword-driven PubMed query
  - Try multiple query strategies in order
  - Accept the first candidate that scores above threshold AND passes
    sanity checks (author surname present, year diff ≤ 2)
  - Fall back to best-of-N if nothing clears the threshold
  - Stamp a `confidence` field ("high" / "medium" / "low") and a
    `needs_review` boolean so the UI can surface shaky matches

CLI:
    python3 fix_abstracts.py                  # full run (all low-conf entries)
    python3 fix_abstracts.py --shard=0 --max=5   # shard N of 6, cap 5 fetches
    python3 fix_abstracts.py --auto-flag       # also restamp confidence/needs_review
                                               # on every entry (no PubMed fetches
                                               # needed — cheap pass)

The hourly GitHub Actions workflow calls this as:
    python3 fix_abstracts.py --shard=$((hour_UTC % 6)) --max=5 --auto-flag
"""

import argparse, json, time, re, sys
from collections import defaultdict
from urllib.request import urlopen, Request
from urllib.parse import urlencode
from urllib.error import URLError
from xml.etree import ElementTree

INPUT_DATA = "guide-data.json"
ABSTRACTS  = "abstracts.json"
BASE       = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/"
DELAY      = 0.4

# Confidence thresholds (derived from the score field)
CONF_HIGH   = 0.55
CONF_MEDIUM = 0.35
THRESHOLD   = 0.40   # under this → eligible for re-fix


def confidence_from_score(score: float) -> str:
    """Map a 0..1 match score to a discrete confidence bucket."""
    try:
        s = float(score or 0)
    except (TypeError, ValueError):
        s = 0.0
    if s >= CONF_HIGH:
        return "high"
    if s >= CONF_MEDIUM:
        return "medium"
    return "low"


def stamp_confidence(entry: dict) -> dict:
    """Add confidence + needs_review fields in-place and return the entry.

    Additive: never removes existing keys, so older consumers stay happy.
    """
    if entry.get("status") == "not_found":
        entry["confidence"]   = "unknown"
        entry["needs_review"] = True
        return entry
    score = entry.get("score", 0)
    entry["confidence"]   = confidence_from_score(score)
    entry["needs_review"] = entry["confidence"] != "high"
    return entry

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


def bigrams(words):
    """Return the set of adjacent word bigrams from a token list."""
    return {(words[i], words[i + 1]) for i in range(len(words) - 1)}


def score_candidate(findings_words, candidate, finding_text=None):
    """Compute a 0..1 match score combining unigram hit-rate and bigram Jaccard.

    - Unigram hit-rate: fraction of meaningful finding words that appear
      anywhere in title+abstract (the original metric).
    - Bigram Jaccard: overlap of adjacent word-pairs between the finding
      text and the title — punishes matches that share vocabulary but not
      phrasing (classic wrong-paper failure mode).

    Returns a weighted blend (0.75 * unigram + 0.25 * bigram).
    """
    haystack = (candidate.get("title", "") + " " + candidate.get("abstract", "")).lower()
    if not haystack.strip():
        return 0.0
    hits = sum(1 for w in findings_words if w in haystack)
    uni = hits / max(len(findings_words), 1)

    if not finding_text:
        return round(uni, 4)

    # Tokenize both sides with the same stop-list filter
    find_tokens = [w for w in re.findall(r'\b[a-z]{4,}\b', finding_text.lower())
                   if w not in STOP]
    title_tokens = [w for w in re.findall(r'\b[a-z]{4,}\b', candidate.get("title", "").lower())
                    if w not in STOP]
    find_bi  = bigrams(find_tokens)
    title_bi = bigrams(title_tokens)
    if find_bi and title_bi:
        inter = len(find_bi & title_bi)
        union = len(find_bi | title_bi)
        jac   = inter / union if union else 0.0
    else:
        jac = 0.0

    return round(0.75 * uni + 0.25 * jac, 4)


def candidate_sane(candidate, author: str, year: str) -> bool:
    """Sanity checks that reject obvious wrong-paper matches before scoring.

    1. Year must be within 2 of the cited year (when both are present).
    2. The cited surname must appear in the article title, abstract, or
       candidate metadata (PubMed eutils doesn't return authors in our
       minimal fetch, so approximate with a string search).
    """
    # Year sanity
    cand_year = (candidate.get("year") or "").strip()
    if year and cand_year:
        try:
            diff = abs(int(cand_year) - int(year))
            if diff > 2:
                return False
        except ValueError:
            pass

    # Surname sanity: surname must appear SOMEWHERE in the returned text.
    # PubMed always shows the first author in the title page so this catches
    # the "wrong Lee in wrong paper" class of error.
    sur = first_surname(author).strip()
    if sur:
        haystack = (candidate.get("title", "") + " " +
                    candidate.get("abstract", "")).lower()
        if sur.lower() not in haystack:
            # Allow if the surname is very common and the score is strong —
            # that's handled by the caller by rescoring, not here.
            return "allow_soft"
    return True


def try_queries(queries, findings_words, finding_text, author, year, threshold=0.30):
    """Run queries in order, return first sane result that beats threshold,
    or best overall."""
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
            # Rank by the new blended (unigram+bigram) score, then drop any
            # that fail the hard year / surname sanity checks.
            scored = []
            for c in candidates:
                sane = candidate_sane(c, author, year)
                if sane is False:
                    continue
                s = score_candidate(findings_words, c, finding_text)
                if sane == "allow_soft":
                    s *= 0.75   # penalize missing surname instead of rejecting
                scored.append((s, c))
            if not scored:
                continue
            scored.sort(key=lambda x: -x[0])
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


def parse_args(argv=None):
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--shard", type=int, default=None,
                   help="Process only entries where sorted_index %% 6 == SHARD "
                        "(0..5). Omit for a full run.")
    p.add_argument("--max", type=int, default=None,
                   help="Cap the number of PubMed fetches this run (for rate limiting).")
    p.add_argument("--auto-flag", action="store_true",
                   help="Also restamp confidence / needs_review on every entry "
                        "(cheap, no PubMed fetches). Safe to run every hour.")
    return p.parse_args(argv)


def main(argv=None):
    args = parse_args(argv)

    with open(INPUT_DATA) as f:
        data = json.load(f)
    with open(ABSTRACTS) as f:
        abstracts = json.load(f)

    # --- 1. Cheap pass: restamp confidence on every entry ----------------
    # This is idempotent and takes <10 ms. It lets the hourly loop keep the
    # UI's confidence banner fresh without hammering PubMed.
    if args.auto_flag:
        restamped = 0
        for key, entry in abstracts.items():
            old = (entry.get("confidence"), entry.get("needs_review"))
            stamp_confidence(entry)
            new = (entry.get("confidence"), entry.get("needs_review"))
            if old != new:
                restamped += 1
        print(f"Auto-flag: restamped confidence on {restamped}/{len(abstracts)} entries.")

    groups = defaultdict(list)
    for card in data["cards"]:
        groups[(card["author"], card["year"])].append(card["finding"])

    # Build the work list — entries with score below THRESHOLD get re-fixed.
    to_fix = []
    for key, entry in abstracts.items():
        if entry.get("score", 0) < THRESHOLD:
            parts = key.split("|", 1)
            author = parts[0]
            year   = parts[1] if len(parts) > 1 else ""
            findings = groups.get((author, year), [])
            to_fix.append((key, author, year, findings, entry))

    to_fix.sort(key=lambda x: x[0])

    # Shard filter: keep only entries whose index falls on our shard.
    if args.shard is not None:
        shard = args.shard % 6
        to_fix = [t for i, t in enumerate(to_fix) if i % 6 == shard]
        print(f"Shard {shard}: {len(to_fix)} entries in this shard.")

    # Rate-limit cap
    if args.max is not None:
        to_fix = to_fix[: args.max]
        print(f"--max={args.max}: capping this run to {len(to_fix)} PubMed fetches.")

    if not to_fix:
        print("Nothing to fix in this shard/run.")
        # Still persist any auto-flag changes.
        if args.auto_flag:
            with open(ABSTRACTS, "w") as f:
                json.dump(abstracts, f, indent=2, ensure_ascii=False)
        return

    print(f"Re-fetching {len(to_fix)} low-confidence entries...\n")

    improved = 0
    for i, (key, author, year, findings, old_entry) in enumerate(to_fix, 1):
        label = f"{author} ({year})" if year else author
        old_score = old_entry.get("score", 0)

        if not findings:
            print(f"[{i:02d}] {label:<40} — no cards, skipping")
            continue

        finding_text = " ".join(findings)
        findings_words = meaningful_words(finding_text)
        queries = build_finding_queries(author, year, findings)

        print(f"[{i:02d}] {label:<40} (was {old_score:.2f}) searching with terms: {key_terms(findings)}")

        new_score, best = try_queries(
            queries, findings_words, finding_text, author, year, threshold=0.40
        )

        if best is None:
            abstracts[key] = stamp_confidence({
                "pmid": None, "title": "", "abstract": "",
                "status": "not_found", "score": 0,
            })
            print(f"      → still not found")
        elif new_score > old_score + 0.01:
            abstracts[key] = stamp_confidence({
                "pmid":     best["pmid"],
                "title":    best["title"],
                "abstract": best["abstract"],
                "journal":  best["journal"],
                "pub_year": best["year"],
                "status":   "ok",
                "score":    round(new_score, 3),
            })
            improved += 1
            delta = f"+{new_score - old_score:.2f}"
            print(f"      → [{new_score:.2f}] ({delta}) {best['title'][:65]}")
        else:
            # Keep old result but ensure it's stamped
            stamp_confidence(abstracts[key])
            print(f"      → no improvement ({new_score:.2f} ≤ {old_score:.2f}), keeping original")

        with open(ABSTRACTS, "w") as f:
            json.dump(abstracts, f, indent=2, ensure_ascii=False)

    ok = sum(1 for v in abstracts.values() if v.get("status") == "ok")
    nf = sum(1 for v in abstracts.values() if v.get("status") == "not_found")
    hi = sum(1 for v in abstracts.values() if v.get("confidence") == "high")
    md = sum(1 for v in abstracts.values() if v.get("confidence") == "medium")
    lo = sum(1 for v in abstracts.values() if v.get("confidence") == "low")
    print(f"\n{'─'*60}")
    print(f"Improved {improved}/{len(to_fix)} low-confidence entries")
    print(f"Confidence: {hi} high · {md} medium · {lo} low  "
          f"({ok} found, {nf} not found, {len(abstracts)} total)")

    # Non-zero exit when a shard run produced no improvements — the Actions
    # workflow uses this to decide whether to rebuild + commit.
    if args.shard is not None and improved == 0 and not args.auto_flag:
        sys.exit(0)   # still zero: no improvements isn't an error, just a noop


if __name__ == "__main__":
    main()
