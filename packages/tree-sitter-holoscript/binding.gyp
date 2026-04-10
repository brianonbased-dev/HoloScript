{
  "targets": [
    {
      "target_name": "tree_sitter_holoscript_binding",
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")",
        "src"
      ],
      "sources": [
        "bindings/node/binding.cc",
        "src/parser.c"
      ],
      "cflags_c": [
        "-std=c11"
      ],
      "defines": [
        "NAPI_VERSION=<(napi_build_version)",
        "NAPI_DISABLE_CPP_EXCEPTIONS"
      ]
    }
  ]
}
