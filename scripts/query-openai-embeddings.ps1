# Run a codebase query with explicit OpenAI embeddings.
# Usage:
#   .\scripts\query-openai-embeddings.ps1 -Question "find auth handlers"
#   .\scripts\query-openai-embeddings.ps1 -Question "trace parser pipeline" -WithLlm -Model text-embedding-3-large

param(
    [Parameter(Mandatory = $true)]
    [string]$Question,
    [string]$Model = "text-embedding-3-small",
    [switch]$WithLlm,
    [string]$LlmProvider = "openai",
    [int]$TopK = 10,
    [string]$Dir = ".",
    [string]$EnvFile = ".env"
)

$RepoRoot = Split-Path -Parent $PSScriptRoot
$EnvPath = Join-Path $RepoRoot $EnvFile

if (Test-Path $EnvPath) {
    Get-Content $EnvPath | ForEach-Object {
        $line = $_.Trim()
        if ($line -and -not $line.StartsWith('#') -and $line.Contains('=')) {
            $pair = $line.Split('=', 2)
            $name = $pair[0].Trim()
            if ($name.StartsWith('export ')) {
                $name = $name.Substring(7).Trim()
            }
            $value = $pair[1].Trim().Trim('"').Trim("'")
            if ($name) { [Environment]::SetEnvironmentVariable($name, $value, 'Process') }
        }
    }
}

if (-not $env:OPENAI_API_KEY) {
    Write-Error "OPENAI_API_KEY not set. Add it to .env or current shell env."
    exit 1
}

Push-Location $RepoRoot
try {
    $cliArgs = @(
        "tsx", "packages/cli/src/cli.ts",
        "query", $Question,
        "--provider", "openai",
        "--model", $Model,
        "--top-k", "$TopK",
        "--dir", $Dir
    )

    if ($WithLlm) {
        $cliArgs += "--with-llm", "--llm", $LlmProvider
    }

    & pnpm exec @cliArgs
} finally {
    Pop-Location
}
