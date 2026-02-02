
import json
import math
import os

def get_meters_per_degree(lat):
    lat_rad = math.radians(lat)
    m_per_lat = 111132.954 - 559.822 * math.cos(2 * lat_rad) + 1.175 * math.cos(4 * lat_rad)
    m_per_lon = 111132.954 * math.cos(lat_rad)
    return m_per_lat, m_per_lon

def align_plots():
    path = 'plotsData.json'
    with open(path, 'r', encoding='utf-8') as f:
        plots = json.load(f)

    # Constants for 1200 sqm
    # Let's target roughly 30m x 40m or similar.
    # Current obs: Height ~ 44m, Width ~ 27m.
    # Let's standardise to: Height = 40m, Width = 30m -> 1200m2.
    
    # We need to detect reference coordinates.
    # We will iterate through all plots, exclude special ones.
    
    # Heuristics for "special":
    # - "Муниципальный" status
    # - "Парк", "Спорт", "Административное", "МКД", "Детский сад" in Name or Purpose
    # - Area > 1500 or < 800 (unless explicit "12 соток")
    
    standard_plots = []
    
    for p in plots:
        is_special = False
        name = p.get('name', '').lower()
        purpose = p.get('purpose', '').lower()
        status = p.get('status', '').lower()
        
        if "парк" in name or "парк" in purpose: is_special = True
        if "администрат" in name or "администрат" in purpose: is_special = True
        if "сад" in name: is_special = True
        if "фюк" in name or "фюк" in purpose: is_special = True # Typo? ФОК
        if "фок" in name or "фок" in purpose: is_special = True
        if "мкд" in name or "многоквартир" in purpose: is_special = True
        if "спорт" in name or "спорт" in purpose: is_special = True
        
        # Check area value if available
        val = p.get('areaValue')
        if val and (val > 2000 or val < 600):
            is_special = True
            
        if not is_special:
            standard_plots.append(p)

    print(f"Aligning {len(standard_plots)} standard plots out of {len(plots)} total.")

    # Calculate scale factors
    # Use first plot to get standard lat
    ref_lat = 43.174
    m_lat, m_lon = get_meters_per_degree(ref_lat)
    
    # Target dimensions
    target_area = 1200
    # Let's derive height from average of current Standard plots to minimize disruption
    total_h = 0
    count = 0
    for p in standard_plots:
        coords = p['coords']
        if len(coords) < 3: continue
        ys = [c[1] for c in coords]
        h = max(ys) - min(ys)
        total_h += h
        count += 1
    
    avg_h_deg = total_h / count if count > 0 else 0.0004
    
    # Round to nice number
    target_h_m = avg_h_deg * m_lat
    # Snap to nearest 5m? current ~44m. Let's try 40m height, 30m width = 1200.
    target_h_m = 40
    target_w_m = 30
    
    h_deg = target_h_m / m_lat
    w_deg = target_w_m / m_lon
    
    # Gap between plots (e.g. 2 meters?)
    gap_m = 0 # Borders touching as per request "aligned... equal rectangles"
    gap_deg = gap_m / m_lon

    # Cluster into rows
    rows = {}
    for p in standard_plots:
        coords = p['coords']
        if not coords: continue
        ys = [c[1] for c in coords]
        cy = sum(ys) / len(ys)
        
        found = False
        for ry in rows:
            if abs(ry - cy) < 0.00025: # ~25m vertical tolerance
                rows[ry].append(p)
                found = True
                break
        if not found:
            rows[cy] = [p]
            
    print(f"Found {len(rows)} rows.")
    
    # Process each row
    sorted_row_keys = sorted(rows.keys())
    
    for ry in sorted_row_keys:
        row_plots = rows[ry]
        # Sort by X (Longitude)
        row_plots.sort(key=lambda p: p['coords'][0][0])
        
        # Define Row Baseline (Y)
        # Use simple average of centers, or max?
        # Let's use the average center Y of the row as the center of new rects
        avg_cy = sum([sum([c[1] for c in p['coords']])/len(p['coords']) for p in row_plots]) / len(row_plots)
        
        top_y = avg_cy + h_deg / 2
        bottom_y = avg_cy - h_deg / 2
        
        # Start X from the first plot's approx left edge
        if not row_plots[0]['coords']: continue
        
        # existing left edge
        start_x = min([c[0] for c in row_plots[0]['coords']])
        
        current_x = start_x
        
        for p in row_plots:
            # Create new rectangle coords [lon, lat]
            # ymaps order? No, json is [lon, lat] (44.9..., 43.1...)
            # JSON file: 
            #   [44.990..., 43.174...]
            #   [44.990..., 43.174...]
            # WAIT. 44.99 is Longitude (East), 43.17 is Latitude (North) for Caucasus.
            # So [x, y].
            
            # P1: Top-Left
            p1 = [current_x, top_y]
            # P2: Bottom-Left
            p2 = [current_x, bottom_y]
            # P3: Bottom-Right
            p3 = [current_x + w_deg, bottom_y]
            # P4: Top-Right
            p4 = [current_x + w_deg, top_y]
            # P5: Close loop
            p5 = [current_x, top_y]
            
            new_coords = [p1, p2, p3, p4, p5]
            p['coords'] = new_coords
            
            # Update Area text just in case
            p['area'] = "12 соток"
            p['areaValue'] = 1200
            
            # Advance X
            current_x += w_deg + gap_deg

    # Write back
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(plots, f, ensure_ascii=False, indent=2)
    
    print("Optimization complete.")

if __name__ == "__main__":
    align_plots()
