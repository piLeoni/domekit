# Geodesic & Goldberg Dome Parametric Engine: Complete Architectural & Mathematical Specification

## 1. Executive Summary & Project Scope
This document serves as the master specification and reference codebase for building a parametric **Geodesic & Dual Goldberg Dome Generator**. It consolidates the mathematical foundations, structural engineering rules (zero-torsion beams, node taxonomies, coplanar dual polygons), CAD platform distribution trade-offs, and a complete, zero-dependency TypeScript geometry and 2D/3D export engine.

### Core Capabilities Covered
1. **Primal Geodesic Mesh Generation:** Subdivision of a regular icosahedron by frequency $V \in [1, 10]$, spherical projection, and flat-base or plane-slice truncation.
2. **Strut & Triangle Taxonomy:** Automatic classification of struts (`A, B, C...`) and triangular faces (`T1, T2, T3...`), including chirality detection (`L/R` mirror panels for scalene triangles) and dihedral bevel angles along every edge.
3. **Node / Hub Taxonomy & Coordinate Frames:** Canonical cyclic angle signatures $(\theta, \phi)$ around every vertex normal $\mathbf{N}_i$ to classify unique 4-way, 5-way, and 6-way connectors (`Node_5A`, `Node_6B...`).
4. **Zero-Torsion Beam Reference Frames:** Orthonormal local coordinate frames $(\mathbf{X}_{\text{strut}}, \mathbf{Y}_{\text{strut}}, \mathbf{Z}_{\text{strut}})$ aligned to Great Circle radial planes to prevent axial twist in rectangular timber or extruded beams.
5. **Dual Goldberg Polyhedron (Hexagons & Pentagons):** Generation of 100% coplanar pentagonal (`P1`) and hexagonal (`H1, H2...`) cladding panels using spherical circumcenter / tangent-plane projection.
6. **Fabrication Exports:** Direct client-side serialization to **SVG** (cut + score layers), **DXF (R12 ASCII)**, **OBJ**, and **Watertight STL/3MF** (via `manifold-3d` CSG).

---

## 2. Platform & Distribution Architecture

### 2.1 Web Application Stack (Recommended Primary Target)
* **Core Language:** **100% TypeScript**. V8 executes the linear algebra for a $6V$ dome (720 faces, 1,080 struts), classifies all taxonomies, unfolds 2D coordinates, and generates SVG/DXF strings in **$< 2\text{ ms}$**.
* **3D Viewport:** **Three.js** (`THREE.BufferGeometry`, `THREE.InstancedMesh` for struts/nodes). Visual hub previews rely on depth-buffered intersecting cylinders/boxes at 60 FPS without needing live boolean pauses.
* **Watertight 3D Hub Booleans (STL/3MF Export):** Use **`manifold-3d`** (a pre-compiled C++/WASM CSG library installed via `npm install manifold-3d`). It performs watertight boolean unions and socket hole subtractions in $2\text{--}5\text{ ms}$ directly from TypeScript without writing custom Rust.
* **2D Offsets & Kerf Compensation:** Use **`clipper2-js`** for inward/outward polygon offsetting, mitered flange tabs, and kerf adjustments.
* **When to Use Custom Rust/WASM:** Only required if adding **automated 2D true-shape sheet nesting** (bin-packing hundreds of irregular polygons onto plywood sheets using libraries like `jagua-rs` in a Web Worker) or custom FEA structural simulation.

### 2.2 CAD Plugin Ecosystem Comparison (Onshape vs. Fusion 360)

| Dimension | Onshape (FeatureScript) | Fusion 360 (Python API) |
| :--- | :--- | :--- |
| **Execution Model** | Runs natively inside the parametric regeneration kernel alongside native Extrude/Loft features. | Acts as an external macro automating UI/B-Rep API calls; `CustomFeatures` API requires heavy boilerplate. |
| **Custom Profiles & Nodes** | **Superior:** Users can select a 2D Sketch Profile for beams or a custom 3D socket body directly in the feature dialog; updates live when sketches change. | **Moderate:** Requires `SweepFeatures` and instancing `Components`/`Occurrences` via `Matrix3D` transforms. |
| **Performance at High $V$** | `opPattern` instances master hub archetypes via transform arrays in milliseconds; native Custom Tables output live BOMs. | Must group hubs by taxonomy archetype into `Components` first, then place `Occurrences` to avoid B-Rep boolean stalls. |
| **Free Distribution** | **Zero Friction:** Make Document Public and create a Version. Users add it via `+ Custom features` URL search immediately with no store review. | Package into `.bundle` folder with `PackageContents.xml` and submit to Autodesk Design & Make Marketplace (1–2 week QA review). |
| **Paid Distribution** | **High Friction on Official Store:** Requires full OAuth2 Cloud/REST app + Billing API + 5 beta testers. (Workaround: sell document link access via Gumroad/Stripe). | **Low-Medium Friction:** Link PayPal in Autodesk Publisher Center and verify purchases via a single REST call to the Entitlement API. Startup load must be $< 0.005\text{ s}$ (lazy-load math modules). |

---

## 3. Core Mathematical Formulations

### 3.1 Base Icosahedron (Zenith Vertex-Up Orientation)
A regular icosahedron has 12 vertices and 20 equilateral faces. To ensure the dome has a natural 5-fold symmetry axis along the vertical $Y$-axis (or $Z$-axis in CAD) with one pentagon dead-center at the zenith:
* Top Zenith Vertex: $\mathbf{V}_0 = (0, 1, 0)$
* Bottom Nadir Vertex: $\mathbf{V}_{11} = (0, -1, 0)$
* Upper Pentagon Ring ($k \in \{0..4\}$) at latitude $\arctan\left(\frac{1}{2}\right) \approx 26.565^\circ$:
  $$y_{\text{upper}} = \frac{1}{\sqrt{5}}, \quad r_{\text{ring}} = \frac{2}{\sqrt{5}}, \quad \theta_k = \frac{2\pi k}{5}$$
  $$\mathbf{V}_{k+1} = \left(r_{\text{ring}} \cos\theta_k,\; y_{\text{upper}},\; r_{\text{ring}} \sin\theta_k\right)$$
* Lower Pentagon Ring ($k \in \{0..4\}$), rotated by $\frac{\pi}{5}$ ($36^\circ$):
  $$\mathbf{V}_{k+6} = \left(r_{\text{ring}} \cos\left(\theta_k + \frac{\pi}{5}\right),\; -y_{\text{upper}},\; r_{\text{ring}} \sin\left(\theta_k + \frac{\pi}{5}\right)\right)$$

