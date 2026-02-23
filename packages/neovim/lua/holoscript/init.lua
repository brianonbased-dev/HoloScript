-- HoloScript.nvim
-- Neovim plugin for HoloScript language support
--
-- Features:
--   - Syntax highlighting for .hs, .hsplus, .holo files
--   - LSP integration with @holoscript/lsp
--   - Treesitter queries (when grammar available)
--   - Folding, indentation, and formatting
--   - Code actions and commands
--
-- Installation:
--   Lazy.nvim:
--     { 'holoscript/holoscript.nvim' }
--
--   Packer:
--     use 'holoscript/holoscript.nvim'
--
--   Manual:
--     Clone to ~/.local/share/nvim/site/pack/plugins/start/holoscript.nvim

local M = {}

-- Default configuration
M.config = {
  -- Enable LSP automatically
  lsp = {
    enabled = true,
    cmd = { "npx", "@holoscript/lsp", "--stdio" },
    -- Alternative: use global install
    -- cmd = { "holoscript-lsp", "--stdio" },
  },

  -- Filetype associations
  filetypes = {
    holo = { "*.holo" },
    hsplus = { "*.hsplus" },
    holoscript = { "*.hs" }, -- Note: conflicts with Haskell, see below
  },

  -- Avoid .hs conflict with Haskell (disabled by default)
  register_hs_extension = false,

  -- Enable formatting on save
  format_on_save = false,

  -- Enable diagnostics
  diagnostics = {
    enabled = true,
    virtual_text = true,
    signs = true,
    underline = true,
    update_in_insert = false,
  },

  -- Keymaps (false to disable)
  keymaps = {
    format = "<leader>hf",
    validate = "<leader>hv",
    compile_preview = "<leader>hp",
    goto_definition = "gd",
    hover = "K",
    code_action = "<leader>ca",
  },
}

-- Setup filetypes
local function setup_filetypes(config)
  vim.filetype.add({
    extension = {
      holo = "holo",
      hsplus = "hsplus",
    },
    pattern = {
      [".*%.holo"] = "holo",
      [".*%.hsplus"] = "hsplus",
    },
  })

  -- Only register .hs if explicitly enabled (conflicts with Haskell)
  if config.register_hs_extension then
    vim.filetype.add({
      extension = {
        hs = "holoscript",
      },
    })
  end
end

-- Setup LSP
local function setup_lsp(config)
  if not config.lsp.enabled then
    return
  end

  -- Check if lspconfig is available
  local ok, lspconfig = pcall(require, "lspconfig")
  if not ok then
    vim.notify("[HoloScript] nvim-lspconfig not found, skipping LSP setup", vim.log.levels.WARN)
    return
  end

  local configs = require("lspconfig.configs")

  -- Register HoloScript LSP if not already registered
  if not configs.holoscript then
    configs.holoscript = {
      default_config = {
        cmd = config.lsp.cmd,
        filetypes = { "holo", "hsplus", "holoscript" },
        root_dir = lspconfig.util.root_pattern(
          "package.json",
          ".holoscript",
          ".git"
        ),
        settings = {
          holoscript = {
            validate = true,
            format = {
              enable = true,
            },
          },
        },
        init_options = {
          documentFormatting = true,
          documentRangeFormatting = true,
        },
      },
    }
  end

  -- Start the LSP
  lspconfig.holoscript.setup({
    on_attach = function(client, bufnr)
      -- Enable completion triggered by <c-x><c-o>
      vim.bo[bufnr].omnifunc = "v:lua.vim.lsp.omnifunc"

      -- Setup keymaps
      local function map(mode, lhs, rhs, desc)
        if lhs then
          vim.keymap.set(mode, lhs, rhs, { buffer = bufnr, desc = desc })
        end
      end

      local keymaps = M.config.keymaps
      map("n", keymaps.goto_definition, vim.lsp.buf.definition, "Go to definition")
      map("n", keymaps.hover, vim.lsp.buf.hover, "Hover documentation")
      map("n", keymaps.code_action, vim.lsp.buf.code_action, "Code actions")
      map("n", keymaps.format, function()
        vim.lsp.buf.format({ async = true })
      end, "Format buffer")

      -- Validate command
      if keymaps.validate then
        map("n", keymaps.validate, function()
          vim.cmd("HoloScriptValidate")
        end, "Validate HoloScript")
      end

      -- Compile preview
      if keymaps.compile_preview then
        map("n", keymaps.compile_preview, function()
          vim.cmd("HoloScriptPreview")
        end, "Compile preview")
      end

      vim.notify("[HoloScript] LSP attached", vim.log.levels.INFO)
    end,
    capabilities = vim.lsp.protocol.make_client_capabilities(),
  })
