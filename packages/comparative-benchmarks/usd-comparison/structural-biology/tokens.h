// Representative slice of the C++ header that
// `usdGenSchema schema.usda .` produces from schema.usda. This header is
// authored here as a STUB so the comparison harness can count canonical
// boilerplate LOC; producing the full set of schema headers (Protein.h,
// Ligand.h, Chain.h, foldableAPI.h, helixAPI.h, sheetAPI.h, residueAnchorAPI.h
// + the matching .cpp, wrap*.cpp, module.cpp, and generatedSchema.usda) on
// pinned upstream tag PixarAnimationStudios/OpenUSD v25.11 requires the
// pxr toolchain (CMake + python-with-Boost.Python + the usdGenSchema script
// from pxr/usd/usd/usdGenSchema.py); see README.md in this directory for
// the full toolchain step list.
//
// Pinned upstream: v25.11 (commit 363a7c8da8d1937072a5f0989e91faf72eb1fa76).

#ifndef USD_STRUCT_BIO_TOKENS_H
#define USD_STRUCT_BIO_TOKENS_H

#include "pxr/pxr.h"
#include "pxr/base/tf/staticTokens.h"

PXR_NAMESPACE_OPEN_SCOPE

#define USDSTRUCTBIO_TOKENS                                                    \
    ((Protein, "Protein"))                                                     \
    ((Ligand, "Ligand"))                                                       \
    ((Chain, "Chain"))                                                         \
    ((FoldableAPI, "FoldableAPI"))                                             \
    ((HelixAPI, "HelixAPI"))                                                   \
    ((SheetAPI, "SheetAPI"))                                                   \
    ((ResidueAnchorAPI, "ResidueAnchorAPI"))                                   \
    ((helix, "helix"))                                                         \
    ((sheet, "sheet"))                                                         \
    ((loop, "loop"))                                                           \
    ((structBio_uniprotAccession, "structBio:uniprotAccession"))               \
    ((structBio_residueCount, "structBio:residueCount"))                       \
    ((structBio_residueSecondary, "structBio:residueSecondary"))               \
    ((structBio_smiles, "structBio:smiles"))                                   \
    ((structBio_parentProtein, "structBio:parentProtein"))                     \
    ((structBio_foldable_enabled, "structBio:foldable:enabled"))               \
    ((structBio_helix_startResidue, "structBio:helix:startResidue"))           \
    ((structBio_helix_endResidue, "structBio:helix:endResidue"))               \
    ((structBio_sheet_startResidue, "structBio:sheet:startResidue"))           \
    ((structBio_sheet_endResidue, "structBio:sheet:endResidue"))               \
    ((structBio_residueAnchor_residueIndex,                                    \
        "structBio:residueAnchor:residueIndex"))                               \
    ((structBio_residueAnchor_anchorHex,                                       \
        "structBio:residueAnchor:anchorHex"))

TF_DECLARE_PUBLIC_TOKENS(UsdStructBioTokens, USDSTRUCTBIO_TOKENS);

PXR_NAMESPACE_CLOSE_SCOPE

#endif // USD_STRUCT_BIO_TOKENS_H