### 3.2 Class I (Method 1) Frequency $V$ Subdivision & Spherical Projection
For each of the 20 base triangles with vertices $(\mathbf{A}, \mathbf{B}, \mathbf{C})$ and integer frequency $V \ge 1$:
1. Generate grid points for integer barycentric indices $i \in [0, V]$ and $j \in [0, V - i]$:
   $$\mathbf{P}_{i,j} = \frac{(V - i - j)\mathbf{A} + i\mathbf{B} + j\mathbf{C}}{V}$$
2. Project radially onto the sphere of radius $R = \frac{\text{Diameter}}{2}$:
   $$\mathbf{S}_{i,j} = R \cdot \frac{\mathbf{P}_{i,j}}{\|\mathbf{P}_{i,j}\|}$$
3. Stitch sub-triangles for each cell:
   * Upright sub-triangles: $\left(\mathbf{S}_{i,j},\; \mathbf{S}_{i+1,j},\; \mathbf{S}_{i,j+1}\right)$
   * Inverted sub-triangles (when $i + j < V - 1$): $\left(\mathbf{S}_{i+1,j},\; \mathbf{S}_{i+1,j+1},\; \mathbf{S}_{i,j+1}\right)$
4. Deduplicate vertices globally using a spatial hash key rounded to $10^{-5} \cdot R$.

### 3.3 The Beam Torsion Problem & Zero-Torsion Local Coordinate Frames
When rectangular beams ($2\times4$ timber, C-channels, I-beams) connect two vertices $\mathbf{V}_A$ and $\mathbf{V}_B$, the vertex outward normals $\mathbf{N}_A = \frac{\mathbf{V}_A}{\|\mathbf{V}_A\|}$ and $\mathbf{N}_B = \frac{\mathbf{V}_B}{\|\mathbf{V}_B\|}$ diverge by the central arc angle of the strut.
* **Why Beams Twist in Cheap Kits:** If flat-plate connectors are aligned tangent to $\mathbf{N}_A$ and $\mathbf{N}_B$ without compound radial rotation, they induce axial torsion along the beam.
* **The Zero-Torsion Great Circle Frame:** Because $\mathbf{V}_A$, $\mathbf{V}_B$, and the sphere origin $(0,0,0)$ are coplanar (forming a Great Circle plane), we define an untwisted orthonormal frame $(\mathbf{X}_{\text{strut}}, \mathbf{Y}_{\text{strut}}, \mathbf{Z}_{\text{strut}})$ for every strut:
  $$\mathbf{Z}_{\text{strut}} = \frac{\mathbf{V}_B - \mathbf{V}_A}{\|\mathbf{V}_B - \mathbf{V}_A\|} \quad \text{(Unit vector along strut axis)}$$
  $$\mathbf{M} = \frac{\mathbf{V}_A + \mathbf{V}_B}{2}, \quad \mathbf{Y}_{\text{strut}} = \frac{\mathbf{M} - (\mathbf{M} \cdot \mathbf{Z}_{\text{strut}})\mathbf{Z}_{\text{strut}}}{\|\mathbf{M} - (\mathbf{M} \cdot \mathbf{Z}_{\text{strut}})\mathbf{Z}_{\text{strut}}\|} \quad \text{(Outward radial normal)}$$
  $$\mathbf{X}_{\text{strut}} = \mathbf{Y}_{\text{strut}} \times \mathbf{Z}_{\text{strut}} \quad \text{(Side face normal)}$$
* By orienting each socket on the 3D hub to match $(\mathbf{X}_{\text{strut}}, \mathbf{Y}_{\text{strut}}, \mathbf{Z}_{\text{strut}})$ at the setback distance $d_{\text{setback}}$, every rectangular beam remains **100% straight and torsion-free** with simple $90^\circ$ or single-plane miter end cuts.

### 3.4 The 4 Geodesic Joint Architectures
1. **Tubular Sleeve / Slotted Fin Hub:** Struts are shortened at each end by setback $d_{\text{setback}}$. The hub places a socket or flat blade along $-\mathbf{Z}_{\text{strut}}$ pitched at cone angle $\phi_k = \arccos(\mathbf{N}_i \cdot \mathbf{Z}_{\text{strut},k})$.
2. **Direct Compound Miter (Hubless Beams):** Rectangular beams extend to the vertex and are sliced by the **bisecting planes** between adjacent incoming struts $k$ and $k+1$ (ordered clockwise around $\mathbf{N}_i$). The bisecting plane normal is:
   $$\mathbf{B}_{k, k+1} = \text{normalize}\left(\mathbf{X}_{\text{strut}, k} + \mathbf{X}_{\text{strut}, k+1}\right)$$
   where signs are oriented cyclically around $\mathbf{N}_i$.
3. **Lapped / Reciprocal Pinwheel Joint:** Each incoming strut axis is offset tangentially along $\mathbf{X}_{\text{strut}, k}$ by eccentricity $e$ (or stacked along $\mathbf{N}_i$ by $k \cdot t_{\text{beam}}$) so beams weave around a central aperture without a central hub.
4. **User-Supplied Custom Socket Block:** A single reference CAD arm modeled at the origin along $+Z$ is transformed by the $4\times4$ matrix $\mathbf{T}_k = [\mathbf{X}_{\text{strut}, k},\; \mathbf{Y}_{\text{strut}, k},\; \mathbf{Z}_{\text{strut}, k},\; \mathbf{V}_i]$ and boolean-unioned into the master node archetype.

### 3.5 2D Triangle Unfolding & Dihedral Bevel Angles
Given a 3D triangle with ordered side lengths $(a, b, c)$ preserving the outward normal winding $(\mathbf{V}_1, \mathbf{V}_2, \mathbf{V}_3)$:
1. **Law of Cosines 2D Projection:** Place $\mathbf{p}_1 = (0, 0)$ and $\mathbf{p}_2 = (a, 0)$. The third vertex $\mathbf{p}_3 = (x_3, y_3)$ is:
   $$x_3 = \frac{a^2 + c^2 - b^2}{2a}, \quad y_3 = \sqrt{\max\left(0,\; c^2 - x_3^2\right)}$$
   *(where $a = \|\mathbf{V}_2 - \mathbf{V}_1\|$, $b = \|\mathbf{V}_3 - \mathbf{V}_2\|$, $c = \|\mathbf{V}_1 - \mathbf{V}_3\|$)*.