end

-- Setup diagnostics
local function setup_diagnostics(config)
  vim.diagnostic.config({
    virtual_text = config.diagnostics.virtual_text,
    signs = config.diagnostics.signs,
    underline = config.diagnostics.underline,
    update_in_insert = config.diagnostics.update_in_insert,
  })
end

-- Setup commands
local function setup_commands()
  -- Validate current buffer
  vim.api.nvim_create_user_command("HoloScriptValidate", function()
    local bufnr = vim.api.nvim_get_current_buf()
    local content = table.concat(vim.api.nvim_buf_get_lines(bufnr, 0, -1, false), "\n")
    local filename = vim.api.nvim_buf_get_name(bufnr)
    local ext = vim.fn.fnamemodify(filename, ":e")

    -- Call LSP for validation
    local clients = vim.lsp.get_clients({ name = "holoscript" })
    if #clients > 0 then
      vim.lsp.buf.code_action({
        filter = function(action)
          return action.title == "Validate"
        end,
        apply = true,
      })
    else
      vim.notify("[HoloScript] LSP not running", vim.log.levels.WARN)
    end
  end, { desc = "Validate HoloScript file" })

  -- Preview compiled output
  vim.api.nvim_create_user_command("HoloScriptPreview", function(opts)
    local target = opts.args ~= "" and opts.args or "r3f"
    local bufnr = vim.api.nvim_get_current_buf()
    local content = table.concat(vim.api.nvim_buf_get_lines(bufnr, 0, -1, false), "\n")
    local filename = vim.api.nvim_buf_get_name(bufnr)

    -- Create preview in split
    vim.cmd("vsplit")
    local preview_buf = vim.api.nvim_create_buf(false, true)
    vim.api.nvim_win_set_buf(0, preview_buf)
    vim.bo[preview_buf].filetype = "typescript" -- Most targets output TS/JS

    -- Try to compile via CLI
    local cmd = string.format('npx holoscript compile "%s" --target %s 2>&1', filename, target)
    local handle = io.popen(cmd)
    if handle then
      local result = handle:read("*a")
      handle:close()
      vim.api.nvim_buf_set_lines(preview_buf, 0, -1, false, vim.split(result, "\n"))
    else
      vim.api.nvim_buf_set_lines(preview_buf, 0, -1, false, {
        "-- Failed to compile",
        "-- Ensure @holoscript/cli is installed",
        "-- npm install -g @holoscript/cli",
      })
    end
  end, {
    nargs = "?",
    complete = function()
      return { "r3f", "babylon", "unity", "unreal", "godot", "visionos", "vrchat", "ios", "android" }
    end,
    desc = "Preview compiled HoloScript",
  })

  -- Open HoloScript documentation
  vim.api.nvim_create_user_command("HoloScriptDocs", function(opts)
    local topic = opts.args ~= "" and opts.args or "index"
    local url = "https://holoscript.net/docs/" .. topic
    vim.fn.jobstart({ "open", url }, { detach = true })
  end, {
    nargs = "?",
    complete = function()
      return { "traits", "syntax", "compilers", "examples", "api" }
    end,
    desc = "Open HoloScript documentation",
  })

  -- Create new composition
  vim.api.nvim_create_user_command("HoloScriptNew", function(opts)
    local name = opts.args ~= "" and opts.args or "NewComposition"
    local template = string.format([[
composition "%s" {
  environment {
    skybox: "gradient"
    ambient_light: 0.4
  }

  template "Object" {
    geometry: "sphere"
    color: "#3498db"
    @collidable
  }

  object "Main" using "Object" {
    position: [0, 1, 0]
  }
}
]], name)

    -- Insert template
    vim.api.nvim_buf_set_lines(0, 0, -1, false, vim.split(template, "\n"))
  end, {
    nargs = "?",
    desc = "Create new HoloScript composition",
  })
end

-- Setup format on save
local function setup_format_on_save(config)
  if not config.format_on_save then
    return
  end

  vim.api.nvim_create_autocmd("BufWritePre", {
    pattern = { "*.holo", "*.hsplus" },
    callback = function()
      vim.lsp.buf.format({ async = false })
    end,
  })
end

-- Main setup function
function M.setup(user_config)
  -- Merge user config with defaults
  M.config = vim.tbl_deep_extend("force", M.config, user_config or {})

  -- Setup components
  setup_filetypes(M.config)
  setup_diagnostics(M.config)
  setup_commands()
  setup_format_on_save(M.config)

  -- Defer LSP setup to after VimEnter
  vim.api.nvim_create_autocmd("VimEnter", {
    once = true,
    callback = function()
      setup_lsp(M.config)
    end,
  })
end

return M
