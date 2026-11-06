#!/bin/sh
exec "${NODE_BINARY:-node}" "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)/review.cjs" hook