2. **Dihedral Edge Bevel Angle:** For an edge shared between triangle $F_1$ (unit normal $\mathbf{n}_1$) and adjacent triangle $F_2$ (unit normal $\mathbf{n}_2$):
   $$\theta_{\text{dihedral}} = \arccos\left(\text{clamp}(\mathbf{n}_1 \cdot \mathbf{n}_2, -1, 1)\right)$$
   $$\theta_{\text{bevel}} = \frac{\theta_{\text{dihedral}}}{2}$$
   This $\theta_{\text{bevel}}$ is the exact table-saw or CNC blade tilt angle required so thick plywood/CLT panels meet flush along the seam.
3. **Chirality (Left/Right Handed Scalene Panels):** At $5V$ and above, scalene triangles ($a \neq b \neq c$) appear in mirror-image pairs: cyclic order $(A, B, C)$ vs. $(A, C, B)$ when viewed from the outside of the dome. If the cladding material differs on its inner and outer faces, these must be classified as `T_k (L)` and `T_k (R)`.

### 3.6 Dual Goldberg Polyhedron (100% Coplanar Hexagons & Pentagons)
Euler's formula ($V - E + F = 2$) guarantees that **every full geodesic sphere has exactly 12 pentagons**, while all other dual cells are hexagons.
* **Why Naive Centroids Warp:** At $3V$ and above, projecting the barycentric centroids $\frac{\mathbf{A}+\mathbf{B}+\mathbf{C}}{3}$ of the 6 surrounding triangles onto the sphere produces a non-planar (saddle-warped) hexagon.
* **Coplanar Circumcenter / Tangent-Plane Method:**
  For each primal triangle $t$, compute the true 3D **circumcenter** ray $\mathbf{C}_t$ (the normal of plane $(\mathbf{V}_2 - \mathbf{V}_1) \times (\mathbf{V}_3 - \mathbf{V}_1)$ passing through the sphere origin), or intersect the rays of the surrounding triangle centers with the tangent plane at primal vertex $\mathbf{V}_i$:
  $$\mathbf{P}_{\text{dual}}(t, i) = \frac{R}{\mathbf{u}_t \cdot \mathbf{N}_i} \mathbf{u}_t \quad \text{where } \mathbf{u}_t = \frac{\mathbf{n}_t}{\|\mathbf{n}_t\|}$$
  Because every vertex $\mathbf{P}_{\text{dual}}(t, i)$ satisfies $\mathbf{P}_{\text{dual}} \cdot \mathbf{N}_i = R$, **every resulting pentagon and hexagon lies 100% flat on the tangent plane** $\mathbf{X} \cdot \mathbf{N}_i = R$ and can be cut from flat sheet stock without distortion.

---

## 4. Complete Zero-Dependency TypeScript Core Engine

Save the module below as `geodesicEngine.ts`. It contains the complete data structures, subdivision math, strut/triangle/node/Goldberg taxonomies, and SVG/DXF fabrication exporters.

