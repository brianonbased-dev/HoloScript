#!/usr/bin/env bash
# bootstrap-package-mirror.sh -- run on Jetson/owned metal to host fleet packages.
#
# npm: Verdaccio read-through cache on HOLOSCRIPT_PACKAGE_MIRROR_PORT.
# PyPI: wheelhouse directory served over HTTP for pip --find-links use.
#
# Client bootstraps consume the emitted client.env with
# HOLOSCRIPT_PACKAGE_PUBLIC_FALLBACK=0 to prove mirror-only package pulls.
set -euo pipefail

MIRROR_ROOT="${HOLOSCRIPT_PACKAGE_MIRROR_ROOT:-/mnt/nvme/holoscript-package-mirror}"
NPM_HOST="${HOLOSCRIPT_PACKAGE_MIRROR_HOST:-0.0.0.0}"
NPM_PORT="${HOLOSCRIPT_PACKAGE_MIRROR_PORT:-4873}"
PYPI_PORT="${HOLOSCRIPT_PYPI_WHEELHOUSE_PORT:-4874}"
VERDACCIO_VERSION="${HOLOSCRIPT_VERDACCIO_VERSION:-6}"
PUBLIC_HOST="${HOLOSCRIPT_PACKAGE_MIRROR_PUBLIC_HOST:-}"
VERDACCIO_CONFIG="$MIRROR_ROOT/verdaccio/config.yaml"
VERDACCIO_STORAGE="$MIRROR_ROOT/verdaccio/storage"
PYPI_WHEELHOUSE="$MIRROR_ROOT/pypi/wheelhouse"
CLIENT_ENV="$MIRROR_ROOT/client.env"
LOG="[package-mirror]"

if [ -z "$PUBLIC_HOST" ]; then
  PUBLIC_HOST="$(hostname -I 2>/dev/null | awk '{print $1}')"
  PUBLIC_HOST="${PUBLIC_HOST:-$(hostname 2>/dev/null || echo jetson-package-mirror)}"
fi

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "$LOG FATAL: required command missing: $1" >&2
    exit 2
  }
}

require_cmd node
require_cmd npm
require_cmd python3

mkdir -p "$VERDACCIO_STORAGE" "$PYPI_WHEELHOUSE"

if ! command -v verdaccio >/dev/null 2>&1; then
  echo "$LOG installing verdaccio@$VERDACCIO_VERSION globally"
  npm install -g "verdaccio@$VERDACCIO_VERSION"
fi

VERDACCIO_BIN="$(command -v verdaccio || true)"
if [ -z "$VERDACCIO_BIN" ]; then
  NPM_PREFIX="$(npm prefix -g)"
  if [ -x "$NPM_PREFIX/bin/verdaccio" ]; then
    VERDACCIO_BIN="$NPM_PREFIX/bin/verdaccio"
  fi
fi
[ -n "$VERDACCIO_BIN" ] || { echo "$LOG FATAL: verdaccio binary not found after install" >&2; exit 2; }

cat > "$VERDACCIO_CONFIG" <<YAML
storage: $VERDACCIO_STORAGE
uplinks:
  npmjs:
    url: https://registry.npmjs.org/
packages:
  '@holoscript/*':
    access: \$all
    publish: \$authenticated
    proxy: npmjs
  '@*/*':
    access: \$all
    publish: \$authenticated
    proxy: npmjs
  '**':
    access: \$all
    publish: \$authenticated
    proxy: npmjs
server:
  keepAliveTimeout: 60
logs:
  - {type: stdout, format: pretty, level: http}
YAML

cat > "$PYPI_WHEELHOUSE/README.md" <<EOF
HoloScript PyPI wheelhouse cache.

Populate with:
  python3 -m pip download -r requirements.txt -d $PYPI_WHEELHOUSE

Fleet clients use:
  PIP_FIND_LINKS=http://$PUBLIC_HOST:$PYPI_PORT/
  PIP_NO_INDEX=1
EOF

if [ -n "${HOLOSCRIPT_PYPI_REQUIREMENTS:-}" ] && [ -f "$HOLOSCRIPT_PYPI_REQUIREMENTS" ]; then
  echo "$LOG warming PyPI wheelhouse from $HOLOSCRIPT_PYPI_REQUIREMENTS"
  python3 -m pip download -r "$HOLOSCRIPT_PYPI_REQUIREMENTS" -d "$PYPI_WHEELHOUSE"
fi

cat > "$CLIENT_ENV" <<EOF
export HOLOSCRIPT_PACKAGE_MIRROR_URL=http://$PUBLIC_HOST:$NPM_PORT/
export HOLOSCRIPT_NPM_REGISTRY_URL=http://$PUBLIC_HOST:$NPM_PORT/
export HOLOSCRIPT_PYPI_FIND_LINKS_URL=http://$PUBLIC_HOST:$PYPI_PORT/
export HOLOSCRIPT_PACKAGE_PUBLIC_FALLBACK=0
EOF

if [ "$(id -u)" = "0" ] && command -v systemctl >/dev/null 2>&1; then
  cat > /etc/systemd/system/holoscript-package-mirror.service <<EOF
[Unit]
Description=HoloScript npm package mirror
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=$VERDACCIO_BIN --config $VERDACCIO_CONFIG --listen $NPM_HOST:$NPM_PORT
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

  cat > /etc/systemd/system/holoscript-pypi-wheelhouse.service <<EOF
[Unit]
Description=HoloScript PyPI wheelhouse mirror
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=$PYPI_WHEELHOUSE
ExecStart=$(command -v python3) -m http.server $PYPI_PORT --bind $NPM_HOST --directory $PYPI_WHEELHOUSE
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

  systemctl daemon-reload
  systemctl enable --now holoscript-package-mirror.service
  systemctl enable --now holoscript-pypi-wheelhouse.service
  echo "$LOG services enabled: holoscript-package-mirror, holoscript-pypi-wheelhouse"
else
  cat > "$MIRROR_ROOT/run-package-mirror.sh" <<EOF
#!/usr/bin/env bash
set -euo pipefail
"$VERDACCIO_BIN" --config "$VERDACCIO_CONFIG" --listen "$NPM_HOST:$NPM_PORT" &
python3 -m http.server "$PYPI_PORT" --bind "$NPM_HOST" --directory "$PYPI_WHEELHOUSE" &
wait
EOF
  chmod +x "$MIRROR_ROOT/run-package-mirror.sh"
  echo "$LOG systemd unavailable or not root; run $MIRROR_ROOT/run-package-mirror.sh"
fi

echo "$LOG client env: $CLIENT_ENV"
echo "$LOG npm mirror: http://$PUBLIC_HOST:$NPM_PORT/"
echo "$LOG PyPI wheelhouse: http://$PUBLIC_HOST:$PYPI_PORT/"
