# Floor Plan & Space Management — Spec v0.3

**Supersedes:** `floorplan-spec.md` (v1.0)

**Status:** This spec reflects the floor plan system as built. Where behaviour
has diverged from the original spec, the change is noted.

---

## Scope

This spec covers how the application represents, imports, displays, and links to
physical spaces (studios, shops, rooms, storage) defined in the facility's
AutoCAD drawings.

---

## Definitions

**Space** — any physically bounded area tracked in the system: studio unit, shop,
meeting room, common area, storage unit. Every Space has a `data-space-id` in the
SVG and an `externalId` in the database.

**Studio** — a private space rented by a member or group of members. Defined as
N x 50 SF base units; sizes are configurable via `StudioSize` records in admin
settings. ~250 units exist across two buildings.

**Base unit** — the smallest independently assignable studio area (50 SF nominal,
48 SF actual at 6'x8'). Larger studios are contiguous groups of base units
assigned together.

**Common space** — hallways, lobbies, shared circulation, and non-bookable areas.
May be non-contiguous — a single record can represent multiple physically separate
areas (e.g. all hallways on a floor as one named zone). No assignment or booking
logic; present on the floor plan for visual context.

**Storage space** — leasable storage areas. Subtypes:

| Subtype | Description | DXF representation |
|---------|-------------|-------------------|
| `pallet` | Full pallet footprint on the floor | Block insert, layer `storage` |
| `shelf` | Individual shelf level within a shelving unit | Block insert; separate DXF layer per level |
| `tool_cart` | Dedicated floor space for a member's tool cart | Block insert, layer `storage` |

Shelf storage is multi-level. Each level is drawn on a separate DXF layer
(`shelf_l1`, `shelf_l2`, `shelf_l3`, etc.) so levels can be shown or hidden
independently in the floor plan viewer.

---

## Space Type Configuration

**Change from v1.0:** Space types are no longer hardcoded. They are admin-configurable
via `SpaceTypeConfig` records.

Each space type has:

| Field | Description |
|---|---|
| slug | Permanent key (used as `typeTag` on Resources) |
| label | Editable display name |
| parentId | Types form a hierarchy (e.g. `storage` → `pallet`, `shelf`, `tool_cart`) |
| dxfLayer | Which DXF layer this type appears on |
| color | Hex colour for floor plan rendering |
| isBookable | Default for new resources of this type |
| isLeasable | Default for new resources of this type |

Types are managed at `/admin/settings/space-types`. New types require no code or
schema changes.

---

## DXF Convention

### Version

Export as **R2000**. R12 is avoided because it lacks `LWPOLYLINE`.

### Coordinate System

Drawings are **building-aligned**: rotated so primary walls run along X and Y axes.
True north is indicated by annotation only.

The import pipeline derives the coordinate origin from the bounding box of layer 0.

### Layer Vocabulary

Layers with semantic meaning — all others imported as background geometry.

| Layer | Contents | Identity carrier |
|---|---|---|
| `0` | Building envelope (outer perimeter, walls) | — |
| `studio` | Studio unit block inserts | Block name + position |
| `shop` | Closed LWPOLYLINE perimeters of shop areas | Text label (see below) |
| `common` | LWPOLYLINE perimeters of common areas | Text label on `common_label` |
| `storage` | Storage unit block inserts (pallets, tool carts) | Block name + position |
| `shelf_l1` | Shelf bay blocks, level 1 (lowest) | Block name + position |
| `shelf_l2` | Shelf bay blocks, level 2 | Block name + position |
| `shelf_l3` | Shelf bay blocks, level 3 | Block name + position |
| `shop_label` | TEXT labels inside shop perimeters | — |
| `common_label` | TEXT labels inside common area perimeters | — |
| `studio_label` | TEXT labels for studio unit numbering | — |
| `fp_marker` | Provenance marker (see below) | — |

### Studio Blocks