```typescript
// ============================================================================
// geodesicEngine.ts
// Zero-dependency TypeScript engine for Geodesic & Dual Goldberg Domes
// Includes: 3D Topology, Strut/Triangle/Node/Goldberg Taxonomies,
// Zero-Torsion Beam Frames, 2D Unfolding, and SVG / DXF R12 Exporters.
// ============================================================================

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Vec2 {
  x: number;
  y: number;
}

export interfaceDomeParams {
  frequency: number;         // Subdivision frequency V (1 to 10)
  diameter: number;          // Sphere diameter in millimeters (e.g. 6000 for 6m)
  truncateRatio?: number;    // 0.3 to 1.0 (fraction of sphere height from top; 1.0 = full sphere)
  flatBaseSnap?: boolean;    // Snap lowest boundary ring vertices to the truncation plane
  toleranceMm?: number;      // Grouping tolerance in mm (default: 0.2mm)
}

export interface StrutFrame {
  origin: Vec3;              // Midpoint of strut
  xAxis: Vec3;               // Side normal (X = Y x Z)
  yAxis: Vec3;               // Outward Great-Circle radial normal (Zero-Torsion Up)
  zAxis: Vec3;               // Unit vector along strut from v1 to v2
}

export interface StrutEdge {
  id: number;
  v1: number;
  v2: number;
  length: number;
  chordFactor: number;
  taxonomyId: string;        // 'A', 'B', 'C', ...
  frame: StrutFrame;
  dihedralAngleDeg: number;  // Angle between adjacent triangle normals
  bevelAngleDeg: number;     // Half of dihedral angle (saw blade tilt)
  adjacentFaces: number[];
}

export interface StrutArchetype {
  id: string;                // 'A', 'B', 'C'...
  length: number;
  chordFactor: number;
  count: number;
}

export interface TriangleFace {
  id: number;
  vertices: [number, number, number]; // CCW outward winding
  edges: [number, number, number];    // Edge indices [e12, e23, e31]
  edgeClasses: [string, string, string];
  normal: Vec3;
  centroid: Vec3;
  taxonomyId: string;                 // 'T1', 'T2', 'T3L', 'T3R'...
}

export interface TriangleArchetype {
  id: string;                         // 'T1', 'T2'...
  signature: string;                  // e.g. 'A-A-B'
  isChiral: boolean;
  hand?: 'L' | 'R';
  count: number;
  edgeClasses: [string, string, string];
  edgeLengths: [number, number, number];
  bevelAnglesDeg: [number, number, number];
  interiorAnglesDeg: [number, number, number];
  vertices2D: [Vec2, Vec2, Vec2];     // Unfolded flat coordinates in mm
  areaMm2: number;
}

export interface NodeArmSpec {
  strutIndex: number;
  neighborVertex: number;
  strutClass: string;
  azimuthDeg: number;                 // Planar angle around vertex normal (0..360)
  deltaAzimuthDeg: number;            // Angle to next clockwise arm
  coneAngleDeg: number;               // Angle from outward vertex normal N (typically 70..85 deg)
  dropAngleDeg: number;               // 90 - coneAngleDeg (downward pitch from tangent plane)
  localDirection: Vec3;
}

export interface DomeVertexNode {
  id: number;
  position: Vec3;
  normal: Vec3;
  isBoundary: boolean;
  valence: number;
  arms: NodeArmSpec[];
  taxonomyId: string;                 // 'N5_1', 'N6_1', 'N4_Base_1'...
}

export interface NodeArchetype {
  id: string;
  valence: number;
  isBoundary: boolean;
  signature: string;
  count: number;
  representativeVertexId: number;
  arms: NodeArmSpec[];
}

export interface GoldbergPolygon {
  id: number;
  centerVertexId: number;
  sides: number;                      // 5 (Pentagon) or 6 (Hexagon)
  vertices3D: Vec3[];                 // Coplanar 3D vertices on tangent plane
  normal: Vec3;
  taxonomyId: string;                 // 'P1', 'H1', 'H2'...
}

export interface GoldbergArchetype {
  id: string;                         // 'P1', 'H1', 'H2'...
  sides: number;
  count: number;
  edgeLengths: number[];
  vertices2D: Vec2[];                 // Unfolded 2D coordinates in mm
}

export interface GeodesicDomeResult {
  params: DomeParams;
  vertices: Vec3[];
  struts: StrutEdge[];
  strutTaxonomy: StrutArchetype[];
  faces: TriangleFace[];
  triangleTaxonomy: TriangleArchetype[];
  nodes: DomeVertexNode[];
  nodeTaxonomy: NodeArchetype[];
  goldbergPolygons: GoldbergPolygon[];
  goldbergTaxonomy: GoldbergArchetype[];
}

// ============================================================================
// Vector & Linear Algebra Helpers
// ============================================================================

const DEG_PER_RAD = 180 / Math.PI;

export const V3 = {
  create: (x = 0, y = 0, z = 0): Vec3 => ({ x, y, z }),
  add: (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }),
  sub: (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }),
  scale: (a: Vec3, s: number): Vec3 => ({ x: a.x * s, y: a.y * s, z: a.z * s }),
  dot: (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z,
  cross: (a: Vec3, b: Vec3): Vec3 => ({
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  }),
  len: (a: Vec3): number => Math.hypot(a.x, a.y, a.z),
  dist: (a: Vec3, b: Vec3): number => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z),
  normalize: (a: Vec3): Vec3 => {
    const l = Math.hypot(a.x, a.y, a.z);
    return l > 1e-12 ? { x: a.x / l, y: a.y / l, z: a.z / l } : { x: 0, y: 1, z: 0 };
  },
};

function indexToLetters(index: number): string {
  let s = '';
  let n = index;
  while (n >= 0) {
    s = String.fromCharCode((n % 26) + 65) + s;
    n = Math.floor(n / 26) - 1;
  }
  return s;
}

// ============================================================================
// Core Generator Function
// ============================================================================

export function generateGeodesicDome(params: DomeParams): GeodesicDomeResult {
  const V = Math.max(1, Math.round(params.frequency));
  const R = params.diameter / 2;
  const tol = params.toleranceMm ?? 0.25;
  const truncateRatio = params.truncateRatio ?? 1.0;
  const yCutoff = R * (1 - 2 * truncateRatio);

  // 1. Base Icosahedron (Zenith-Up along +Y axis)
  const s5 = Math.sqrt(5);
  const yRing = 1 / s5;
  const rRing = 2 / s5;

  const baseVerts: Vec3[] = [{ x: 0, y: 1, z: 0 }]; // 0: Zenith
  for (let k = 0; k < 5; k++) {
    const a = (2 * Math.PI * k) / 5;
    baseVerts.push({ x: rRing * Math.cos(a), y: yRing, z: rRing * Math.sin(a) });
  }
  for (let k = 0; k < 5; k++) {
    const a = (2 * Math.PI * k) / 5 + Math.PI / 5;
    baseVerts.push({ x: rRing * Math.cos(a), y: -yRing, z: rRing * Math.sin(a) });
  }
  baseVerts.push({ x: 0, y: -1, z: 0 }); // 11: Nadir

  const baseFaces: [number, number, number][] = [
    // Top 5 faces around Zenith
    [0, 1, 2], [0, 2, 3], [0, 3, 4], [0, 4, 5], [0, 5, 1],
    // Middle 10 equatorial faces
    [1, 6, 2], [2, 6, 7], [2, 7, 3], [3, 7, 8], [3, 8, 4],
    [4, 8, 9], [4, 9, 5], [5, 9, 10], [5, 10, 1], [1, 10, 6],
    // Bottom 5 faces around Nadir
    [11, 7, 6], [11, 8, 7], [11, 9, 8], [11, 10, 9], [11, 6, 10],
  ];

  // 2. Subdivide by Frequency V & Project to Sphere R
  const vertices: Vec3[] = [];
  const vertMap = new Map<string, number>();

  function getOrAddVertex(p: Vec3): number {
    const u = V3.normalize(p);
    const sp = V3.scale(u, R);
    const key = `${Math.round(sp.x * 100)},${Math.round(sp.y * 100)},${Math.round(sp.z * 100)}`;
    const existing = vertMap.get(key);
    if (existing !== undefined) return existing;
    const idx = vertices.length;
    vertices.push(sp);
    vertMap.set(key, idx);
    return idx;
  }

  const rawTriangles: [number, number, number][] = [];

  for (const [ia, ib, ic] of baseFaces) {
    const A = baseVerts[ia];
    const B = baseVerts[ib];
    const C = baseVerts[ic];

    const grid: number[][] = [];
    for (let i = 0; i <= V; i++) {
      grid[i] = [];
      for (let j = 0; j <= V - i; j++) {
        const k = V - i - j;
        const p: Vec3 = {
          x: (k * A.x + i * B.x + j * C.x) / V,
          y: (k * A.y + i * B.y + j * C.y) / V,
          z: (k * A.z + i * B.z + j * C.z) / V,
        };
        grid[i][j] = getOrAddVertex(p);
      }
    }

    for (let i = 0; i < V; i++) {
      for (let j = 0; j < V - i; j++) {
        rawTriangles.push([grid[i][j], grid[i + 1][j], grid[i][j + 1]]);
        if (i + j < V - 1) {
          rawTriangles.push([grid[i + 1][j], grid[i + 1][j + 1], grid[i][j + 1]]);
        }
      }
    }
  }

  // 3. Apply Truncation Filter
  const activeTriIndices = rawTriangles.filter(([v1, v2, v3]) => {
    if (truncateRatio >= 0.999) return true;
    const cy = (vertices[v1].y + vertices[v2].y + vertices[v3].y) / 3;
    return cy >= yCutoff - 1e-3;
  });

  // Remap only used vertices
  const usedVertMap = new Map<number, number>();
  const finalVertices: Vec3[] = [];
  for (const tri of activeTriIndices) {
    for (const vOld of tri) {
      if (!usedVertMap.has(vOld)) {
        usedVertMap.set(vOld, finalVertices.length);
        finalVertices.push({ ...vertices[vOld] });
      }
    }
  }

  const mappedTriangles: [number, number, number][] = activeTriIndices.map(([a, b, c]) => [
    usedVertMap.get(a)!,
    usedVertMap.get(b)!,
    usedVertMap.get(c)!,
  ]);

  // Ensure outward CCW normal winding on all faces
  for (const tri of mappedTriangles) {
    const p1 = finalVertices[tri[0]];
    const p2 = finalVertices[tri[1]];
    const p3 = finalVertices[tri[2]];
    const n = V3.cross(V3.sub(p2, p1), V3.sub(p3, p1));
    const c = V3.add(V3.add(p1, p2), p3);
    if (V3.dot(n, c) < 0) {
      const tmp = tri[1];
      tri[1] = tri[2];
      tri[2] = tmp;
    }
  }

  // Optional: Snap boundary ring vertices to a flat horizontal base plane
  const edgeFaceCounts = new Map<string, number>();
  for (const [a, b, c] of mappedTriangles) {
    for (const [u, v] of [[a, b], [b, c], [c, a]]) {
      const k = u < v ? `${u}_${v}` : `${v}_${u}`;
      edgeFaceCounts.set(k, (edgeFaceCounts.get(k) ?? 0) + 1);
    }
  }

  const boundaryVertices = new Set<number>();
  for (const [k, count] of edgeFaceCounts.entries()) {
    if (count === 1) {
      const [u, v] = k.split('_').map(Number);
      boundaryVertices.add(u);
      boundaryVertices.add(v);
    }
  }

  if (params.flatBaseSnap && boundaryVertices.size > 0 && truncateRatio < 0.999) {
    let avgBoundaryY = 0;
    boundaryVertices.forEach((vIdx) => (avgBoundaryY += finalVertices[vIdx].y));
    avgBoundaryY /= boundaryVertices.size;
    boundaryVertices.forEach((vIdx) => {
      finalVertices[vIdx].y = avgBoundaryY;
    });
  }

  // 4. Build Struts, Zero-Torsion Coordinate Frames & Strut Taxonomy
  const edgeMap = new Map<string, number>();
  const struts: StrutEdge[] = [];

  function getOrCreateEdge(u: number, v: number, faceId: number): number {
    const v1 = Math.min(u, v);
    const v2 = Math.max(u, v);
    const key = `${v1}_${v2}`;
    const existing = edgeMap.get(key);
    if (existing !== undefined) {
      struts[existing].adjacentFaces.push(faceId);
      return existing;
    }

    const p1 = finalVertices[v1];
    const p2 = finalVertices[v2];
    const length = V3.dist(p1, p2);
    const mid = V3.scale(V3.add(p1, p2), 0.5);
    const zAxis = V3.normalize(V3.sub(p2, p1));
    // Great-Circle radial outward vector orthogonalized to zAxis (Zero-Torsion Y)
    const radialProj = V3.sub(mid, V3.scale(zAxis, V3.dot(mid, zAxis)));
    const yAxis = V3.normalize(radialProj);
    const xAxis = V3.normalize(V3.cross(yAxis, zAxis));

    const idx = struts.length;
    struts.push({
      id: idx,
      v1,
      v2,
      length,
      chordFactor: length / R,
      taxonomyId: '',
      frame: { origin: mid, xAxis, yAxis, zAxis },
      dihedralAngleDeg: 0,
      bevelAngleDeg: 0,
      adjacentFaces: [faceId],
    });
    edgeMap.set(key, idx);
    return idx;
  }

  const faces: TriangleFace[] = mappedTriangles.map(([a, b, c], fIdx) => {
    const e1 = getOrCreateEdge(a, b, fIdx);
    const e2 = getOrCreateEdge(b, c, fIdx);
    const e3 = getOrCreateEdge(c, a, fIdx);
    const p1 = finalVertices[a];
    const p2 = finalVertices[b];
    const p3 = finalVertices[c];
    const normal = V3.normalize(V3.cross(V3.sub(p2, p1), V3.sub(p3, p1)));
    const centroid = V3.scale(V3.add(V3.add(p1, p2), p3), 1 / 3);
    return {
      id: fIdx,
      vertices: [a, b, c],
      edges: [e1, e2, e3],
      edgeClasses: ['', '', ''],
      normal,
      centroid,
      taxonomyId: '',
    };
  });

  // Classify Strut Lengths into 'A', 'B', 'C'...
  const uniqueLengths: number[] = [];
  const sortedStruts = [...struts].sort((a, b) => a.length - b.length);
  for (const s of sortedStruts) {
    let groupIdx = uniqueLengths.findIndex((L) => Math.abs(L - s.length) <= tol);
    if (groupIdx === -1) {
      groupIdx = uniqueLengths.length;
      uniqueLengths.push(s.length);
    }
    s.taxonomyId = indexToLetters(groupIdx);
  }

  // Compute Dihedral & Saw Bevel Angles on every Strut
  for (const s of struts) {
    if (s.adjacentFaces.length === 2) {
      const n1 = faces[s.adjacentFaces[0]].normal;
      const n2 = faces[s.adjacentFaces[1]].normal;
      const dot = Math.max(-1, Math.min(1, V3.dot(n1, n2)));
      s.dihedralAngleDeg = Math.acos(dot) * DEG_PER_RAD;
      s.bevelAngleDeg = s.dihedralAngleDeg / 2;
    }
  }

  const strutTaxonomy: StrutArchetype[] = uniqueLengths.map((len, idx) => {
    const id = indexToLetters(idx);
    const matching = struts.filter((s) => s.taxonomyId === id);
    const avgLen = matching.reduce((acc, s) => acc + s.length, 0) / matching.length;
    return {
      id,
      length: Number(avgLen.toFixed(2)),
      chordFactor: Number((avgLen / R).toFixed(6)),
      count: matching.length,
    };
  });

  // 5. Build Triangle Panel Taxonomy & 2D Unfolded Coordinates
  const triArchetypeMap = new Map<string, TriangleArchetype>();

  for (const f of faces) {
    const [e1, e2, e3] = f.edges.map((eid) => struts[eid]);
    const c1 = e1.taxonomyId;
    const c2 = e2.taxonomyId;
    const c3 = e3.taxonomyId;
    f.edgeClasses = [c1, c2, c3];

    // Canonical cyclic rotation of (c1, c2, c3) preserving CCW orientation
    const rots: [string, string, string][] = [
      [c1, c2, c3],
      [c2, c3, c1],
      [c3, c1, c2],
    ];
    rots.sort((x, y) => x.join('-').localeCompare(y.join('-')));
    const canonicalCCW = rots[0];
    const sigCCW = canonicalCCW.join('-');

    // Check mirror orientation for chirality (when all 3 edges are distinct)
    const isScalene = c1 !== c2 && c2 !== c3 && c3 !== c1;

    if (!triArchetypeMap.has(sigCCW)) {
      const [a, b, c] = [e1.length, e2.length, e3.length];
      // 2D unfolding via Law of Cosines
      const x3 = (a * a + c * c - b * b) / (2 * a);
      const y3 = Math.sqrt(Math.max(0, c * c - x3 * x3));
      const v2d: [Vec2, Vec2, Vec2] = [
        { x: 0, y: 0 },
        { x: Number(a.toFixed(2)), y: 0 },
        { x: Number(x3.toFixed(2)), y: Number(y3.toFixed(2)) },
      ];
      const areaMm2 = 0.5 * a * y3;

      const angleA = Math.acos((b * b + c * c - a * a) / (2 * b * c)) * DEG_PER_RAD;
      const angleB = Math.acos((a * a + c * c - b * b) / (2 * a * c)) * DEG_PER_RAD;
      const angleC = 180 - angleA - angleB;

      const archId = `T${triArchetypeMap.size + 1}${isScalene ? 'L' : ''}`;
      triArchetypeMap.set(sigCCW, {
        id: archId,
        signature: sigCCW,
        isChiral: isScalene,
        hand: isScalene ? 'L' : undefined,
        count: 0,
        edgeClasses: [c1, c2, c3],
        edgeLengths: [
          Number(a.toFixed(2)),
          Number(b.toFixed(2)),
          Number(c.toFixed(2)),
        ],
        bevelAnglesDeg: [
          Number(e1.bevelAngleDeg.toFixed(2)),
          Number(e2.bevelAngleDeg.toFixed(2)),
          Number(e3.bevelAngleDeg.toFixed(2)),
        ],
        interiorAnglesDeg: [
          Number(angleC.toFixed(2)),
          Number(angleA.toFixed(2)),
          Number(angleB.toFixed(2)),
        ],
        vertices2D: v2d,
        areaMm2: Number(areaMm2.toFixed(1)),
      });
    }

    const arch = triArchetypeMap.get(sigCCW)!;
    arch.count++;
    f.taxonomyId = arch.id;
  }

  const triangleTaxonomy = Array.from(triArchetypeMap.values());

  // 6. Build Vertex Node Taxonomy (Canonical Cyclic Angle Signatures)
  const vertStruts: number[][] = finalVertices.map(() => []);
  struts.forEach((s, idx) => {
    vertStruts[s.v1].push(idx);
    vertStruts[s.v2].push(idx);
  });

  const nodeArchetypeMap = new Map<string, NodeArchetype>();
  const nodes: DomeVertexNode[] = finalVertices.map((pos, vIdx) => {
    const normal = V3.normalize(pos);
    // Construct arbitrary tangent plane basis (T1, T2) perpendicular to normal
    const ref = Math.abs(normal.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
    const t1 = V3.normalize(V3.cross(ref, normal));
    const t2 = V3.normalize(V3.cross(normal, t1));

    const connectedStrutIds = vertStruts[vIdx];
    const rawArms: NodeArmSpec[] = connectedStrutIds.map((sId) => {
      const s = struts[sId];
      const nb = s.v1 === vIdx ? s.v2 : s.v1;
      const dir = V3.normalize(V3.sub(finalVertices[nb], pos));
      const coneRad = Math.acos(Math.max(-1, Math.min(1, V3.dot(normal, dir))));
      const coneAngleDeg = coneRad * DEG_PER_RAD;
      const dropAngleDeg = coneAngleDeg - 90;

      // Project onto tangent plane for clockwise azimuth sorting
      const px = V3.dot(dir, t1);
      const py = V3.dot(dir, t2);
      let az = Math.atan2(py, px) * DEG_PER_RAD;
      if (az < 0) az += 360;

      return {
        strutIndex: sId,
        neighborVertex: nb,
        strutClass: s.taxonomyId,
        azimuthDeg: az,
        deltaAzimuthDeg: 0,
        coneAngleDeg: Number(coneAngleDeg.toFixed(2)),
        dropAngleDeg: Number(dropAngleDeg.toFixed(2)),
        localDirection: dir,
      };
    });

    rawArms.sort((a, b) => a.azimuthDeg - b.azimuthDeg);
    const m = rawArms.length;
    for (let i = 0; i < m; i++) {
      const nextAz = i + 1 < m ? rawArms[i + 1].azimuthDeg : rawArms[0].azimuthDeg + 360;
      rawArms[i].deltaAzimuthDeg = Number((nextAz - rawArms[i].azimuthDeg).toFixed(1));
    }

    // Build canonical cyclic signature of (strutClass:deltaAzimuth:dropAngle)
    const tokens = rawArms.map(
      (a) => `${a.strutClass}:${a.deltaAzimuthDeg.toFixed(1)}:${a.dropAngleDeg.toFixed(1)}`
    );
    const cyclicSignatures: string[] = [];
    for (let i = 0; i < m; i++) {
      const rotated = [...tokens.slice(i), ...tokens.slice(0, i)].join('|');
      cyclicSignatures.push(rotated);
    }
    cyclicSignatures.sort();
    const canonicalSig = `${m}W_${boundaryVertices.has(vIdx) ? 'B' : 'I'}_${cyclicSignatures[0]}`;

    if (!nodeArchetypeMap.has(canonicalSig)) {
      const prefix = boundaryVertices.has(vIdx) ? `N${m}_Base_` : `N${m}_`;
      const archId = `${prefix}${nodeArchetypeMap.size + 1}`;
      nodeArchetypeMap.set(canonicalSig, {
        id: archId,
        valence: m,
        isBoundary: boundaryVertices.has(vIdx),
        signature: canonicalSig,
        count: 0,
        representativeVertexId: vIdx,
        arms: rawArms,
      });
    }

    const nodeArch = nodeArchetypeMap.get(canonicalSig)!;
    nodeArch.count++;

    return {
      id: vIdx,
      position: pos,
      normal,
      isBoundary: boundaryVertices.has(vIdx),
      valence: m,
      arms: rawArms,
      taxonomyId: nodeArch.id,
    };
  });

  // 7. Build Dual Goldberg Polyhedron (100% Coplanar Hexagons & Pentagons)
  const vertFaces: number[][] = finalVertices.map(() => []);
  faces.forEach((f, fIdx) => {
    f.vertices.forEach((v) => vertFaces[v].push(fIdx));
  });

  const goldbergPolygons: GoldbergPolygon[] = [];
  const goldbergArchetypeMap = new Map<string, GoldbergArchetype>();

  finalVertices.forEach((vPos, vIdx) => {
    if (boundaryVertices.has(vIdx)) return; // Only interior full-ring vertices form closed hex/pent cells
    const fIds = vertFaces[vIdx];
    if (fIds.length < 5) return;

    const normal = V3.normalize(vPos);
    const ref = Math.abs(normal.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
    const t1 = V3.normalize(V3.cross(ref, normal));
    const t2 = V3.normalize(V3.cross(normal, t1));

    // Project each surrounding face's normal ray onto the vertex's tangent plane X . normal = R
    const ptsWithAngle = fIds.map((fId) => {
      const fn = faces[fId].normal;
      const denom = Math.max(1e-6, V3.dot(fn, normal));
      const p3d = V3.scale(fn, R / denom); // Guaranteed coplanar on plane X . normal = R
      const rel = V3.sub(p3d, vPos);
      const x2 = V3.dot(rel, t1);
      const y2 = V3.dot(rel, t2);
      const angle = Math.atan2(y2, x2);
      return { p3d, x2, y2, angle };
    });

    ptsWithAngle.sort((a, b) => a.angle - b.angle);
    const sides = ptsWithAngle.length;
    const poly3D = ptsWithAngle.map((p) => p.p3d);
    const poly2D: Vec2[] = ptsWithAngle.map((p) => ({
      x: Number(p.x2.toFixed(2)),
      y: Number(p.y2.toFixed(2)),
    }));

    const edgeLengths: number[] = [];
    for (let i = 0; i < sides; i++) {
      const next = (i + 1) % sides;
      edgeLengths.push(Number(V3.dist(poly3D[i], poly3D[next]).toFixed(1)));
    }

    // Canonical cyclic edge-length signature for Goldberg taxonomy
    const roundedTokens = edgeLengths.map((L) => (Math.round(L / tol) * tol).toFixed(1));
    const cyc: string[] = [];
    for (let i = 0; i < sides; i++) {
      cyc.push([...roundedTokens.slice(i), ...roundedTokens.slice(0, i)].join('-'));
    }
    cyc.sort();
    const gSig = `${sides}_${cyc[0]}`;

    if (!goldbergArchetypeMap.has(gSig)) {
      const prefix = sides === 5 ? 'P' : 'H';
      const existingCount = Array.from(goldbergArchetypeMap.values()).filter(
        (a) => a.sides === sides
      ).length;
      goldbergArchetypeMap.set(gSig, {
        id: `${prefix}${existingCount + 1}`,
        sides,
        count: 0,
        edgeLengths,
        vertices2D: poly2D,
      });
    }

    const gArch = goldbergArchetypeMap.get(gSig)!;
    gArch.count++;

    goldbergPolygons.push({
      id: goldbergPolygons.length,
      centerVertexId: vIdx,
      sides,
      vertices3D: poly3D,
      normal,
      taxonomyId: gArch.id,
    });
  });

  return {
    params,
    vertices: finalVertices,
    struts,
    strutTaxonomy,
    faces,
    triangleTaxonomy,
    nodes,
    nodeTaxonomy: Array.from(nodeArchetypeMap.values()),
    goldbergPolygons,
    goldbergTaxonomy: Array.from(goldbergArchetypeMap.values()),
  };
}

// ============================================================================
// 2D Fabrication Exporters (SVG & ASCII DXF R12 for Triangle Taxonomy)
// ============================================================================

export function exportTriangleTaxonomySVG(dome: GeodesicDomeResult, paddingMm = 60): string {
  const archetypes = dome.triangleTaxonomy;
  let cursorX = paddingMm;
  let maxHeight = 0;

  const groups: string[] = [];

  for (const arch of archetypes) {
    const [p1, p2, p3] = arch.vertices2D;
    const minX = Math.min(p1.x, p2.x, p3.x);
    const maxX = Math.max(p1.x, p2.x, p3.x);
    const maxY = Math.max(p1.y, p2.y, p3.y);
    const width = maxX - minX;
    maxHeight = Math.max(maxHeight, maxY);

    const ox = cursorX - minX;
    const oy = paddingMm + maxY; // Flip Y for standard SVG top-down coordinates

    const v1 = { x: ox + p1.x, y: oy - p1.y };
    const v2 = { x: ox + p2.x, y: oy - p2.y };
    const v3 = { x: ox + p3.x, y: oy - p3.y };
    const cx = (v1.x + v2.x + v3.x) / 3;
    const cy = (v1.y + v2.y + v3.y) / 3;

    // Edge midpoints for engraving strut class & bevel callouts
    const m12 = { x: (v1.x + v2.x) / 2, y: (v1.y + v2.y) / 2 - 8 };
    const m23 = { x: (v2.x + v3.x) / 2 + 10, y: (v2.y + v3.y) / 2 };
    const m31 = { x: (v3.x + v1.x) / 2 - 10, y: (v3.y + v1.y) / 2 };

    groups.push(`
    <g id="${arch.id}">
      <!-- Outer Laser/CNC Cut Path (Red) -->
      <polygon points="${v1.x.toFixed(2)},${v1.y.toFixed(2)} ${v2.x.toFixed(2)},${v2.y.toFixed(2)} ${v3.x.toFixed(2)},${v3.y.toFixed(2)}"
               fill="none" stroke="#ff0000" stroke-width="1.5" />
      <!-- Etch / Score Part Taxonomy & Edge Bevel Labels (Blue) -->
      <text x="${cx.toFixed(2)}" y="${cy.toFixed(2)}" fill="#0044ff" font-family="monospace" font-size="18" text-anchor="middle">
        ${arch.id} (Qty: ${arch.count})
      </text>
      <text x="${m12.x.toFixed(2)}" y="${m12.y.toFixed(2)}" fill="#0044ff" font-family="monospace" font-size="12" text-anchor="middle">
        ${arch.edgeClasses[0]}: ${arch.edgeLengths[0]}mm (${arch.bevelAnglesDeg[0]}° bevel)
      </text>
      <text x="${m23.x.toFixed(2)}" y="${m23.y.toFixed(2)}" fill="#0044ff" font-family="monospace" font-size="12" text-anchor="start">
        ${arch.edgeClasses[1]}: ${arch.edgeLengths[1]}mm (${arch.bevelAnglesDeg[1]}°)
      </text>
      <text x="${m31.x.toFixed(2)}" y="${m31.y.toFixed(2)}" fill="#0044ff" font-family="monospace" font-size="12" text-anchor="end">
        ${arch.edgeClasses[2]}: ${arch.edgeLengths[2]}mm (${arch.bevelAnglesDeg[2]}°)
      </text>
    </g>`);

    cursorX += width + paddingMm * 1.5;
  }

  const totalW = Math.ceil(cursorX + paddingMm);
  const totalH = Math.ceil(maxHeight + paddingMm * 2.5);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${totalW}mm" height="${totalH}mm" viewBox="0 0 ${totalW} ${totalH}">
  ${groups.join('\n')}
</svg>`;
}

