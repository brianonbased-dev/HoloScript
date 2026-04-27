# OpenUSD schema-plugin CMake build for the structural-biology comparison.
#
# Pinned upstream tag: PixarAnimationStudios/OpenUSD v25.11
# (commit 363a7c8da8d1937072a5f0989e91faf72eb1fa76).
#
# Authored as the canonical CMake shape a USD schema plugin requires per
# upstream's pxr_library() macro (defined in cmake/macros/Public.cmake of
# the v25.11 source tree). This file is NOT compiled in this repo — it is
# the reference build description the comparison harness counts against
# the HoloScript-side tsup build (which has zero per-plugin CMake LOC).
#
# Toolchain prerequisites (see README.md): pxr v25.11 source tree, Python
# 3.9+, Boost (with python module), TBB, OpenSubdiv, MaterialX, CMake 3.20+.

cmake_minimum_required(VERSION 3.20)
project(usdStructBio CXX)

# Locate pxr install (export PXR_USD_LOCATION=/path/to/openusd-v25.11/install).
list(APPEND CMAKE_PREFIX_PATH $ENV{PXR_USD_LOCATION})
find_package(pxr REQUIRED)

# Author the schema once; codegen produces every wrap*.cpp + Protein.cpp etc.
add_custom_command(
    OUTPUT  ${CMAKE_CURRENT_BINARY_DIR}/generatedSchema.usda
            ${CMAKE_CURRENT_BINARY_DIR}/protein.cpp
            ${CMAKE_CURRENT_BINARY_DIR}/protein.h
            ${CMAKE_CURRENT_BINARY_DIR}/ligand.cpp
            ${CMAKE_CURRENT_BINARY_DIR}/ligand.h
            ${CMAKE_CURRENT_BINARY_DIR}/chain.cpp
            ${CMAKE_CURRENT_BINARY_DIR}/chain.h
            ${CMAKE_CURRENT_BINARY_DIR}/foldableAPI.cpp
            ${CMAKE_CURRENT_BINARY_DIR}/foldableAPI.h
            ${CMAKE_CURRENT_BINARY_DIR}/helixAPI.cpp
            ${CMAKE_CURRENT_BINARY_DIR}/helixAPI.h
            ${CMAKE_CURRENT_BINARY_DIR}/sheetAPI.cpp
            ${CMAKE_CURRENT_BINARY_DIR}/sheetAPI.h
            ${CMAKE_CURRENT_BINARY_DIR}/residueAnchorAPI.cpp
            ${CMAKE_CURRENT_BINARY_DIR}/residueAnchorAPI.h
            ${CMAKE_CURRENT_BINARY_DIR}/tokens.cpp
            ${CMAKE_CURRENT_BINARY_DIR}/wrapProtein.cpp
            ${CMAKE_CURRENT_BINARY_DIR}/wrapLigand.cpp
            ${CMAKE_CURRENT_BINARY_DIR}/wrapChain.cpp
            ${CMAKE_CURRENT_BINARY_DIR}/wrapFoldableAPI.cpp
            ${CMAKE_CURRENT_BINARY_DIR}/wrapHelixAPI.cpp
            ${CMAKE_CURRENT_BINARY_DIR}/wrapSheetAPI.cpp
            ${CMAKE_CURRENT_BINARY_DIR}/wrapResidueAnchorAPI.cpp
            ${CMAKE_CURRENT_BINARY_DIR}/module.cpp
            ${CMAKE_CURRENT_BINARY_DIR}/moduleDeps.cpp
    COMMAND $ENV{PXR_USD_LOCATION}/bin/usdGenSchema
            ${CMAKE_CURRENT_SOURCE_DIR}/schema.usda
            ${CMAKE_CURRENT_BINARY_DIR}
    DEPENDS ${CMAKE_CURRENT_SOURCE_DIR}/schema.usda
    COMMENT "[usdStructBio] running usdGenSchema..."
)

pxr_library(usdStructBio
    LIBRARIES
        tf sdf usd usdGeom

    PUBLIC_HEADERS
        ${CMAKE_CURRENT_SOURCE_DIR}/tokens.h
        ${CMAKE_CURRENT_BINARY_DIR}/protein.h
        ${CMAKE_CURRENT_BINARY_DIR}/ligand.h
        ${CMAKE_CURRENT_BINARY_DIR}/chain.h
        ${CMAKE_CURRENT_BINARY_DIR}/foldableAPI.h
        ${CMAKE_CURRENT_BINARY_DIR}/helixAPI.h
        ${CMAKE_CURRENT_BINARY_DIR}/sheetAPI.h
        ${CMAKE_CURRENT_BINARY_DIR}/residueAnchorAPI.h

    CPPFILES
        ${CMAKE_CURRENT_BINARY_DIR}/protein.cpp
        ${CMAKE_CURRENT_BINARY_DIR}/ligand.cpp
        ${CMAKE_CURRENT_BINARY_DIR}/chain.cpp
        ${CMAKE_CURRENT_BINARY_DIR}/foldableAPI.cpp
        ${CMAKE_CURRENT_BINARY_DIR}/helixAPI.cpp
        ${CMAKE_CURRENT_BINARY_DIR}/sheetAPI.cpp
        ${CMAKE_CURRENT_BINARY_DIR}/residueAnchorAPI.cpp
        ${CMAKE_CURRENT_BINARY_DIR}/tokens.cpp

    PYMODULE_CPPFILES
        ${CMAKE_CURRENT_BINARY_DIR}/module.cpp
        ${CMAKE_CURRENT_BINARY_DIR}/moduleDeps.cpp
        ${CMAKE_CURRENT_BINARY_DIR}/wrapProtein.cpp
        ${CMAKE_CURRENT_BINARY_DIR}/wrapLigand.cpp
        ${CMAKE_CURRENT_BINARY_DIR}/wrapChain.cpp
        ${CMAKE_CURRENT_BINARY_DIR}/wrapFoldableAPI.cpp
        ${CMAKE_CURRENT_BINARY_DIR}/wrapHelixAPI.cpp
        ${CMAKE_CURRENT_BINARY_DIR}/wrapSheetAPI.cpp
        ${CMAKE_CURRENT_BINARY_DIR}/wrapResidueAnchorAPI.cpp

    PYMODULE_FILES
        __init__.py

    RESOURCE_FILES
        plugInfo.json
        ${CMAKE_CURRENT_BINARY_DIR}/generatedSchema.usda
)
