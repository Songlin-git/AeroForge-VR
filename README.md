<h1 align="center">AeroForge VR: Design-to-Flight</h1>

<p align="center">
  <strong>2026 IEEE International Symposium on Mixed and Augmented Reality</strong><br>
  Accepted demonstration
</p>

<p align="center">
  <a href="mailto:shang217@umn.edu">Songlin Shang</a> ·
  <a href="mailto:hu000809@umn.edu">Yushen Hu</a><br>
  University of Minnesota – Twin Cities
</p>

<p align="center">
  <a href="https://songlin-git.github.io/AeroForge-VR/"><img src="https://img.shields.io/badge/Project-Page-245f91" alt="Project page"></a>
  <a href="static/pdf/aeroforge-vr-ismar-2026-demo.pdf"><img src="https://img.shields.io/badge/Paper-PDF-9a334a" alt="Paper PDF"></a>
  <a href="https://songlin-git.github.io/AeroForge-VR/#video"><img src="https://img.shields.io/badge/Video-Demo-555555" alt="Demo video"></a>
  <a href="https://songlin-git.github.io/AeroForge-VR/#dataset"><img src="https://img.shields.io/badge/Explorer-3D_%2B_SDF-497566" alt="3D and SDF explorer"></a>
</p>

<p align="center">
  <a href="https://songlin-git.github.io/AeroForge-VR/#video">
    <img src="static/images/demo-poster.jpg" alt="AeroForge VR demo video — open the project page to watch" width="960">
  </a>
</p>
<p align="center"><em>Watch the demo on the project page.</em></p>

<p align="center">
  <a href="#abstract">Abstract</a> ·
  <a href="#method">Method</a> ·
  <a href="#interactive-data">Interactive data</a> ·
  <a href="#quick-start">Quick start</a> ·
  <a href="#citation">Citation</a>
</p>

## Abstract

AeroForge VR is designed as an entry point to 3D authoring for participants with limited experience using conventional 3D modeling tools. Participants assemble and transform primitives to express an aircraft’s coarse spatial structure and proportions. The system encodes the blockout as a signed distance field (SDF) and retrieves airplane priors. Both condition a 3D diffusion model. After generation, participants navigate their aircraft through a cloudscape and paint mountain terrain. They experience their generated aircraft in motion and explore its spatial form from multiple viewpoints. This design-to-flight workflow integrates spatial authoring, structure-conditioned generation, and in-headset interaction into an immersive creative experience.

## Method

<p align="center">
  <a href="static/images/aeroforge-pipeline.png">
    <img src="static/images/aeroforge-pipeline.png" alt="AeroForge aircraft-generation pipeline: user-authored input SDF and retrieved airplane priors jointly condition 3D diffusion, followed by depth refinement, SDF fusion, and Marching Cubes" width="100%">
  </a>
</p>
<p align="center"><em>Aircraft-generation pipeline. Figure 2 from the paper.</em></p>

**User-authored structure.** Participants assemble boxes, cylinders, and spheres in VR. The blockout is canonicalized and sampled on a **64 × 64 × 64 grid**, producing an input SDF that encodes component layout and proportions.

**Retrieved shape priors.** The same input SDF queries a preprocessed **ModelNet40 airplane** library. The retrieved airplane shapes and the input SDF jointly condition the 3D diffusion model.

**Refinement and return to VR.** The coarse aircraft SDF is rendered from six canonical viewpoints. Refined depth maps are fused into an SDF volume, and Marching Cubes extracts the mesh returned to the Quest 3 application for flight and terrain painting.

## Interactive data