export function exportTriangleTaxonomyDXF(dome: GeodesicDomeResult, spacingMm = 100): string {
  const lines: string[] = [
    '0', 'SECTION',
    '2', 'ENTITIES',
  ];

  function addLine(x1: number, y1: number, x2: number, y2: number, layer = 'CUT') {
    lines.push(
      '0', 'LINE',
      '8', layer,
      '10', x1.toFixed(4),
      '20', y1.toFixed(4),
      '30', '0.0',
      '11', x2.toFixed(4),
      '21', y2.toFixed(4),
      '31', '0.0'
    );
  }

  function addText(x: number, y: number, text: string, height = 15, layer = 'ETCH') {
    lines.push(
      '0', 'TEXT',
      '8', layer,
      '10', x.toFixed(4),
      '20', y.toFixed(4),
      '30', '0.0',
      '40', height.toFixed(2),
      '1', text
    );
  }

  let cursorX = 0;
  for (const arch of dome.triangleTaxonomy) {
    const [p1, p2, p3] = arch.vertices2D;
    const minX = Math.min(p1.x, p2.x, p3.x);
    const maxX = Math.max(p1.x, p2.x, p3.x);
    const ox = cursorX - minX;

    const v1 = { x: ox + p1.x, y: p1.y };
    const v2 = { x: ox + p2.x, y: p2.y };
    const v3 = { x: ox + p3.x, y: p3.y };

    addLine(v1.x, v1.y, v2.x, v2.y, 'CUT');
    addLine(v2.x, v2.y, v3.x, v3.y, 'CUT');
    addLine(v3.x, v3.y, v1.x, v1.y, 'CUT');

    const cx = (v1.x + v2.x + v3.x) / 3;
    const cy = (v1.y + v2.y + v3.y) / 3;
    addText(cx, cy, `${arch.id} QTY:${arch.count} (${arch.signature})`, 16, 'ETCH');

    cursorX += (maxX - minX) + spacingMm;
  }

  lines.push('0', 'ENDSEC', '0', 'EOF');
  return lines.join('\n');
}
```

---

## 5. CAD Integration Templates (Onshape & Fusion 360)

### 5.1 Onshape FeatureScript Architecture (Master-Instance Patterning)
When translating the TypeScript logic above into Onshape FeatureScript:
1. **Inputs (`precondition`):**
   * `annotation { "Name" : "Frequency V" } isInteger(definition.v, { (unitless) : [1, 3, 6] });`
   * `annotation { "Name" : "Diameter" } isLength(definition.diameter, LENGTH_BOUNDS);`
   * `annotation { "Name" : "Beam Profile Sketch", "Filter" : EntityType.FACE, "MaxNumberOfPicks" : 1 } definition.beamProfile is Query;`
2. **Zero-Torsion Beam Sweeps or Extrusions:**
   * Rather than calling `opSweep` 250 times, create **1 master strut body per `StrutArchetype`** (`A`, `B`, `C`) at the origin along $+Z$, and call `opPattern` with an array of `Transform` objects constructed from each strut's `(xAxis, yAxis, zAxis, origin)`.
3. **Custom Node Table (`defineTable`):**
   * Bind a companion FeatureScript `defineTable` function to read the computed `strutTaxonomy`, `triangleTaxonomy`, and `nodeTaxonomy` arrays into a native Onshape BOM table.

### 5.2 Fusion 360 Python Add-In Architecture
When packaging for the Autodesk Design & Make Marketplace:
1. **Startup Performance Rule (`< 0.005s`):** Keep `run(context)` limited to registering the `CommandCreatedEventHandler` button inside `SolidCreatePanel`. Import `math` and geometry modules lazily inside the `CommandExecuteHandler`.
2. **Component Instancing for Nodes:**
   * Create one `adsk.fusion.Component` per `NodeArchetype` (`N5_1`, `N6_1`...).
   * Construct the 3D socket body inside that component once using `ExtrudeFeatures` and `CombineFeatures`.
   * Place instances across the dome vertices using `rootComp.occurrences.addExistingComponent(nodeComp, matrix3d)` where `matrix3d.setWithCoordinateSystem(vertexPos, t1, t2, normal)`.

---

## 6. Recommended Next Steps for Local Agent Implementation
1. **Scaffold a Vite + TypeScript + Three.js Web App** and drop `geodesicEngine.ts` into `src/core/geodesicEngine.ts`.
2. **Wire Up the 3D Viewport:** Use `THREE.InstancedMesh` keyed by `strutTaxonomy` and `nodeTaxonomy` so changing $V$ or Diameter updates at 60 FPS.
3. **Bind the 2D Blueprint Drawer:** Render the SVG string returned by `exportTriangleTaxonomySVG()` directly in a live split-pane preview with one-click `.svg` and `.dxf` download buttons.
4. **Optional 3D Hub STL Exporter:** Add `manifold-3d` to boolean-union socket cylinders along each `NodeArchetype.arms` vector and export watertight `.stl` files for every unique hub in the taxonomy.