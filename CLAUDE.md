# Paris & London 2026 — Site Maintenance Guide

## Overview
GitHub Pages static site. Repo: https://github.com/Home-SF/parislondon2026  
Trip: Paris Aug 10–17, London Aug 17–24.  
Hotels: Park Hyatt Vendôme (5 Rue de la Paix, 75002 Paris) · Nobu Hotel Portman Square (22 Portman Square, London W1H 7BG)

## Key Files
| File | Contents |
|------|----------|
| `restaurants-paris.html` | Paris restaurant list |
| `restaurants-london.html` | London restaurant list |
| `activities-paris.html` | Paris sights/activities |
| `activities-london.html` | London sights/activities |
| `restaurants-map.html` | Dining map (Leaflet.js) |
| `assets/styles.css` | Shared styles |
| `assets/restaurants-map.js` | Map JS |

## Current Card Counts (as of July 2026)
- Paris restaurants: **rest-1 through rest-75** (26 original + 49 added from KML)
- London restaurants: **rest-1 through rest-55** (50 original + 5 added from KML)
- Paris activities: **28 entries** (23 original + 5 added from KML)
- London activities: **21 entries** (20 original + 1 added from KML)

Next Paris restaurant: **rest-77**  
Next London restaurant: **rest-63**  
Next Toronto restaurant: **rest-5**

---

## Restaurant Card HTML Format

```html
<div class="rest-card not-reserved" id="rest-N">
<div class="rest-card-head">
<div class="rest-title"><span class="rest-num">N</span><h3>NAME</h3></div>
<span class="rest-status not-reserved">No reservation yet</span>
</div>
<div class="rest-addr">FULL ADDRESS<span class="rest-neighborhood">NEIGHBORHOOD</span></div>
<div class="rest-hours">HOURS</div>


<div class="rlinks">LINKS</div>
</div>
```

Note the two blank lines between `rest-hours` and `rlinks` — preserve these.

Reserved cards use `class="rest-card reserved"` and `class="rest-status reserved">Reservation confirmed</span>`, and may have additional `rest-visit` and `rest-cancel` divs.

## Activity Card HTML Format

```html
<div class="act-card">
<h3>NAME</h3>
<div class="rest-addr">ADDRESS</div>
<div class="rest-hours">HOURS</div>
<div class="act-fee">FEE</div>
<div class="act-fact"><span class="act-fact-label">LABEL</span> FACT</div>
<a href="URL" target="_blank" rel="noopener" class="act-website">Website &rarr;</a>
</div>
```

## Insertion Point

New cards are inserted immediately before this marker (present in all 4 pages):
```
</div>
</div>
<footer>
```

Use `content.replace(marker, new_html + '\n' + marker, 1)`.

---

## rlinks Convention

**Order:** Website → Menu → Reserve → Michelin → Infatuation → muted notes

```html
<a href="URL" target="_blank" rel="noopener">Website</a>
<a href="MENU_URL" target="_blank" rel="noopener">Menu</a>
<a href="RESERVE_URL" target="_blank" rel="noopener">Reserve</a>
<a class="rlink-michelin" href="MICHELIN_URL" target="_blank" rel="noopener">Michelin &middot; Bib Gourmand</a>
<a class="rlink-infatuation" href="INFATUATION_URL" target="_blank" rel="noopener">Infatuation</a>
<span class="rlink-muted">NOTE</span>
```

**Michelin suffix options:** `Michelin &middot; 1 Star`, `Michelin &middot; Bib Gourmand`, `Michelin &middot; Green Star`, or plain `Michelin`

**Menu link rules:**
- Only include if there is a **dedicated menu page** (different URL from website)
- For walk-in spots / patisseries / markets where no dedicated menu page exists, omit the Menu link
- If Website and Menu would be the same URL, use only Website

**Muted notes to include when applicable:**
- `Walk-in only — no reservations`
- `No official website — call ahead: +33 X XX XX XX XX`
- `Not Michelin-listed` (when Michelin link is absent)
- `Not reviewed by Infatuation` (when Infatuation link is absent)

---

## Dining Map Format (`restaurants-map.html`)

Each city has two parts:

### 1. `data-markers` JSON attribute
On the `<div class="map-container" id="map-CITY">` element:

```json
[{"num": 1, "name": "Unicode-escaped name", "address": "Full address, City, Country"}]
```

- Use JSON unicode escapes for non-ASCII characters (e.g. `é` for é, `ô` for ô)
- `name` is the display name shown on the map pin
- `address` is geocoded by Leaflet — use the full postal address

### 2. Map legend HTML
Follows the `map-container` div:

```html
<div class="map-legend">
  <div class="map-legend-row hotel"><span class="map-legend-num hotel">H</span>HOTEL NAME <em>(hotel)</em></div>
  <a class="map-legend-row" href="restaurants-CITY.html#rest-N"><span class="map-legend-num">N</span>Plain restaurant name</a>
  <!-- more entries... -->
</div>
```

- Legend uses **plain UTF-8 characters** (not HTML entities or JSON escapes)
- Both `data-markers` and legend must be updated together
- Entries without a confirmed street address cannot be added to the map

### Python snippet for updating map JSON:
```python
import json, re

def update_map(filepath, city_id, new_markers, new_legend_links):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Update data-markers JSON
    pattern = rf"(id=\"map-{city_id}\" data-markers=')(\[.*?\])(')"
    def replacer(m):
        existing = json.loads(m.group(2))
        existing.extend(new_markers)
        return m.group(1) + json.dumps(existing, ensure_ascii=True) + m.group(3)
    content = re.sub(pattern, replacer, content, flags=re.DOTALL)
    
    # Append legend links before closing </div> of map-legend
    # Find the legend div for this city and append before its closing </div>
    legend_close = '</div></section>'  # adjust as needed
    content = content.replace(legend_close, new_legend_links + legend_close, 1)
    
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)
```

---

## KML Cross-Reference Rules

**KML source:** `trip_with_coords.kml` (114 placemarks)

### What goes where:
| Type | Target page |
|------|-------------|
| Restaurants, cafés, bars, wine bars, jazz clubs | Restaurants page (Paris or London) |
| Bakeries, patisseries, chocolatiers, food markets | Restaurants page (as food stop) |
| Museums, galleries, churches, parks, palaces | Activities page |
| Specialty food shops (épiceries, grocery) | Restaurants page |
| Japanese grocery, specialty import | Restaurants page |

### Exclude entirely (do not add to any page):
- Cookware / kitchenware shops (e.g. E. Dehillerin, Mora)
- Pharmacies
- Fabric / textile markets
- Language schools
- Hotels
- Vintage / antique clothing shops

### Multi-location handling:
When multiple KML pins refer to the same brand, create **one card** listing all addresses. Done examples:
- The French Bastards (3 pins) → rest-57 (lists 3 addresses)
- Aux Merveilleux de Fred (2 pins) → rest-62
- Kioko (2 pins) → rest-71
- Terroirs d'Avenir (3 pins) → rest-64

### Geographic rules:
- **Giverny day-trip** food spots → Paris Restaurants page (note "Giverny (day-trip)" as neighborhood)
- **Giverny day-trip** sights → Paris Sights page (note "Day trip from Paris" as fact label)
- **Vernon** (train stop en route to Giverny) → Paris Sights page

---

## Address Conventions

### Confirmed addresses for all rest-27 through rest-75:
All formerly-uncertain addresses have been resolved (as of July 2026). See the HTML for current values. The original "Check Google Maps" placeholder text should no longer appear.

### When an address truly cannot be verified:
Use: `Check Google Maps for current address` in the `rest-addr` div, and set the neighborhood to the city name (`Paris` or `London`). These entries **cannot be added to the dining map** until an address is confirmed.

---

## Workflow for Adding New KML Entries

1. Read `trip_with_coords.kml` and extract placemark names
2. Compare against existing entries in all 4 HTML pages (grep for names)
3. Classify each missing pin (restaurant / sight / exclude)
4. Research each: confirmed address, hours, website, menu URL, Michelin listing, Infatuation review
5. Add to the appropriate HTML page using `make_rest_card()` or `make_act_card()` helper
6. Add to `restaurants-map.html`: update `data-markers` JSON **and** legend HTML
7. Commit and push

### Helper functions (from `update_site.py`):
See `update_site.py` in the outputs folder for `make_rest_card()`, `make_act_card()`, and `insert_before()`.

---

## Commit & Push

The sandbox cannot push to GitHub (HTTPS auth not available). After making changes:
```bash
cd /path/to/parislondon2026
git add -A
git commit -m "Description"
# Then tell the user to run: git push origin main
```

---

## Standing Rules

### SCHEDULING & CALENDAR

**S1 — Google Calendar sync**  
Whenever an event is added to a day page, also add it as a Google Calendar event for **lee.kok.kurbat@gmail.com** with the same name, time (local), location, duration, and notes.

**S2 — Chronological ordering**  
Always order items on day pages chronologically by time. When inserting a new event, place it in time order, not just at the end.

**S3 — Sunset time**  
Add the local sunset time to every day page.

**S4 — Public holiday annotation**  
Annotate the top of each day page with a note if there is a public holiday at that location on that date.

