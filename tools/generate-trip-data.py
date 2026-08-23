#!/usr/bin/env python3
"""
generate-trip-data.py
Parses parislondon2026 static HTML pages → structured trip-data.json
Run from the repo root: python3 tools/generate-trip-data.py
"""

import json
import re
import sys
from datetime import datetime
from pathlib import Path

try:
    from bs4 import BeautifulSoup
except ImportError:
    print("Install: pip install beautifulsoup4 lxml", file=sys.stderr)
    sys.exit(1)

TRIP_ID = "paris-london-2026"

MONTH_MAP = {
    'Jan': '01', 'Feb': '02', 'Mar': '03', 'Apr': '04',
    'May': '05', 'Jun': '06', 'Jul': '07', 'Aug': '08',
    'Sep': '09', 'Oct': '10', 'Nov': '11', 'Dec': '12'
}

# ─── helpers ────────────────────────────────────────────────────────────────────────────────────

def txt(el):
    """Get clean text from a BeautifulSoup element."""
    if el is None:
        return ""
    return el.get_text(separator=" ").strip()


def parse_reservation(visit_text):
    """
    Parse rest-visit text into structured reservation fields.
    Examples:
      "Dinner planned — Aug 11, 7:30 PM (party of 3)"
      "Lunch planned — Aug 13, 1:30 PM, 1 hour · Reservation code a9FUab"
      "Lunch — Aug 12, 1:00 PM, 90 minutes"
    """
    if not visit_text:
        return {}

    result = {}

    m = re.match(r'^(Breakfast|Brunch|Lunch|Dinner)', visit_text, re.IGNORECASE)
    if m:
        result["mealType"] = m.group(1).lower()

    m = re.search(r'(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2})', visit_text)
    if m:
        month = MONTH_MAP[m.group(1)]
        day = m.group(2).zfill(2)
        result["reservationDate"] = f"2026-{month}-{day}"

    m = re.search(r'(\d{1,2}:\d{2}\s*(?:AM|PM))', visit_text, re.IGNORECASE)
    if m:
        result["reservationTime"] = m.group(1).strip()

    m = re.search(r'party of (\d+)', visit_text, re.IGNORECASE)
    if m:
        result["reservationPartySize"] = int(m.group(1))

    m = re.search(r'(\d+)\s+hours?', visit_text, re.IGNORECASE)
    if m:
        result["reservationDurationMin"] = int(m.group(1)) * 60
    else:
        m = re.search(r'(\d+)\s+minutes?', visit_text, re.IGNORECASE)
        if m:
            result["reservationDurationMin"] = int(m.group(1))

    m = re.search(r'[Rr]eservation code\s+(\S+)', visit_text)
    if m:
        result["reservationCode"] = m.group(1)

    return result


def extract_links(rlinks_div):
    """Extract named links and muted notes from .rlinks div."""
    links = {}
    muted = []

    if not rlinks_div:
        return links, muted

    for el in rlinks_div.children:
        if not hasattr(el, 'name') or el.name is None:
            continue
        if el.name == 'a':
            href = el.get('href', '')
            classes = el.get('class', [])
            label = txt(el).rstrip(' →')

            if 'rlink-michelin' in classes:
                links['michelin'] = href
            elif 'rlink-infatuation' in classes:
                links['infatuation'] = href
            else:
                label_lower = label.lower()
                if 'website' in label_lower:
                    links['website'] = href
                elif 'menu' in label_lower:
                    links['menu'] = href
                elif 'reserve' in label_lower or 'reservation' in label_lower:
                    links['reserve'] = href
                elif 'instagram' in label_lower:
                    links['instagram'] = href
                elif label_lower:
                    key = re.sub(r'[^a-z0-9]', '_', label_lower)[:20].strip('_')
                    if key:
                        links[key] = href
        elif el.name == 'span' and 'rlink-muted' in el.get('class', []):
            t = txt(el)
            if t:
                muted.append(t)

    return links, muted


# ─── restaurant parser ───────────────────────────────────────────────────────────────────────────────────

def parse_restaurants(html_content, city):
    soup = BeautifulSoup(html_content, 'lxml')
    restaurants = []
    order = 0
    current_group = None

    rest_list = soup.find('div', class_=re.compile(r'\brest-list\b'))
    if not rest_list:
        print(f"  WARNING: no .rest-list found for {city}", file=sys.stderr)
        return restaurants

    for el in rest_list.children:
        if not hasattr(el, 'name') or not el.name:
            continue

        el_classes = el.get('class', [])

        if 'arr-header' in el_classes:
            h2 = el.find('h2')
            if h2:
                current_group = txt(h2)
            continue

        if 'rest-card' not in el_classes:
            continue

        order += 1
        is_reserved = 'reserved' in el_classes and 'not-reserved' not in el_classes
        is_cancelled = 'rest-cancelled' in el_classes

        num_span = el.find('span', class_='rest-num')
        raw_id = el.get('id', '').replace('rest-', '')
        try:
            num = int(txt(num_span)) if num_span else int(raw_id)
        except ValueError:
            num = order

        h3 = el.find('h3')
        name = txt(h3)

        addr_div = el.find('div', class_='rest-addr')
        neighborhood = ""
        address = ""
        if addr_div:
            nb_span = addr_div.find('span', class_='rest-neighborhood')
            if nb_span:
                neighborhood = txt(nb_span)
                nb_span.extract()
            address = txt(addr_div)

        hours_div = el.find('div', class_='rest-hours')
        hours = txt(hours_div)

        visit_div = el.find('div', class_='rest-visit')
        visit_text = txt(visit_div)
        reservation_data = parse_reservation(visit_text) if visit_text else {}

        cancel_div = el.find('div', class_='rest-cancel')
        cancel_policy = txt(cancel_div)

        rlinks_div = el.find('div', class_='rlinks')
        links, muted = extract_links(rlinks_div)

        record = {
            "id": f"{city}-{num:03d}",
            "num": num,
            "city": city,
            "name": name,
            "address": address,
            "neighborhood": neighborhood,
            "neighborhoodGroup": current_group or "",
            "hours": hours,
            "reserved": is_reserved,
            "cancelled": is_cancelled,
            "visitNote": visit_text,
            "cancelPolicy": cancel_policy,
            "links": links,
            "muted": muted,
            "coords": None,
            "visited": False,
            "order": order,
        }

        if reservation_data:
            record.update(reservation_data)

        restaurants.append(record)

    return restaurants


