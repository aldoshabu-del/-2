
import json
import math

def calculate_centroid(coords):
    x_sum = 0
    y_sum = 0
    for p in coords:
        x_sum += p[0]
        y_sum += p[1]
    return [x_sum / len(coords), y_sum / len(coords)]

def analyze_plots():
    with open('plotsData.json', 'r', encoding='utf-8') as f:
        plots = json.load(f)

    # Filter standard plots (e.g. not park, not admin, usually around 1200 area)
    izhs_plots = [p for p in plots if p.get('areaValue') in [1200, "1200"] or "ИЖС" in p.get('name', '') or "Коттедж" in p.get('purpose', '')]
    
    print(f"Total plots: {len(plots)}")
    print(f"Candidate regular plots: {len(izhs_plots)}")

    # Group by rough Y coordinate to find rows
    # Assuming lat is Y, lon is X. Coords in json are [lon, lat] or [lat, lon]?
    # Based on editor.js: [plot.coords.map(([lon, lat]) => [lat, lon])] -> Yandex expects [lat, lon].
    # Json file coords look like [44.99..., 43.17...] which is [lon, lat] likely for North Caucasus.
    
    rows = {}
    for p in izhs_plots:
        coords = p['coords']
        if not coords: continue
        
        # Calculate centroid
        # json coords are [x, y]
        xs = [c[0] for c in coords]
        ys = [c[1] for c in coords]
        
        avg_y = sum(ys) / len(ys)
        
        # simple clustering
        found_row = False
        for row_y in rows.keys():
            if abs(row_y - avg_y) < 0.0003: # approximate tolerance
                rows[row_y].append(p)
                found_row = True
                break
        
        if not found_row:
            rows[avg_y] = [p]

    print(f"Found {len(rows)} rough rows.")
    for y in sorted(rows.keys()):
        print(f"Row at Y={y:.5f}: {len(rows[y])} plots. IDs: {[p['id'] for p in rows[y]]}")

if __name__ == "__main__":
    analyze_plots()
