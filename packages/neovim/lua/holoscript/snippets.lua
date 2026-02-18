--- HoloScript Snippets
--- Provides LuaSnip / friendly-snippets compatible snippet definitions.
---
--- Usage (in your Neovim config):
---   require('holoscript.snippets').setup()
---
--- Prerequisites (one of):
---   - L3MON4D3/LuaSnip
---   - hrsh7th/vim-vsnip (uses VS Code format via snippets.json)

local M = {}

-- ---------------------------------------------------------------------------
-- VS Code JSON format (works with vim-vsnip, coc.nvim, etc.)
-- ---------------------------------------------------------------------------

M.vscode_snippets = {
  ["Orb"] = {
    prefix = "orb",
    body = {
      'orb "${1:Name}" {',
      "  color: \"${2:white}\"",
      "  scale: ${3:1.0}",
      "  position: [${4:0}, ${5:0}, ${6:0}]",
      "  $0",
      "}",
    },
    description = "Create a new HoloScript orb",
  },

  ["Template"] = {
    prefix = "template",
    body = {
      'template "${1:Name}" {',
      "  ${0:// properties}",
      "}",
    },
    description = "Create a reusable template",
  },

  ["Environment"] = {
    prefix = "env",
    body = {
      'environment "${1:Scene}" {',
      "  ambientColor: \"${2:#ffffff}\"",
      "  ambientIntensity: ${3:0.5}",
      "  $0",
      "}",
    },
    description = "Create an environment block",
  },

  ["Physics Trait"] = {
    prefix = "@physics",
    body = {
      "@physics {",
      "  mass: ${1:1.0}",
      "  restitution: ${2:0.5}",
      "  isStatic: ${3:false}",
      "}",
    },
    description = "@physics trait with common options",
  },

  ["Accessible Trait"] = {
    prefix = "@accessible",
    body = {
      "@accessible {",
      '  role: "${1:button}"',
      '  label: "${2:My Object}"',
      "}",
    },
    description = "@accessible trait for screen readers",
  },

  ["Synced Trait"] = {
    prefix = "@synced",
    body = {
      "@synced {",
      '  properties: ["${1:color}"]',
      '  authority: "${2:last}"',
      "  rate: ${3:30}",
      "}",
    },
    description = "@synced trait for multiplayer state",
  },

  ["Logic Block"] = {
    prefix = "logic",
    body = {
      'logic "${1:handler}" {',
      "  on_click: () => {",
      "    $0",
      "  }",
      "}",
    },
    description = "Logic block with on_click handler",
  },

  ["On Tick"] = {
    prefix = "on_tick",
    body = {
      "on_tick: (dt) => {",
      "  $0",
      "},",
    },
    description = "Frame update handler (receives delta time)",
  },

  ["Spread Template"] = {
    prefix = "...",
    body = { "...${1:TemplateName}" },
    description = "Spread a template into current orb",
  },

  ["Type Alias"] = {
    prefix = "type",
    body = {
      "type ${1:Name} = ${2:string | number}",
    },
    description = "Define a type alias",
  },

  ["Manifest"] = {
    prefix = "@manifest",
    body = {
      "@manifest {",
      '  title: "${1:My Scene}"',
      "  maxPlayers: ${2:4}",
      "  version: \"${3:1.0.0}\"",
      "}",
    },
    description = "@manifest directive for scene metadata",
  },

  ["Full Scene"] = {
    prefix = "scene",
    body = {
      "@manifest {",
      '  title: "${1:My Scene}"',
      "}",
      "",
      'environment "${2:World}" {',
      "  ambientColor: \"#ffffff\"",
      "  ambientIntensity: 0.6",
      "}",
      "",
      'orb "${3:MainObject}" {',
      '  color: "${4:blue}"',
      "  scale: 1.0",
      "  position: [0, 0, -2]",
      "  @grabbable",
      "  $0",
      "}",
    },
    description = "Scaffold a complete HoloScript scene",
  },
}

-- ---------------------------------------------------------------------------
-- LuaSnip integration
-- ---------------------------------------------------------------------------

function M.setup()
  local ok, ls = pcall(require, "luasnip")
  if not ok then
    -- Fall back to registering VS Code snippets if vim-vsnip is available
    local vsnip_ok = pcall(require, "vsnip")
    if vsnip_ok then
      -- vsnip reads from g:vsnip_snippet_dirs or the runtimepath snippets/
      -- Users need to export M.vscode_snippets to a JSON file in their config
    end
    return
  end

  local s   = ls.snippet
  local t   = ls.text_node
  local i   = ls.insert_node
  local fmt = require("luasnip.extras.fmt").fmt

  ls.add_snippets("holoscript", {
    -- orb snippet
    s("orb", fmt([[
orb "{}" {{
  color: "{}"
  scale: {}
  position: [{}, {}, {}]
  {}
}}]], {
      i(1, "Name"),
      i(2, "white"),
      i(3, "1.0"),
      i(4, "0"), i(5, "0"), i(6, "0"),
      i(0),
    })),

    -- template snippet
    s("template", fmt([[
template "{}" {{
  {}
}}]], {
      i(1, "Name"),
      i(0),
    })),

    -- logic block
    s("logic", fmt([[
logic "{}" {{
  on_click: () => {{
    {}
  }}
}}]], {
      i(1, "handler"),
      i(0),
    })),

    -- @physics trait
    s("@physics", fmt([[
@physics {{
  mass: {}
  restitution: {}
  isStatic: {}
}}]], {
      i(1, "1.0"),
      i(2, "0.5"),
      i(3, "false"),
    })),

    -- type alias
    s("type", fmt("type {} = {}", {
      i(1, "Name"),
      i(2, "string | number"),
    })),

    -- manifest
    s("@manifest", fmt([[
@manifest {{
  title: "{}"
  maxPlayers: {}
}}]], {
      i(1, "My Scene"),
      i(2, "4"),
    })),
  })
end

-- ---------------------------------------------------------------------------
-- Export VS Code JSON (for users who want to save to a .json file)
-- ---------------------------------------------------------------------------

function M.export_vscode_json()
  return vim.fn.json_encode(M.vscode_snippets)
end

return M
