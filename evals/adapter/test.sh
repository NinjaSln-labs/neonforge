#!/usr/bin/env bash
# 构建并运行适配器单元测试（无网络依赖）。
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
bash "$ROOT/evals/adapter/build.sh"
node --test "$ROOT/evals/adapter/test/adapter.test.mjs"
