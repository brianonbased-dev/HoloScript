#!/usr/bin/env bash
# Shared package mirror client setup for HoloScript fleet bootstraps.
#
# Source this file, then call configure_holoscript_package_mirror. It only
# configures clients; it does not start the mirror service.

configure_holoscript_package_mirror() {
  local log_prefix="${1:-[package-mirror]}"
  local npm_registry="${HOLOSCRIPT_NPM_REGISTRY_URL:-${HOLOSCRIPT_PACKAGE_MIRROR_URL:-}}"
  local pypi_index="${HOLOSCRIPT_PYPI_INDEX_URL:-}"
  local pypi_find_links="${HOLOSCRIPT_PYPI_FIND_LINKS_URL:-}"
  local public_fallback="${HOLOSCRIPT_PACKAGE_PUBLIC_FALLBACK:-1}"

  export HOLOSCRIPT_PACKAGE_PUBLIC_FALLBACK="$public_fallback"

  if [ -n "$npm_registry" ]; then
    export npm_config_registry="$npm_registry"
    export NPM_CONFIG_REGISTRY="$npm_registry"
    echo "$log_prefix npm registry=$npm_registry"
    if command -v npm >/dev/null 2>&1; then
      npm config set registry "$npm_registry" >/dev/null 2>&1 \
        || echo "$log_prefix WARN: npm config set registry failed; env override remains active" >&2
    fi
  else
    echo "$log_prefix npm registry=<public/default>"
  fi

  if [ -n "$pypi_index" ]; then
    export PIP_INDEX_URL="$pypi_index"
    echo "$log_prefix PyPI index=$pypi_index"
  fi

  if [ -n "$pypi_find_links" ]; then
    export PIP_FIND_LINKS="$pypi_find_links"
    echo "$log_prefix PyPI find-links=$pypi_find_links"
  fi

  if [ "$public_fallback" = "0" ]; then
    unset npm_config_fallback_registry NPM_CONFIG_FALLBACK_REGISTRY
    unset PIP_EXTRA_INDEX_URL
    if [ -n "$pypi_find_links" ]; then
      export PIP_NO_INDEX=1
    fi
    echo "$log_prefix public fallback=disabled"
  else
    echo "$log_prefix public fallback=allowed"
  fi
}

if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  configure_holoscript_package_mirror
fi
