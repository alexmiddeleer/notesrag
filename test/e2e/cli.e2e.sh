#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
stdout_file="$(mktemp)"
stderr_file="$(mktemp)"

cleanup() {
  rm -f "$stdout_file" "$stderr_file"
}
trap cleanup EXIT

set +e
echo "foobar" | "$repo_root/bin/notesrag.js" index --stdin >"$stdout_file" 2>"$stderr_file"
code=$?
set -e

stdout="$(cat "$stdout_file")"
stderr="$(cat "$stderr_file")"

if grep -q "embedClient.embed is not a function" "$stderr_file"; then
  echo "fail"
  echo "internal adapter error leaked: $stderr"
  exit 1
fi

if [[ $code -eq 0 ]]; then
  if [[ "$stdout" =~ ^indexed\ document_id=doc_[a-f0-9]{16}\ source=stdin\ chars=[0-9]+\ bytes=[0-9]+\ chunks=[0-9]+\ dims=[0-9]+$ ]]; then
    echo "pass"
    exit 0
  fi

  echo "fail"
  echo "success output did not match expected shape: $stdout"
  exit 1
fi

if [[ $code -eq 1 ]]; then
  if [[ "$stderr" == error:\ failed\ to\ reach\ Ollama* ]] || \
     [[ "$stderr" == error:\ embedding\ model\ not\ found:* ]] || \
     [[ "$stderr" == error:\ embedding\ request\ failed:* ]]; then
    echo "pass"
    exit 0
  fi
fi

echo "fail"
echo "unexpected exit/output"
echo "exit_code=$code"
echo "stdout=$stdout"
echo "stderr=$stderr"
exit 1
