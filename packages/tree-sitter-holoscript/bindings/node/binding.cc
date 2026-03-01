#include <napi.h>

extern "C" {
  extern const void *tree_sitter_holoscript();
}

namespace {

/**
 * Type tag required by tree-sitter >= 0.21.x runtime.
 * Must match the tag in tree-sitter/src/language.cc so that
 * Parser.setLanguage() recognises this External as a valid language.
 */
static const napi_type_tag LANGUAGE_TYPE_TAG = {
  0x8AF2E5212AD58ABF, 0xD5006CAD83ABBA16
};

Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports["name"] = Napi::String::New(env, "holoscript");
  auto language = Napi::External<void>::New(
    env,
    const_cast<void*>(tree_sitter_holoscript())
  );
  language.TypeTag(&LANGUAGE_TYPE_TAG);
  exports["language"] = language;
  return exports;
}

}  // namespace

NODE_API_MODULE(tree_sitter_holoscript_binding, Init)
