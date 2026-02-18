--- HoloScript LSP Configuration
---
--- Standalone LSP setup module. Can be used independently of the main plugin:
---
---   require('holoscript.lsp').setup()
---
--- Or through the main plugin:
---
---   require('holoscript').setup({ lsp = { enabled = true } })

local M = {}

M.default_config = {
  enabled = true,
  -- Command to start the language server
  cmd = { "npx", "@holoscript/lsp", "--stdio" },
  -- Uncomment if holoscript-lsp is on PATH:
  -- cmd = { "holoscript-lsp", "--stdio" },
  filetypes = { "holoscript", "hsplus", "holo" },
  root_markers = { "holoscript.config.json", ".git", "package.json" },
  settings = {
    holoscript = {
      diagnostics = { enable = true },
      formatting = { enable = true, tabSize = 2 },
      completion = { enable = true, autoImport = true },
      hover = { enable = true, showInferredTypes = true },
    },
  },
}

--- Configure and attach the HoloScript LSP.
--- @param user_config table|nil  Overrides for default_config
function M.setup(user_config)
  local config = vim.tbl_deep_extend("force", M.default_config, user_config or {})

  if not config.enabled then return end

  -- Require nvim-lspconfig
  local ok, lspconfig = pcall(require, "lspconfig")
  if not ok then
    vim.notify(
      "[holoscript.lsp] nvim-lspconfig is required. Install it with your plugin manager.",
      vim.log.levels.WARN
    )
    return
  end

  -- Register holoscript server if not yet known
  local configs = require("lspconfig.configs")
  if not configs.holoscript then
    configs.holoscript = {
      default_config = {
        cmd = config.cmd,
        filetypes = config.filetypes,
        root_dir = lspconfig.util.root_pattern(unpack(config.root_markers)),
        single_file_support = true,
        settings = config.settings,
      },
    }
  end

  -- Attach LSP
  lspconfig.holoscript.setup({
    settings = config.settings,
    capabilities = M._capabilities(),
    on_attach = function(client, bufnr)
      M._on_attach(client, bufnr, config)
    end,
  })
end

--- Build LSP client capabilities (with nvim-cmp support if available).
function M._capabilities()
  local base = vim.lsp.protocol.make_client_capabilities()
  local ok, cmp_lsp = pcall(require, "cmp_nvim_lsp")
  if ok then
    return cmp_lsp.default_capabilities(base)
  end
  return base
end

--- Called when LSP attaches to a buffer.
--- Sets up keymaps and optional format-on-save.
--- @param client table
--- @param bufnr number
--- @param config table
function M._on_attach(client, bufnr, config)
  local function map(mode, lhs, rhs, desc)
    vim.keymap.set(mode, lhs, rhs, { buffer = bufnr, silent = true, desc = desc })
  end

  -- Navigation
  map("n", "gd",         vim.lsp.buf.definition,      "Go to definition")
  map("n", "gD",         vim.lsp.buf.declaration,     "Go to declaration")
  map("n", "gi",         vim.lsp.buf.implementation,  "Go to implementation")
  map("n", "gr",         vim.lsp.buf.references,      "Find references")

  -- Documentation
  map("n", "K",          vim.lsp.buf.hover,            "Show hover docs (inferred type)")
  map("n", "<C-k>",      vim.lsp.buf.signature_help,  "Signature help")

  -- Diagnostics
  map("n", "[d",         vim.diagnostic.goto_prev,    "Previous diagnostic")
  map("n", "]d",         vim.diagnostic.goto_next,    "Next diagnostic")
  map("n", "<leader>e",  vim.diagnostic.open_float,   "Show diagnostic detail")

  -- Code actions & refactoring
  map("n", "<leader>ca", vim.lsp.buf.code_action,     "Code action / fix suggestion")
  map("n", "<leader>rn", vim.lsp.buf.rename,          "Rename symbol")

  -- Formatting
  map({ "n", "v" }, "<leader>hf", function()
    vim.lsp.buf.format({ async = true, bufnr = bufnr })
  end, "Format file")

  -- Format on save (opt-in via config)
  if config.format_on_save then
    vim.api.nvim_create_autocmd("BufWritePre", {
      buffer = bufnr,
      callback = function()
        vim.lsp.buf.format({ async = false, bufnr = bufnr })
      end,
    })
  end
end

--- Show inferred type for symbol under cursor (via LSP hover).
--- Returns the raw hover text for testing.
function M.show_inferred_type()
  vim.lsp.buf.hover()
end

return M