# ─── activity parser ─────────────────────────────────────────────────────────────────────────────────────

def parse_activities(html_content, city):
    soup = BeautifulSoup(html_content, 'lxml')
    activities = []
    order = 0

    act_list = soup.find('div', class_=re.compile(r'\bact-list\b'))
    if not act_list:
        print(f"  WARNING: no .act-list found for {city}", file=sys.stderr)
        return activities

    for el in act_list.children:
        if not hasattr(el, 'name') or not el.name:
            continue
        el_classes = el.get('class', [])
        if 'act-card' not in el_classes:
            continue

        order += 1
        is_planned = 'act-planned' in el_classes

        h3 = el.find('h3')
        name = txt(h3)

        addr_div = el.find('div', class_='rest-addr')
        address = txt(addr_div)

        hours_div = el.find('div', class_='rest-hours')
        hours = txt(hours_div)

        fee_div = el.find('div', class_='act-fee')
        fee = txt(fee_div)

        facts = []
        for fact_div in el.find_all('div', class_='act-fact'):
            label_span = fact_div.find('span', class_='act-fact-label')
            label = txt(label_span) if label_span else ""
            if label_span:
                label_span.extract()
            fact_text = txt(fact_div)
            is_known = 'act-known' in fact_div.get('class', [])
            facts.append({"label": label, "text": fact_text, "isKnown": is_known})

        website_link = el.find('a', class_='act-website')
        website = website_link.get('href', '') if website_link else ""

        slug = re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-')

        activities.append({
            "id": f"{city}-act-{order:03d}",
            "slug": slug,
            "city": city,
            "name": name,
            "address": address,
            "hours": hours,
            "fee": fee,
            "website": website,
            "facts": facts,
            "planned": is_planned,
            "coords": None,
            "order": order,
        })

    return activities


# ─── main ───────────────────────────────────────────────────────────────────────────────────────

def main():
    # Script lives in tools/ but reads HTML from repo root
    base = Path(__file__).parent.parent

    rest_files = {
        "paris":   base / "restaurants-paris.html",
        "london":  base / "restaurants-london.html",
        "toronto": base / "restaurants-toronto.html",
    }
    act_files = {
        "paris":  base / "activities-paris.html",
        "london": base / "activities-london.html",
    }

    itinerary_path = base / "itinerary-feed.json"
    itinerary_data = {}
    if itinerary_path.exists():
        with open(itinerary_path, encoding='utf-8') as f:
            itinerary_data = json.load(f)
    else:
        print("WARNING: itinerary-feed.json not found", file=sys.stderr)

    all_restaurants = []
    for city, path in rest_files.items():
        if not path.exists():
            print(f"WARNING: {path.name} not found — skipping", file=sys.stderr)
            continue
        print(f"Parsing {path.name} ...", file=sys.stderr)
        with open(path, encoding='utf-8') as f:
            html = f.read()
        rests = parse_restaurants(html, city)
        reserved_count = sum(1 for r in rests if r['reserved'])
        print(f"  → {len(rests)} restaurants ({reserved_count} reserved)", file=sys.stderr)
        all_restaurants.extend(rests)

    all_activities = []
    for city, path in act_files.items():
        if not path.exists():
            print(f"WARNING: {path.name} not found — skipping", file=sys.stderr)
            continue
        print(f"Parsing {path.name} ...", file=sys.stderr)
        with open(path, encoding='utf-8') as f:
            html = f.read()
        acts = parse_activities(html, city)
        planned_count = sum(1 for a in acts if a['planned'])
        print(f"  → {len(acts)} activities ({planned_count} planned)", file=sys.stderr)
        all_activities.extend(acts)

    trip_data = {
        "tripId": TRIP_ID,
        "generatedAt": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
        "tripMeta": {
            "title": itinerary_data.get("trip_title", ""),
            "year": itinerary_data.get("trip_year", ""),
            "siteUrl": itinerary_data.get("site_url", ""),
        },
        "days": itinerary_data.get("days", []),
        "restaurants": all_restaurants,
        "activities": all_activities,
    }

    out_path = base / "trip-data.json"
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(trip_data, f, ensure_ascii=False, indent=2)

    n_days = len(trip_data["days"])
    n_rest = len(all_restaurants)
    n_rest_res = sum(1 for r in all_restaurants if r['reserved'])
    n_act = len(all_activities)
    n_act_pl = sum(1 for a in all_activities if a['planned'])

    print(f"\n✓ {out_path}", file=sys.stderr)
    print(f"  {n_days} days  |  {n_rest} restaurants ({n_rest_res} reserved)  |  {n_act} activities ({n_act_pl} planned)", file=sys.stderr)


if __name__ == "__main__":
    main()
