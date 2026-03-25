# Floor Plan & Space Management — Spec v1.0

## Scope

This spec covers how the application represents, imports, displays, and links to physical spaces
(studios, shops, rooms) defined in the facility's AutoCAD drawings. It is a v1.0 feature.

---

## Definitions

**Space** — any physically bounded area tracked in the system: studio unit, shop, meeting room,
common area. Every Space node in the Resource tree has an optional floor plan reference.

**Studio** — a private space leased by a member or group of members. Defined as N × 50 SF base
units; sizes offered are 50, 100, and 200 SF. ~250 units exist across two buildings.

**Base unit** — the smallest independently assignable studio area (50 SF). Larger studios are
always contiguous groups of base units assigned together. Whether a group can be subdivided is
a staff-managed configuration flag, not auto-derived from the DXF.

---

## DXF Convention

### Version

Export as **R2000**. R12 is avoided because it lacks `LWPOLYLINE`; closed room boundaries in
R12 export as the older `POLYLINE`/`VERTEX` format which is harder to parse reliably.

### Coordinate system

Drawings are **building-aligned**: the drawing is rotated so the building's primary walls run
along the X and Y axes. True north is indicated by an annotation arrow only — it is not the
basis for the coordinate system.

Convention: apply the **smallest rotation** that brings the drawing to north-up (i.e. if the
building's long axis is 15° east of north, rotate the drawing −15°, not +345°).

The import pipeline derives the coordinate origin automatically from the bounding box of
layer 0. No specific world-coordinate origin is required in the drawing.

### Layer vocabulary

Three layers carry semantic meaning; all other layers are imported as background geometry.

| Layer   | Contents                                      | Identity carrier       |
|---------|-----------------------------------------------|------------------------|
| `0`     | Building envelope (outer perimeter, walls)    | —                      |
| `studio`| Studio unit block inserts                     | Block name + position  |
| `shop`  | Closed LWPOLYLINE perimeters of shop areas    | Text label (see below) |

### Studio blocks

Studio units are placed as block INSERT entities on layer `studio`.

| Block name | Actual area | Nominal | Orientation          |
|------------|-------------|---------|----------------------|
| `s50-l`    | 48 SF (6'×8') | 50 SF | Landscape (8' along X) |
| `s50-p`    | 48 SF (6'×8') | 50 SF | Portrait (6' along X)  |

The INSERT entity's `rotation` attribute gives the final on-floor angle. The stable space ID
is derived from the block name and insertion point (quantized to nearest inch).

### Shop identity

Shop polylines carry no embedded identity. Each shop has a corresponding `TEXT` entity placed
inside its perimeter on a layer named `shop_label`. The text value is the shop's stable ID
(e.g. `LASER`, `CNC`, `WOODSHOP`).

The pipeline assigns each shop polyline its ID by point-in-polygon lookup against the
`shop_label` layer. A shop polyline with no enclosing label is flagged as an import warning.

---

## DXF → SVG Import Pipeline

A standalone Python script (`tools/dxf_to_svg.py`) converts DXF files to SVG for use in the UI.

### Script responsibilities

1. Parse the DXF using `ezdxf` (R2000+)
2. Derive coordinate transform from layer `0` bounding box:
   `svg_x = (dxf_x − min_x) × scale`, `svg_y = (max_y − dxf_y) × scale`
3. Render layer `0` geometry as background SVG paths (building envelope)
4. For each INSERT on layer `studio`:
   - Derive `space_id` from block name + insertion point (e.g. `s50-l:142:87`)
   - Apply INSERT rotation to orient the rectangle correctly
   - Emit `<rect data-space-id="..." data-block="s50-l" .../>`
5. For each closed LWPOLYLINE on layer `shop`:
   - Look up enclosing `TEXT` on layer `shop_label` by point-in-polygon
   - Emit `<polygon data-space-id="LASER" data-type="shop" .../>`
   - Warn and skip (or emit without ID) if no label found
6. Render all other layers as non-interactive SVG background geometry
7. Output a self-contained SVG: `public/floorplans/<building>_<floor>.svg`

### Stable ID contract

- `data-space-id` values are the join key to `spaces.external_id` in the database
- Studio IDs encode block name and position — they are stable as long as the unit is not
  physically moved in the drawing
- Shop IDs come from the `shop_label` text — stable as long as the label text is unchanged
- IDs must never be changed once a space has been assigned in the application

### Import modes

**Full import** — initial setup or full rebuild:
```
python tools/dxf_to_svg.py --input building_a_floor1.dxf --output public/floorplans/a_1.svg
```

**Diff mode** — for updates after a DXF revision:
```
python tools/dxf_to_svg.py --input building_a_floor1.dxf --diff --output public/floorplans/a_1.svg
```

Diff mode reports:
- New `SPACE_ID` values not in the current SVG (additions)
- `SPACE_ID` values in the current SVG missing from the new DXF (removals — flagged as warnings)
- Geometry changes to existing IDs (updates)
- IDs present in both with no change (no-ops)

Removals of existing `SPACE_ID` values require explicit confirmation; they are not applied
silently. A `SPACE_ID` that exists in the database as an active assignment blocks removal until
the assignment is ended.

---

## Database Schema

```prisma
model FloorPlan {
  id         String   @id @default(cuid())
  building   String                          // e.g. "A", "B"
  floor      Int
  svgPath    String                          // path under /public/floorplans/
  updatedAt  DateTime @updatedAt
  spaces     Space[]
}

model Space {
  id          String    @id @default(cuid())
  externalId  String    @unique               // matches data-space-id in SVG
  name        String
  blockType   String                          // STUDIO_UNIT, SHOP, MEETING_ROOM, etc.
  floorPlanId String
  floorPlan   FloorPlan @relation(fields: [floorPlanId], references: [id])
  resourceId  String?   @unique               // link to Resource tree node
  resource    Resource? @relation(fields: [resourceId], references: [id])
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
}
```

`Space` is the bridge between the physical floor plan and the Resource tree. Every bookable or
leasable area has both a `Space` record (floor plan geometry) and a `Resource` record (booking
and access logic). Non-bookable common areas have a `Space` record but no `Resource`.

---

## Browser Display

Floor plans are displayed as inline SVG embedded in the page (not `<img>` or `<object>`).
Inline SVG allows the application to:

- Query and update DOM elements by `data-space-id`
- Apply CSS classes for occupancy state (vacant, occupied, selected)
- Attach click/hover handlers for booking or assignment flows

### Rendering approach

1. The SVG file is served from `/public/floorplans/` and fetched at page load
2. The client queries the API for current space states (occupancy, active bookings, member name)
3. The SVG DOM is updated: fill colours and tooltip content applied per `data-space-id`
4. Clicking a space opens a panel: space details, current occupant (if any), actions available
   to the current user (book, assign, view history)

### Colour states (studios)

| State        | Fill           |
|--------------|----------------|
| Vacant       | `#d4edda` (green) |
| Occupied     | `#f8d7da` (red)   |
| My studio    | `#cce5ff` (blue)  |
| Selected     | `#fff3cd` (amber) |

Shops and meeting rooms use analogous booking-state colours.

---

## Admin Workflows

- **Import floor plan**: run `dxf_to_svg.py`, commit SVG to repo, trigger sync in admin UI
- **Sync spaces**: admin action reads the SVG, creates/updates `Space` records for all
  `data-space-id` elements, reports additions and any flagged removals
- **View floor plan**: full interactive floor plan with live occupancy overlay
- **Assign studio from floor plan**: click vacant unit → assign to member → Stripe add-on created

## Member Portal

- **View floor plan**: read-only occupancy view; click own studio to see assignment details
- Studio units not occupied by the member are shown as occupied/vacant but without tenant name

---

## Operational vs Structural Changes

| Change type                         | Source of truth | How applied                     |
|-------------------------------------|------------------|---------------------------------|
| Member assigned to studio           | Application DB   | Click-to-assign in admin UI     |
| Studio subdivided or merged         | DXF + staff flag | DXF re-export → diff import     |
| New room added to building          | DXF              | DXF re-export → diff import     |
| Room renamed                        | Application DB   | Edit in admin UI (not DXF)      |
| Wall moved (layout change)          | DXF              | DXF re-export → full import     |

The DXF is the source of truth for geometry only. All operational state (assignments, bookings,
names, descriptions) lives in the database and is never overwritten by a DXF import.

---

## Out of Scope (v1.0)

- Real-time occupancy from badge readers or sensors
- 3D models or rendered floor plans
- Multiple floors displayed simultaneously
- Wayfinding or navigation overlays
- Print-to-PDF floor plan export

---

## Open Questions

- [ ] Confirm DXF file organisation: one file per floor per building, or combined?
- [ ] Who maintains `SPACE_ID` assignment in AutoCAD? (staff responsibility)
- [ ] Studio sub-unit policy: which units are non-subdivisible? Staff to provide initial list.
- [ ] Which floor plan(s) to use as the pilot for import testing?
