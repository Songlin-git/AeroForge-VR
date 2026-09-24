# Webpage field preprocessing and provenance

## Preview assets

This document records the independently computed visualization assets used by
the Shape Prior Explorer. Source ModelNet40 OFF meshes are converted into
voxel-derived distance approximations and zero isosurfaces for interactive
inspection. These are webpage preview fields rather than exported AeroForge
backend tensors.

The author-provided manuscript describes a 64 × 64 × 64 input SDF from a
participant-authored primitive blockout. The same input SDF queries a
preprocessed airplane library; the input SDF and retrieved airplane priors
jointly condition generation (Section 2.2; Figure 2).

## Source assets

- 46 selected OFF files: 15 original train items and 31 original test items.
- The separate full airplane metadata CSV contains 726 rows, four fields,
  and the original 626 train / 100 test split labels.
- SHA-256 checksums, source topology checks, display geometry sizes, and field
  diagnostics are in `static/data/field-provenance.json` and `static/js/modelnet-data.js`.
- Only existing preview models receive a 3D button in the full metadata table.
- Original source bytes are preserved inside `static/data/modelnet40-airplane-subset.zip`.
  Its enclosed CSV has 46 rows, matching the files in that ZIP. It does not
  misleadingly list all 726 records as packaged source files.
- Metadata split labels are not an assertion that the backend trained,
  retrieved, or evaluated on any particular partition.

## Normalized coordinate system

For original source vertex `v`, let `c=(bbox_min+bbox_max)/2` and
`s=2/max(bbox_max-bbox_min)`. First compute `(v-c)*s`, then apply the
right-handed axis rotation `(x,y,z) -> (x,z,-y)` to obtain Y-up display
coordinates. This axis-aligned normalization is a **webpage-only choice**,
not a claim about the backend's canonicalization procedure. Distances are
in normalized units, not metres or original CAD units.

The grid comprises 64 samples per axis, from -1.15 to +1.15 inclusive.
Spacing is `h=2.3/63`; storage is C-order `[x,y,z]`.

## Voxel-derived approximate SDF

1. Use **all source triangles**, not the rendering proxy, for conservative
   triangle–voxel intersection (separating-axis triangle/box tests).
2. Mark grid cells intersecting the source surface.
3. Use exterior flood-fill (`scipy.ndimage.binary_fill_holes`) to fill
   enclosed voxel cavities. No learned model, retrieval code, or diffusion
   checkpoint is used.
4. Compute cell-centred Euclidean distance transforms. For occupied cells,
   `d = -EDT(occupied)*h + h/2`; for unoccupied cells,
   `d = EDT(not occupied)*h - h/2`. In the implementation EDT receives `h`
   through its sampling argument, so `h` is applied only once.
5. Negative means **inside this voxelized solid** and positive means outside.

This is a grid-based approximation to a continuous SDF of a voxelized
solid. It is **not** an exact signed distance to the original triangle
surface. Conservative voxelization can thicken, join, or omit sub-grid
geometric features; flood-fill can close voxel-scale cavities. The
unprocessed OFF inputs are not assumed to have well-defined watertight
interiors. Source topology checks are reported, not interpreted as a
proof of the continuous sign field's validity.

The browser displays 16-bit quantized field samples. Each asset carries
its own dequantization scale; maximum absolute storage error is recorded
per model. Downloads contain the unquantized float32 field, occupancy,
source transform, grid origin, spacing, and a provenance string in NPZ.
Color saturation is controlled by the displayed ± range; clipping the
color scale does **not** alter the stored distances. Hover reports actual
sample values. The initial slice is chosen through the largest occupied
cross-section for the selected plane normal.

## Surface, wireframe, and zero isosurface

- The source surface uses deterministic vertex clustering on a 128³
  display grid. Faces collapsing to zero area are removed, duplicate faces
  are consolidated, and normals are recomputed. No random triangle dropping
  or point-cloud approximation is used.
- Wireframe shows the edges of that **display proxy**, not the full source
  mesh topology. Source statistics remain separately labelled.
- Marching Cubes at `d=0` produces the diagnostic zero isosurface. This is
  an illustration of field-to-mesh extraction, not generated aircraft
  geometry or evidence of reconstruction quality.
- WebGL is the preferred renderer. A depth-buffered Canvas 3D renderer
  provides actual orbitable geometry and textured slice planes when WebGL
  is unavailable. Both paths use the same asset, field and camera controls.

## Rebuild

A Python environment is needed only to regenerate assets, not to view the page.

```bash
python -m pip install -r tools/requirements.txt
python tools/precompute_fields.py \
  --off-root /path/to/extracted/airplane \
  --metadata /path/to/metadata_modelnet40.csv \
  --site-root .
```

The tool verifies file IDs against the metadata, rebuilds mesh proxies,
field previews, NPZ files, the source ZIP, JSON provenance and browser data.
The site text assumes the supplied 46-model subset and 726-row metadata;
edit the human-readable count labels when rebuilding with a different subset.

## References for the visualization method

SciPy Euclidean distance transform:
https://docs.scipy.org/doc/scipy/reference/generated/scipy.ndimage.distance_transform_edt.html

Open3D discussion of distance queries and watertightness assumptions:
https://www.open3d.org/docs/latest/tutorial/geometry/distance_queries.html

ModelNet source and attribution:
https://modelnet.cs.princeton.edu/

The source manuscript's citations remain authoritative for AeroForge itself.