This repository hosts the project website and its browser-based visualization assets. Open the [Shape Prior Explorer](https://songlin-git.github.io/AeroForge-VR/#dataset) or [Airplane Metadata browser](https://songlin-git.github.io/AeroForge-VR/#metadata) to inspect the data directly on the project page.

### Shape Prior Explorer

Rotate and zoom a selected airplane, search by object ID, or filter by the original train/test labels. Four representation modes provide complementary views:

| Mode | View |
| :--- | :--- |
| **Surface** | Shaded source shape using a simplified display mesh. |
| **SDF slices** | Linked 3D and 2D distance-field cross-sections, with X/Y/Z selection, slice position, color range, and sampled values. |
| **Zero isosurface** | Surface extracted at `d = 0` from the preview distance field. |
| **Wireframe** | Triangle edges of the display mesh. |

The explorer also provides reset, auto-rotate, expanded viewing, and per-model field downloads (`.npz`). Original OFF vertex and face counts are reported separately from display-mesh statistics.

### Airplane Metadata

The metadata browser supports search, column sorting, split filtering, pagination, and filtered CSV export. Records marked **3D** link to the corresponding model in the explorer.

| Resource | Train | Test | Total |
| :--- | ---: | ---: | ---: |
| Airplane metadata records | 626 | 100 | **726** |
| Interactive source-mesh subset | 15 | 31 | **46** |

The CSV retains the original fields: `object_id`, `class`, `split`, and `object_path`. Split labels follow the original ModelNet40 metadata.

**SDF previews.** The explorer’s SDFs are 64³ voxel-derived approximations independently computed from ModelNet40 OFF meshes for visualization. See [preview preprocessing](PREPROCESSING.md) for the coordinate system, field construction, and display-mesh preparation.

### Data and documentation

| Resource | Contents |
| :--- | :--- |
| [Airplane metadata CSV](static/data/metadata_modelnet40_airplane.csv) | All 726 airplane records. |
| [Preview-subset CSV](static/data/metadata_airplane_preview_subset.csv) | The 46 records corresponding to available 3D previews. |
| [Source OFF subset](static/data/modelnet40-airplane-subset.zip) | 46 source meshes, original split folders, and matching subset metadata. |
| [Distance-field assets](static/fields/) | Per-model `.npz` files with field samples and grid information. |
| [Preprocessing notes](PREPROCESSING.md) | Visualization methods and parameter documentation. |
| [Per-model provenance](static/data/field-provenance.json) | Source checksums, geometry statistics, and field diagnostics. |

**Dataset attribution:** Z. Wu, S. Song, A. Khosla, F. Yu, L. Zhang, X. Tang, and J. Xiao. *3D ShapeNets: A Deep Representation for Volumetric Shapes.* CVPR 2015. [Princeton ModelNet](https://modelnet.cs.princeton.edu/).

## Quick start

The website uses static HTML, CSS, and JavaScript. Viewing it requires no build step, model checkpoint, API key, or machine-learning environment.

```bash
git clone https://github.com/Songlin-git/AeroForge-VR.git
cd AeroForge-VR
python3 -m http.server 8000
```

Open **http://localhost:8000** in your browser. Python is used only to serve the static files. You can also open `index.html` directly, keeping the `static/` directory alongside it.

The demo video is included as a local MP4. Geometry, distance-field previews, and metadata are bundled with the page; no dataset download is required to use the explorers. WebGL is the preferred renderer, with a Canvas 3D fallback when it is unavailable.

## Repository structure

```text
AeroForge-VR/
├── index.html                  # Project page
├── README.md
├── PREPROCESSING.md            # Preview methods and parameters
├── .nojekyll
└── static/
    ├── css/                    # Page styles
    ├── js/                     # Viewers, metadata browser, and interface
    ├── assets/                 # Per-model browser assets
    ├── fields/                 # Downloadable distance-field previews
    ├── data/                   # CSVs, provenance, source subset, and BibTeX
    ├── images/                 # Pipeline figure and video poster
    ├── pdf/                    # Paper manuscript
    └── videos/                 # Self-hosted demo video
```

## Citation

To cite the accompanying manuscript, use the following entry. A [BibTeX file](static/data/aeroforge.bib) is also included.

```bibtex
@misc{shang2026aeroforge,
  title  = {AeroForge VR: Design-to-Flight},
  author = {Shang, Songlin and Hu, Yushen},
  year   = {2026},
  note   = {Author-provided manuscript, IEEE ISMAR 2026}
}
```