**S5 — Party size (parislondon2026 specific)**  
| Date/time window (local) | Party size |
|--------------------------|------------|
| Aug 14 6:00 PM Paris time → Aug 19 11:59 PM London time | **7 people** |
| All other parislondon2026 events | **3 people** |

Use the correct count in calendar events, reservation notes, and any count-dependent content.

**S6 — WhatsApp update on new events**  
Each time a new event or reservation is added, produce a WhatsApp-style plain-text summary that can be copy-pasted to notify others. Include: what was added, date/time, location, and any key details (reservation time, party size, etc.).

---

### MAPS & NAVIGATION

**M1 — Agenda route maps on day pages**  
Each day page should have a map showing the best route (by metro or on foot) for back-to-back events in that day's agenda. Add or update the map whenever events are added or reordered. Example: Day 2 in Paris → show metro route connecting successive stops.

**M2 — Hotel pin on dining maps**  
The dining/restaurant map (`restaurants-map.html`) must include a separate colored pin (distinct from restaurant pins) for the location of where we are staying. Update whenever hotel is confirmed or changes.  
Paris hotel: Park Hyatt Vendôme, 5 Rue de la Paix, 75002  
London hotel: Nobu Hotel Portman Square, 22 Portman Square, London W1H 7BG

**M3 — Metro stations for events**  
When adding a new event or reservation, automatically identify the nearest metro/tube station(s) and add them to the metro scheduling feature on the relevant day page.

---

### RESTAURANTS & DINING

**R1 — Restaurant classification**  
For every new restaurant, verify it belongs on the correct city page based on its actual location. Retrieve: confirmed address, operating hours, menu link, reservation link.

**R2 — Required rlinks**  
Every restaurant card must include (where available): Website, Menu (if distinct URL), Reserve, Michelin (with rating: 1 Star / Bib Gourmand / Green Star), Infatuation review. See rlinks section for format.

**R3 — Reservation color coding**  
Restaurants with confirmed reservations use `class="rest-card reserved"` with a distinct background. Unreserved use `class="rest-card not-reserved"`. Never mix these up.

**R4 — Meal tracker at top of dining pages**  
Each city dining page must have a tracker at the top listing every day's breakfast, lunch, and dinner with checkboxes. Check off days with a confirmed meal plan. Mark travel days. Update the tracker each time a new reservation is added.

---

### WEATHER

**W1 — Weather panel per city**  
Automatically add (or update) a weather panel for each city where an event is added. This applies to all sites and all new cities as they are added to the itinerary.

---

### SITE FEATURES & CROSS-SITE RULES

**F1 — Mobile-first design**  
Test and design all pages for mobile friendliness. Any new feature must work on small screens. When in doubt, check at 375px width.

**F2 — Feature replication across all sites**  
When adding a non-location-specific feature (UI, functionality, layout, tooling) to any one site, replicate it automatically across all other active trip sites built from this template (currently: parislondon2026, asia2026). Do not wait to be asked.

**F3 — New site CLAUDE.md bootstrap**  
Each time a new trip site is created, copy the then-current CLAUDE.md into the new repo as its starting CLAUDE.md. Update only the site-specific sections (trip dates, cities, party size, hotels). All universal rules carry forward unchanged.

**F4 — Universal rules apply to all future sites**  
All rules in this Standing Rules section that are not explicitly marked as site-specific apply to every future trip site using this template.

**F5 — Activity planned status synced to agenda**  
Whenever a sight or activity is added to a day-page agenda, mark the corresponding card on the activities page as planned by changing `class="act-card"` to `class="act-card act-planned"`. If the activity does not yet exist on the activities page, add it first, then mark it planned. Whenever an agenda item is removed, revert its card back to `class="act-card"` (no green). This keeps the activities page as a live checklist of what is actually on the itinerary.

CSS implementation (in `assets/styles.css`):
```css
.act-card.act-planned {
  background: #E7EDD8;
  border-color: #BFCE9E;
}
```

---

## Common Mistakes to Avoid

1. **Wrong addresses**: Always verify addresses via web search — do not rely on memory or training data. Several addresses were wrong in the initial KML pass (ANONA, Géosmine, Argile were all incorrect).
2. **Duplicate Menu links**: Don't add a Menu link if it's the same URL as the Website link.
3. **Forgetting the dining map**: Every new restaurant card must also be added to `restaurants-map.html` (both `data-markers` JSON and legend).
4. **HTML entities in JSON**: The `data-markers` attribute uses JSON — escape non-ASCII with `\uXXXX`. The legend HTML uses plain UTF-8.
5. **Numbering continuity**: Paris restaurants are numbered across both the original entries AND the new ones. Never reuse a rest-N id.
6. **rlinks order**: Always Website → Menu → Reserve → Michelin → Infatuation → muted.