| Block name | Actual area | Nominal | Orientation |
|---|---|---|---|
| `s50-l` | 48 SF (6'x8') | 50 SF | Landscape (8' along X) |
| `s50-p` | 48 SF (6'x8') | 50 SF | Portrait (6' along X) |

### Studio Numbering

**Change from v1.0:** Studio identity is driven by sequential numbering on the
`studio_label` layer, not by block name + insertion point.

The pipeline:
1. Reads existing labels from the `studio_label` layer
2. Preserves existing numbers (matched by proximity — 1.0 unit tolerance from
   centroid)
3. Assigns new sequential numbers (max+1) to unlabeled studios
4. Orders new assignments west→east, north→south
5. Outputs `data-space-id="studio-N"` format

The labeled DXF output writes new labels back to `studio_label` so future
revisions preserve numbering.

### Shop Identity

Shop polylines carry no embedded identity. Each shop has a corresponding TEXT
entity on `shop_label` inside its perimeter. The pipeline assigns identity by
point-in-polygon lookup. A shop with no enclosing label generates a warning.

### Provenance Marker

**New in v0.3.** Every DXF that has been through the pipeline gets a provenance
marker on layer `fp_marker` at the top-left corner of the drawing. The marker
encodes `fpid.revid` — the floor plan ID and revision ID from the database.

On subsequent uploads, the pipeline reads this marker to:
- Validate that the DXF belongs to the expected floor plan
- Link the new revision to the correct history chain

A "bootstrap mode" allows uploading a pre-marker DXF for initial setup.

---

## DXF → SVG Import Pipeline

### Script: `tools/dxf_to_svg.py`

Converts DXF files to SVG. Uses `ezdxf` (R2000+).

### Pipeline Steps

1. Parse DXF
2. Derive coordinate transform from layer `0` bounding box
3. Render layer `0` geometry as background SVG paths
4. For each INSERT on layer `studio`:
   - Look up or assign sequential studio number
   - Apply INSERT rotation
   - Emit `<polygon data-space-id="studio-N" data-type="studio_unit" data-block="s50-l" .../>`
5. For each closed LWPOLYLINE on layer `shop`:
   - Look up enclosing TEXT on `shop_label`
   - Emit `<polygon data-space-id="wood_shop" data-type="shop" .../>`
6. Render storage, shelf, and common area elements similarly
7. Output SVG to `public/floorplans/`

### Labeled DXF Output

When `--output-dxf` is provided, the script writes a new DXF with:
- Studio labels for newly numbered studios on `studio_label` layer
- Provenance marker on `fp_marker` layer
- All original geometry preserved

This labeled DXF is offered as a download after upload commit.

### Inspection Tool: `tools/dxf_survey.py`

Audits DXF structure: layers, blocks, INSERTs, polylines, text entities.
Used for debugging malformed or unfamiliar DXFs before import.

---

## Upload & Sync Workflow (As Built)

### Upload Flow

1. **User uploads DXF** via FloorPlanUpload component
   - Mode: "new" (create floor plan) or "revision" (update existing)
2. **Preview step:** POST to `/api/admin/floorplans/upload/preview`
   - Backend runs `dxf_to_svg.py`
   - Extracts spaces from SVG via regex (`data-space-id` + `data-type`)
   - Computes diff against existing database spaces
   - Returns: spaces list, diff summary, SVG preview, marker validation result
3. **Diff review:** UI shows:
   - New spaces (not in DB)
   - Removed unassigned spaces (safe to remove)
   - Removed assigned spaces (**blocks commit** — cannot remove spaces with
     active resource links)
   - Existing kept (no change)
4. **Commit:** POST to `/api/admin/floorplans/upload/commit`
   - Saves SVG and DXF as `FloorPlanRevision`
   - Updates `FloorPlan.svgPath` (denormalized for fast access)
   - Runs `syncFloorPlan()` to upsert Space records
   - Returns labeled DXF download
5. **User downloads labeled DXF** — must save for future revisions (contains
   provenance marker)

### Space Sync (`syncFloorPlan`)

Reads SVG from disk, parses `data-space-id` and `data-type` attributes,
upserts Space records:
- Creates new Space records for new IDs
- Skips existing records (does not overwrite)
- Generates display names from externalId (replaces underscores/colons with
  spaces)
- Audits as SYSTEM action

Returns: `{ created, existing, total }`

---

## Database Schema

```prisma
model FloorPlan {
  id         String              @id @default(cuid())
  building   String
  floor      Int
  svgPath    String              // denormalized — current approved SVG
  createdAt  DateTime            @default(now())
  updatedAt  DateTime            @updatedAt
  spaces     Space[]
  revisions  FloorPlanRevision[]

  @@unique([building, floor])
}

model FloorPlanRevision {
  id           String    @id @default(cuid())
  floorPlanId  String
  svgPath      String
  dxfData      Bytes?    // stored DXF for download
  note         String?
  uploadedAt   DateTime  @default(now())
  uploadedById String?
  floorPlan    FloorPlan @relation(fields: [floorPlanId], references: [id])
}

model Space {
  id          String    @id @default(cuid())
  externalId  String    @unique    // matches data-space-id in SVG
  name        String
  blockType   String
  floorPlanId String
  resourceId  String?   @unique    // link to Resource (null for common areas)
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  floorPlan   FloorPlan @relation(fields: [floorPlanId], references: [id])
  resource    Resource? @relation(fields: [resourceId], references: [id])
}
```

**Changes from v1.0 spec:**
- `FloorPlanRevision` model added (revision history with DXF storage)
- `FloorPlan.svgPath` is now a denormalized pointer to the current revision's SVG
- `Space.resourceId` is `@unique` — one Space maps to at most one Resource
  (but multiple Spaces can link to the same Resource via the studio grouping
  pattern, where the Resource is the parent studio and Spaces are its unit children)

---

## Browser Display

Floor plans are rendered as inline SVG for DOM manipulation.

### FloorPlanViewer Component

Two modes:
- **View mode:** Click spaces for details, hover shows tooltips. Used in admin
  floor plan page and member portal map.
- **Select mode:** Click to select/deselect studio units. Used in studio
  create/edit forms.

### SVG Attribute Enrichment

The Python pipeline outputs base attributes (`data-space-id`, `data-type`,
`data-block`). The application enriches the SVG at render time with:
- `data-resource-id` — linked Resource ID
- `data-resource-name` — Resource display name
- `data-occupant` — current tenant name (for occupied studios)

### Colour States

| State | Fill |
|---|---|
| Vacant | `#d4edda` (green) |
| Occupied | `#f8d7da` (red) |
| My studio | `#cce5ff` (blue) |
| Selected | `#fff3cd` (amber) |
| Common area | `#f5f5f5` (neutral) |
| Not synced | Grey (no resource link) |

### Shelf Level Toggles

Shelf levels render as distinct SVG `<g>` groups. A level selector control
shows/hides `shelf_l1`, `shelf_l2`, `shelf_l3` independently.

### Member Portal Floor Plan

- Read-only occupancy view at `/portal/map`
- Hover shows occupant names for all rented spaces
- Colour legend for space states
- Building/floor tab navigation

---

## Admin Workflows

- **Upload floor plan:** DXF upload → preview with diff → commit → download
  labeled DXF
- **Sync spaces:** Admin action reads SVG, creates/updates Space records
- **View floor plan:** Interactive view with live occupancy overlay, space
  details panel, summary stats (total, occupied, vacant, unlinked)
- **View revisions:** Historical revision list with dates, notes, DXF downloads
- **Create studio from floor plan:** Select units in select mode → name via
  studio naming convention → create Resource

---

## Operational vs Structural Changes

| Change type | Source of truth | How applied |
|---|---|---|
| Member assigned to studio | Application DB | Admin UI (member detail or rental request) |
| Studio subdivided or merged | DXF + admin config | DXF re-export → upload with diff |
| New room added to building | DXF | DXF re-export → upload with diff |
| Room renamed | Application DB | Edit in admin UI (not DXF) |
| Wall moved (layout change) | DXF | DXF re-export → upload |
| Storage unit added/removed | DXF | DXF re-export → upload with diff |
| Shelf level added to a bay | DXF | Add insert on new shelf layer → upload |
| Common area boundary changed | DXF | DXF re-export → upload |

The DXF is the source of truth for geometry only. All operational state
(assignments, bookings, names, descriptions) lives in the database.

---

## Out of Scope

- Real-time occupancy from badge readers or sensors
- 3D models or rendered floor plans
- Multiple floors displayed simultaneously
- Wayfinding or navigation overlays
- Print-to-PDF floor plan export

---

## Open Questions

- [ ] Confirm DXF file organisation: one file per floor per building, or combined?
- [ ] Who maintains studio numbering in AutoCAD? (pipeline handles it, but staff
  must use the labeled DXF output for subsequent edits)
- [ ] Studio sub-unit policy: which units are non-subdivisible? Staff to provide list.
- [ ] Which floor plan(s) to use as the pilot for import testing?
