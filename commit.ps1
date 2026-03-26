$status = git status -s
foreach ($line in $status) { if ($line.Trim() -ne "") { $file = $line.Substring(3).Trim(); if (Test-Path $file) { git add $file } } }
git commit -m "fix(mcp,core): update Moltbook agent prompt and resolve Vector3/HSPlusRuntime structural drift"
git push
