/**
 * HoloScript Debug Adapter integration for VS Code.
 *
 * Exports the factory and provider needed to wire the DAP debugger
 * (HoloScriptDebugSession from @holoscript/lsp) into VS Code's
 * debug infrastructure.
 */

export {
  HoloScriptInlineDebugAdapterFactory,
  HoloScriptDebugConfigurationProvider,
} from './HoloScriptDebugAdapterFactory';
