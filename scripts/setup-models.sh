#!/usr/bin/env bash
# Downloads the Moonshine tiny-en int8 model for sherpa-onnx-node ASR.
# One-time setup. Safe to re-run — skips download if model already present.

set -euo pipefail

MODEL_NAME="sherpa-onnx-moonshine-tiny-en-int8"
MODELS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/models"
TARGET="${MODELS_DIR}/${MODEL_NAME}"
TARBALL_URL="https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/${MODEL_NAME}.tar.bz2"

mkdir -p "$MODELS_DIR"

if [[ -d "$TARGET" && -f "$TARGET/tokens.txt" ]]; then
  echo "✔ Moonshine model already present at $TARGET"
  exit 0
fi

echo "▸ Downloading $MODEL_NAME …"
TMP="$(mktemp -t moonshine.XXXXXX).tar.bz2"
curl -L --fail --progress-bar "$TARBALL_URL" -o "$TMP"

echo "▸ Extracting into $MODELS_DIR …"
tar -xjf "$TMP" -C "$MODELS_DIR"
rm -f "$TMP"

if [[ -f "$TARGET/tokens.txt" ]]; then
  echo "✔ Installed to $TARGET"
else
  echo "✖ Extraction finished but expected files are missing at $TARGET" >&2
  exit 1
fi
