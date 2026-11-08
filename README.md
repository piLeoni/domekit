# geodesic

A geodesic dome generator. Pick a frequency (V), a radius and a cut height; get
the dome in 3D with its taxonomy: strut types, hub types, panel types, the face
schema, and the cut list.

```sh
npm install
npm run dev        # http://localhost:5173
npm test           # geometry tests (vitest)
npm run build      # type-check + production bundle in dist/
```

## What it generates

- **Two patterns.** *Geodesic*: the subdivided sphere, triangles, hubs on the
  sphere. *Goldberg*: its dual (the polar reciprocal about the sphere), flat
  pentagons and hexagons, each lying in the sphere's tangent plane at one
  geodesic hub, three struts at every node. Neighbouring panels share corners
  exactly, so every panel can be cut from flat stock. Both run through the same
  cut, taxonomy and export pipeline.

- **Class I, Method 1** subdivision (each base triangle gridded flat, then
  projected to the sphere) of an **icosahedron** or **octahedron**, 1V–12V.
- The base solid stands on a vertex: a 5-way hub (icosahedron) or 4-way hub
  (octahedron) at the zenith.
- **The cut** is a plane, placed by a **coefficient** (distance from the top
  of the sphere over its diameter: 0.5 is the equator, 1 the whole sphere) or,
  by a **height** in your unit; the two fields are linked. It is continuous:
  the plane need not pass through hubs.
- **What happens at the plane** (`mode`):
  - `exclude`: keep only struts and panels wholly above it.
  - `include`: keep everything that reaches above it, whole (the base steps
    below the plane).
  - `section`: trim at the plane. Crossing struts become **cut pieces**,
    crossing panels are clipped (to triangles or quads), and the plane gets a
    **base ring** of struts between the new **cut points**. The base is flat
    and the height is exactly the cut.
- Hubs within 1e-6 r of the plane count as on it, so rounding never makes
  sliver pieces. `Dome.flatCuts` lists the coefficients where a whole ring of
  hubs lies on the plane (flat base, nothing trimmed).

## Taxonomy

| Family | Grouped by | Named |
|---|---|---|
| Struts | length (chord factor) and the angles at its two ends | `A`, `B`, `C`… shortest first |
| Cut struts | parent type, trimmed length, angle to the plane | `B′`, or `B′1`, `B′2`… |
| Base ring | length | `R1`, `R2`… |
| Panels | sides and corners in order around the panel (rotations are one type) | `P1`, `P2`… with their signature (`AAB`); mirror pairs flagged |
| Cut panels | parent panel, side lengths | `P2′`, or `P2′1`, `P2′2`… |
| Hubs | the arms in order around the hub: strut type, dip, turn (rotations of the same ring are one type) | `H1`, `H2`…; mirror pairs flagged |
| Cut points | the struts meeting there | `X1`, `X2`… |

Strut and panel names come from the **whole sphere**, so a strut keeps its
letter and colour whatever height the dome is cut at. Chord factors match the
published tables (e.g. 3V: 0.34862 / 0.40355 / 0.41241); see
`src/geodesic/generate.test.ts`.

Each hub type lists its **arms** counter-clockwise seen from outside: the strut
type, its **dip** below the tangent plane (for cut points: its rise above the cut
plane), the **turn** around the hub axis to the next arm, and the true 3D angle
**between** neighbouring struts. Two hubs with the same struts in a different
order, or at different angles, are different connectors; a type that is another's
mirror image (same arms, opposite hand) is marked as its pair. The hub list
export has one row per arm.

Cut pieces are pieces like any other: they are counted, measured and exported
in the cut list. They wear their parent's colour (hatched in the tables, dashed
in the model); ring struts are grey.

Colour: every whole type gets its own hue, as far as possible from all the
others (the first eight are a validated colour-blind-safe order; the rest are
picked furthest-first in OKLab). With many types some hues come close, so the
label always names the type.

## Drawings

The **Sheets** tab (and Export → Drawings) gives one drawing per part type,
in three forms:

- **PDF, printable**: a page per part, all the same size (A4, or US Letter
  for imperial domes): header with label and quantity, the part scaled to
  fit with its annotations, a data table, and a footer with a true scale bar
  and the scale ratio. First page: the parts list and the face schema.
- **SVG, full size** (zip): each part at 1:1, 1 unit = 1 mm (1 inch for
  imperial domes), with its notes and a 100 mm (4 in) check bar. Layers
  `outline` (red, cut), `marks` (blue), `text`.
- **DXF, full size** (zip): the same as DXF R12, layers `OUTLINE`, `MARKS`,
  `TEXT`, units in the header.

What each part shows:
- **Panels**: true shape seen from outside; per side its strut, length and
  bevel (half the angle to the neighbouring panel); each corner's angle.
- **Struts**: length hub centre to hub centre, angle at each end; cut pieces
  show the slanted end at the base plane.
- **Hubs**: a template of the arms at their true turns, with dips (arm length
  nominal: the hub's size comes with the construction technique).

No nesting: lay parts out in your own tool.

## Interface

Parameters on the left, the model in the middle, the taxonomy on the right
(Struts, Panels, Hubs, Schema). The model is drawn as flat vector lines; panels
are a faint fill that pushes back the struts behind them. Hover any type, in a
table or in the model, to light it everywhere; click to select it (Esc or a
click on empty space clears). Picking in the model opens the matching tab.
The Labels toggle writes each strut's (or panel's) type on the model.
Highlights ease in and out over about 200 ms; what is not in focus recedes
less in dark mode, where faded lines would otherwise vanish.

## Layout

```
src/
  geodesic/         the core: pure TypeScript, no DOM, no three.js
    polyhedra.ts    base solids, vertex at the zenith
    generate.ts     subdivide → cut → classify → measure
    types.ts        the Dome shape the UI consumes
    export.ts       OBJ, CSV cut list, JSON
  components/       React UI: ui.tsx (controls), Viewport (react-three-fiber),
                    Taxonomy (tables, spectrum, schema), Controls, Stats, Export
  lib/              palette, theme, units, URL state
```

The UI only calls `generateDome(params): Dome`. To move the geometry to Rust,
build a WASM module that returns the same `Dome` shape (flat arrays for
`vertices`, `struts`, `faces` cross the boundary cheaply) and swap the import in
`src/geodesic/index.ts`; the tests describe the expected numbers.
