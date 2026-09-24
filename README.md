# AeroForge VR: Design-to-Flight

Project page for **AeroForge VR: Design-to-Flight**, accepted as a demonstration at the **2026 IEEE International Symposium on Mixed and Augmented Reality (ISMAR 2026)**.

**Authors:** Songlin Shang, Yushen Hu  
**Affiliation:** University of Minnesota – Twin Cities

## Project page

After GitHub Pages is enabled for this repository, the site is intended to be available at:

`https://songlin-git.github.io/AeroForge-VR/`

## Website contents

- Demo video (self-hosted MP4)
- Paper PDF
- Design-to-flight pipeline
- Interactive ModelNet40 airplane shape-prior explorer
- Surface / SDF slice / zero-isosurface / wireframe views
- Airplane-only metadata browser
- BibTeX citation

## Repository structure

```text
index.html
.nojekyll
PREPROCESSING.md
static/
  css/
  js/
  assets/
  fields/
  data/
  images/
  pdf/
  videos/
```

## Local preview

Open `index.html` directly, or run a local static server:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## Data note

The project page includes a representative subset of ModelNet40 airplane meshes for interactive visualization. The SDF previews shown in the explorer are voxel-derived approximations computed from the source OFF meshes for visualization. See `PREPROCESSING.md` for details.
