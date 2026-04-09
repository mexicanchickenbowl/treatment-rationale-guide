#!/usr/bin/env python3
"""
Final cleanup pass:
1. Reject entries whose abstracts are clearly wrong-field (oncology, virology, etc.)
2. Do highly targeted re-searches for known hard cases using full finding text as query
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

# Terms that must appear in an abstract for it to be a valid dental/endo result
DENTAL_TERMS = {
    "dental", "tooth", "teeth", "pulp", "pulpal", "endodon", "periapical",
    "root canal", "caries", "alveolar", "periodontal", "dentin", "enamel",
    "mandibular", "maxillary", "anesthesia", "anesthetic", "irrigat",
    "obturation", "cement", "implant", "extraction", "bone", "oral",
    "jaw", "molar", "incisor", "premolar",
}

def is_dental(text):
    t = text.lower()
    return any(term in t for term in DENTAL_TERMS)


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

def meaningful_words(text):
    return {w for w in re.findall(r'\b[a-z]{4,}\b', text.lower()) if w not in STOP}

def score_candidate(findings_words, candidate):
    haystack = (candidate["title"] + " " + candidate["abstract"]).lower()
    if not haystack.strip():
        return 0.0
    hits = sum(1 for w in findings_words if w in haystack)
    return hits / max(len(findings_words), 1)


def first_surname(author):
    a = re.sub(r'\s+et\s+al\.?', '', author, flags=re.IGNORECASE)
    a = re.sub(r'\s+(and|&)\s+.*', '', a, flags=re.IGNORECASE)
    return a.strip()


# ---------------------------------------------------------------------------
# Targeted manual queries for hard cases (based on specific clinical knowledge)
# These use precise clinical terminology to find the exact paper
# ---------------------------------------------------------------------------
MANUAL_QUERIES = {
    "AAE|2017": [
        'rubber dam endodontic "standard of care"',
        "American Association Endodontists rubber dam isolation position statement",
        "AAE rubber dam endodontic",
    ],
    "Bender|": [
        "Bender[Author] AND electric pulp test electrode placement incisal",
        "Bender[Author] AND pulp testing electrode cusp incisal",
        "Bender[Author] AND pulp test[TiAb] AND electrode[TiAb]",
    ],
    "Bender and Rossman|": [
        "Bender[Author] AND Rossman[Author] AND intentional replantation[TiAb]",
        "Bender[Author] AND Rossman[Author] AND replantation[TiAb]",
        "intentional replantation 81 success[TiAb] AND Bender[Author]",
    ],
    "Bender and Seltzer|1961": [
        "Bender[Author] AND Seltzer[Author] AND 1961[PDAT] AND radiograph*[TiAb]",
        "Bender[Author] AND Seltzer[Author] AND periapical lesion radiograph[TiAb]",
        "Bender[Author] AND Seltzer[Author] AND bone lesion[TiAb]",
    ],
    "Bhaskar and Rappaport|": [
        "Bhaskar[Author] AND Rappaport[Author] AND trauma[TiAb] AND pulp[TiAb]",
        "Bhaskar[Author] AND Rappaport[Author] AND traumatized teeth[TiAb]",
        "Bhaskar[Author] AND vitality pulp trauma nonresponsive[TiAb]",
    ],
    "Dummer|1984": [
        "Dummer[Author] AND 1984[PDAT] AND apical constriction[TiAb]",
        "Dummer[Author] AND 1984[PDAT] AND apical foramen[TiAb]",
        "Dummer[Author] AND apical constriction 0.2 mm[TiAb]",
        "Dummer[Author] AND 1984[PDAT] AND root apex[TiAb]",
    ],
    "Fan|2004": [
        "Fan[Author] AND 2004[PDAT] AND vertical compaction[TiAb]",
        "Fan[Author] AND 2004[PDAT] AND lateral condensation[TiAb]",
        "Fan[Author] AND 2004[PDAT] AND obturation technique[TiAb]",
        "Fan[Author] AND 2004[PDAT] AND oval canal[TiAb]",
    ],
    "Fernandes|2003": [
        "Fernandes[Author] AND 2003[PDAT] AND fiber post[TiAb]",
        "Fernandes[Author] AND 2003[PDAT] AND post selection[TiAb]",
        "Fernandes[Author] AND 2003[PDAT] AND metal post[TiAb] AND fracture[TiAb]",
    ],
    "Fouad and Burleson|2003": [
        "Fouad[Author] AND Burleson[Author] AND 2003[PDAT] AND diabetes[TiAb]",
        "Fouad[Author] AND Burleson[Author] AND diabetes[TiAb] AND outcome[TiAb]",
        "Fouad[Author] AND 2003[PDAT] AND diabetes mellitus[TiAb] AND endodontic[TiAb]",
    ],
    "Fowler|": [
        "Fowler[Author] AND acetaminophen hydrocodone cold testing[TiAb]",
        "Fowler[Author] AND irreversible pulpitis AND cold test AND premedication[TiAb]",
        "Fowler[Author] AND cold pulp testing AND narcotic[TiAb]",
        "Fowler[Author] AND pulp test AND opioid[TiAb]",
        "Fowler[Author] AND symptomatic irreversible pulpitis AND analgesic[TiAb]",
    ],
    "Grossman|1976": [
        "Grossman[Author] AND 1976[PDAT] AND sealer[TiAb]",
        "Grossman[Author] AND 1976[PDAT] AND endodontic cement[TiAb]",
        "Grossman[Author] AND sealer biocompatible[TiAb]",
    ],
    "Gupta|": [
        "Gupta[Author] AND endo-perio lesion[TiAb]",
        "Gupta[Author] AND endodontic periodontal combined concurrent[TiAb]",
        "Gupta[Author] AND perio endo combined treatment[TiAb]",
    ],
    "Haapasalo|2010": [
        "Haapasalo[Author] AND 2010[PDAT] AND smear layer[TiAb]",
        "Haapasalo[Author] AND 2010[PDAT] AND dentinal tubule[TiAb]",
        "Haapasalo[Author] AND 2010[PDAT] AND irrigant[TiAb] AND bacteria[TiAb]",
        "Haapasalo[Author] AND 2010[PDAT] AND biofilm[TiAb] AND root canal[TiAb]",
    ],
    "Hahn and Liewehr|2007": [
        "Hahn[Author] AND Liewehr[Author] AND 2007[PDAT] AND pulp[TiAb]",
        "Hahn[Author] AND Liewehr[Author] AND innate immune[TiAb] AND pulp[TiAb]",
        "Hahn[Author] AND Liewehr[Author] AND dental pulp immune[TiAb]",
    ],
    "Harrington|": [
        "Harrington[Author] AND endo-perio[TiAb]",
        "Harrington[Author] AND periodontal pocket endodontic[TiAb]",
        "Harrington[Author] AND primary endodontic lesion[TiAb]",
    ],
    "Kuttler|1955": [
        "Kuttler[Author] AND 1955[PDAT]",
        "Kuttler[Author] AND apical foramen[TiAb]",
        "Kuttler[Author] AND root apex anatomy[TiAb]",
        "Kuttler microscopic investigation root apexes",
    ],
    "Langeland|": [
        "Langeland[Author] AND periodontal endodontic[TiAb]",
        "Langeland[Author] AND perio pulp involvement[TiAb]",
    ],
    "Lawley|2004": [
        "Lawley[Author] AND 2004[PDAT] AND orifice barrier[TiAb]",
        "Lawley[Author] AND 2004[PDAT] AND MTA thickness[TiAb]",
        "Lawley[Author] AND 2004[PDAT] AND coronal barrier[TiAb]",
    ],
    "Miller|": [
        "Miller[Author] AND refrigerant spray[TiAb] AND pulp test[TiAb]",
        "Miller[Author] AND cold test[TiAb] AND crown[TiAb]",
        "Miller[Author] AND pulp vitality testing[TiAb] AND metal crown[TiAb]",
    ],
    "Murphy|": [
        "Murphy[Author] AND periapical lesion healing[TiAb]",
        "Murphy[Author] AND periapical lesion size healing time[TiAb]",
        "Murphy[Author] AND radiographic healing periapical[TiAb]",
    ],
    "Nattress and Martin|1994": [
        "Nattress[Author] AND Martin[Author] AND 1994[PDAT] AND fracture[TiAb]",
        "Nattress[Author] AND Martin[Author] AND trauma[TiAb] AND tooth fracture[TiAb]",
        "Nattress[Author] AND traumatized tooth fracture susceptibility[TiAb]",
    ],
    "Ng|2008": [
        "Ng[Author] AND 2008[PDAT] AND overfill[TiAb] AND outcome[TiAb]",
        "Ng[Author] AND 2008[PDAT] AND obturation[TiAb] AND healing[TiAb]",
        "Ng[Author] AND 2008[PDAT] AND root canal treatment outcome[TiAb]",
    ],
    "Ng|2011": [
        "Ng[Author] AND 2011[PDAT] AND obturation[TiAb] AND apex[TiAb]",
        "Ng[Author] AND 2011[PDAT] AND meta-analysis[TiAb] AND endodontic[TiAb]",
        "Ng[Author] AND 2011[PDAT] AND root canal[TiAb] AND outcome[TiAb]",
    ],
    "Owatz|": [
        "Owatz[Author] AND mechanical allodynia[TiAb] AND endodontic[TiAb]",
        "Owatz[Author] AND percussion tenderness[TiAb]",
        "Owatz[Author] AND allodynia[TiAb] AND pulp[TiAb]",
    ],
    "Pagin|": [
        "Pagin[Author] AND maxillary sinus[TiAb] AND molar[TiAb]",
        "Pagin[Author] AND sinus perforation root[TiAb]",
        "maxillary sinus perforation molar root Pagin[Author]",
    ],
    "Parirokh and Torabinejad|2010": [
        "Parirokh[Author] AND Torabinejad[Author] AND 2010[PDAT] AND MTA[TiAb]",
        "Parirokh[Author] AND Torabinejad[Author] AND mineral trioxide aggregate review[TiAb]",
        "Parirokh[Author] AND MTA review[TiAb] AND clinical[TiAb]",
    ],
    "Peng|2007": [
        "Peng[Author] AND 2007[PDAT] AND sealer[TiAb] AND outcome[TiAb]",
        "Peng[Author] AND 2007[PDAT] AND periapical healing[TiAb] AND sealer[TiAb]",
        "Peng[Author] AND 2007[PDAT] AND root canal filling[TiAb] AND outcome[TiAb]",
    ],
    "Peters|2004": [
        "Peters[Author] AND 2004[PDAT] AND canal transportation[TiAb]",
        "Peters[Author] AND 2004[PDAT] AND instrument[TiAb] AND canal shape[TiAb]",
        "Peters[Author] AND 2004[PDAT] AND micro-CT[TiAb]",
    ],
    "Read|": [
        "Read[Author] AND ibuprofen[TiAb] AND pulp test[TiAb]",
        "Read[Author] AND ibuprofen[TiAb] AND cold test[TiAb] AND percussion[TiAb]",
        "Read[Author] AND premedication[TiAb] AND pulp testing[TiAb]",
    ],
    "Ruddle|2004": [
        "Ruddle[Author] AND 2004[PDAT] AND post removal[TiAb]",
        "Ruddle[Author] AND 2004[PDAT] AND retreatment[TiAb]",
        "Ruddle[Author] AND 2004[PDAT] AND nonsurgical retreatment[TiAb]",
    ],
    "Salehrabi and Rotstein|": [
        "Salehrabi[Author] AND Rotstein[Author] AND survival[TiAb] AND endodontic[TiAb]",
        "Salehrabi[Author] AND Rotstein[Author] AND epidemiologic[TiAb]",
        "Salehrabi[Author] AND 97 percent[TiAb] AND endodontic[TiAb]",
    ],
    "Sedley|2005": [
        "Sedley[Author] AND 2005[PDAT] AND irrigation[TiAb] AND needle[TiAb]",
        "Sedley[Author] AND 2005[PDAT] AND irrigant delivery[TiAb]",
        "Sedley[Author] AND 2005[PDAT] AND syringe irrigation[TiAb]",
    ],
    "Seltzer|1965": [
        "Seltzer[Author] AND 1965[PDAT] AND percussion[TiAb]",
        "Seltzer[Author] AND 1965[PDAT] AND endodontic[TiAb]",
        "Seltzer[Author] AND 1965[PDAT] AND periodontal[TiAb]",
    ],
    "Shanbhag|": [
        "Shanbhag[Author] AND maxillary sinus[TiAb] AND apical periodontitis[TiAb]",
        "Shanbhag[Author] AND sinus mucositis[TiAb]",
        "sinus mucositis apical periodontitis[TiAb] Shanbhag[Author]",
    ],
    "Trowbridge|": [
        "Trowbridge[Author] AND hydrodynamic[TiAb] AND pulp[TiAb]",
        "Trowbridge[Author] AND cold testing mechanism[TiAb]",
        "Trowbridge[Author] AND dentinal tubule fluid[TiAb] AND cold[TiAb]",
        "Trowbridge[Author] AND pulp pain mechanism[TiAb]",
    ],
    "Walton|1996": [
        "Walton[Author] AND 1996[PDAT] AND penicillin[TiAb] AND abscess[TiAb]",
        "Fouad[Author] AND Rivera[Author] AND Walton[Author] AND penicillin[TiAb]",
        "Walton[Author] AND 1996[PDAT] AND antibiotics[TiAb] AND endodontic[TiAb]",
    ],
    "Wang|": [
        "Wang[Author] AND EMD[TiAb] AND replantation[TiAb]",
        "Wang[Author] AND enamel matrix derivative[TiAb] AND replantation[TiAb]",
        "Wang[Author] AND EMD[TiAb] AND periodontal regeneration[TiAb] AND replantation[TiAb]",
    ],
}


def main():
    with open(INPUT_DATA) as f:
        data = json.load(f)
    with open(ABSTRACTS) as f:
        abstracts = json.load(f)

    groups = defaultdict(list)
    for card in data["cards"]:
        groups[(card["author"], card["year"])].append(card["finding"])

    changed = 0

    # Step 1: Reject clearly wrong-field entries
    print("=== STEP 1: Rejecting wrong-field matches ===")
    for key, entry in abstracts.items():
        if entry.get("status") != "ok":
            continue
        title_abs = (entry.get("title", "") + " " + entry.get("abstract", ""))
        if not is_dental(title_abs):
            print(f"  REJECT (wrong field): {key} → {entry['title'][:60]}")
            abstracts[key] = {"pmid": None, "title": "", "abstract": "",
                              "status": "not_found", "score": 0,
                              "rejected_title": entry["title"]}
            changed += 1

    # Step 2: Targeted re-searches for known hard cases
    print(f"\n=== STEP 2: Targeted searches for {len(MANUAL_QUERIES)} hard cases ===")
    for key, queries in MANUAL_QUERIES.items():
        parts = key.split("|", 1)
        author = parts[0]
        year   = parts[1] if len(parts) > 1 else ""
        findings = groups.get((author, year), [])
        findings_words = meaningful_words(" ".join(findings))
        current = abstracts.get(key, {})
        current_score = current.get("score", 0)

        label = f"{author} ({year})" if year else author
        print(f"\n  {label} (current score: {current_score:.2f})")

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
                for c in candidates:
                    if not is_dental(c["title"] + " " + c["abstract"]):
                        continue
                    score = score_candidate(findings_words, c)
                    if score > best_score:
                        best_score, best_result = score, c
                if best_score >= 0.40:
                    break
            except Exception as e:
                print(f"    !! {e}")
                time.sleep(1)

        if best_result and best_score > current_score + 0.02:
            abstracts[key] = {
                "pmid":     best_result["pmid"],
                "title":    best_result["title"],
                "abstract": best_result["abstract"],
                "journal":  best_result["journal"],
                "pub_year": best_result["year"],
                "status":   "ok",
                "score":    round(best_score, 3),
            }
            print(f"    → [{best_score:.2f}] {best_result['title'][:65]}")
            changed += 1
        elif best_result:
            print(f"    → [{best_score:.2f}] no improvement over {current_score:.2f}: {best_result['title'][:50]}")
        else:
            print(f"    → still not found in dental literature")
            if current.get("status") == "ok" and not is_dental(
                current.get("title","") + " " + current.get("abstract","")
            ):
                abstracts[key] = {"pmid": None, "title": "", "abstract": "",
                                  "status": "not_found", "score": 0}

    with open(ABSTRACTS, "w") as f:
        json.dump(abstracts, f, indent=2, ensure_ascii=False)

    ok = sum(1 for v in abstracts.values() if v.get("status") == "ok")
    nf = sum(1 for v in abstracts.values() if v.get("status") == "not_found")
    print(f"\n{'─'*60}")
    print(f"Changes made: {changed}")
    print(f"Final: {ok} found, {nf} not found out of {len(abstracts)} total")

    # Print summary of scores
    print("\nFinal confidence summary:")
    items = sorted(abstracts.items(), key=lambda x: x[1].get("score", 0))
    for k, v in items:
        score = v.get("score", 0)
        title = v.get("title", "NOT FOUND")[:60]
        status = v.get("status", "?")
        mark = "✓" if score >= 0.40 else ("~" if score >= 0.20 else "✗")
        print(f"  {mark} {score:.2f}  {k:<35}  {title}")


if __name__ == "__main__":
    main()
