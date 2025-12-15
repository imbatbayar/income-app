param(
  [string]$Root = (Get-Location).Path,
  [string]$OutDir = "Data",
  [ValidateSet("full","delta")] [string]$Mode = "full"
)

# ---------------------------
# BUNDLE: code-only snapshot
# include: app/src/pages/components/lib + key configs
# exclude: node_modules, .next, dist/build, public assets, Data, logs, etc.
# delta mode: only files changed since last run (tracked in Data\.bundle_state.json)
# ---------------------------

$ErrorActionPreference = "Stop"

function Ensure-Dir($p) { New-Item -ItemType Directory -Force $p | Out-Null }

function Is-TextFile($path) {
  # quick binary check: if first 4KB contains 0 byte -> treat as binary
  try {
    $fs = [System.IO.File]::OpenRead($path)
    try {
      $buf = New-Object byte[] 4096
      $read = $fs.Read($buf, 0, $buf.Length)
      for ($i=0; $i -lt $read; $i++) { if ($buf[$i] -eq 0) { return $false } }
      return $true
    } finally { $fs.Dispose() }
  } catch { return $false }
}

$Root = (Resolve-Path $Root).Path
$OutDirPath = Join-Path $Root $OutDir
Ensure-Dir $OutDirPath

$now = Get-Date
$stamp = $now.ToString("yyyyMMdd_HHmmss")
$outFile = Join-Path $OutDirPath ("BUNDLE__CODE_ONLY__{0}.txt" -f $stamp)

$stateFile = Join-Path $OutDirPath ".bundle_state.json"
$lastUtc = $null
if ($Mode -eq "delta" -and (Test-Path $stateFile)) {
  try {
    $state = Get-Content $stateFile -Raw | ConvertFrom-Json
    if ($state.lastRunUtc) { $lastUtc = [DateTime]::Parse($state.lastRunUtc).ToUniversalTime() }
  } catch { $lastUtc = $null }
}

# ---- include dirs (top-level) ----
$includeDirs = @("app","src","pages","components","lib")

# ---- include key config files (root-level) ----
$includeFiles = @(
  "package.json","package-lock.json","pnpm-lock.yaml","yarn.lock",
  "next.config.js","next.config.mjs",
  "tsconfig.json","jsconfig.json",
  "tailwind.config.js","tailwind.config.ts",
  "postcss.config.js","postcss.config.mjs",
  "eslint.config.js",".eslintrc",".eslintrc.json",
  ".prettierrc",".prettierrc.json","prettier.config.js",
  "supabase\config.toml",
  ".env.example",".env.local.example"
)

# ---- exclude dirs anywhere ----
$excludeDirNames = @(
  "node_modules",".next","dist","build","out","coverage",
  ".git",".svn",".vscode",
  "public",       # assets ихэвчлэн том — хүсвэл авч болно
  "Data","logs","log","tmp",".turbo"
)

# ---- exclude file patterns ----
$excludeFileRegex = @(
  '\.png$','\.jpg$','\.jpeg$','\.webp$','\.gif$','\.svg$','\.ico$',
  '\.mp4$','\.mov$','\.mp3$','\.wav$',
  '\.pdf$','\.zip$','\.7z$','\.rar$',
  '\.exe$','\.dll$',
  '\.map$'
)

# Helper: decide skip by directory
function Should-SkipByDir($fullPath) {
  $parts = $fullPath.Split([System.IO.Path]::DirectorySeparatorChar, [System.StringSplitOptions]::RemoveEmptyEntries)
  foreach ($d in $excludeDirNames) {
    if ($parts -contains $d) { return $true }
  }
  return $false
}

# Collect candidates
$candidates = New-Object System.Collections.Generic.List[string]

foreach ($d in $includeDirs) {
  $p = Join-Path $Root $d
  if (Test-Path $p) {
    Get-ChildItem $p -Recurse -File -Force | ForEach-Object {
      $fp = $_.FullName
      if (Should-SkipByDir $fp) { return }
      foreach ($rx in $excludeFileRegex) { if ($fp -match $rx) { return } }
      if ($Mode -eq "delta" -and $lastUtc -ne $null) {
        if ($_.LastWriteTimeUtc -le $lastUtc) { return }
      }
      $candidates.Add($fp)
    }
  }
}

foreach ($f in $includeFiles) {
  $p = Join-Path $Root $f
  if (Test-Path $p) { $candidates.Add((Resolve-Path $p).Path) }
}

# De-dup + sort
$files = $candidates | Sort-Object -Unique

# Write bundle
$nl = "`r`n"
$hdr = @()
$hdr += "BUNDLE__CODE_ONLY"
$hdr += ("Root: {0}" -f $Root)
$hdr += ("Mode: {0}" -f $Mode)
$hdr += ("Generated: {0}" -f $now.ToString("yyyy-MM-dd HH:mm:ss"))
if ($Mode -eq "delta") {
  $hdr += ("LastRunUtc: {0}" -f ($(if($lastUtc){$lastUtc.ToString("o")} else {"<none>"})))
}
$hdr += ("Files: {0}" -f $files.Count)
$hdr += ("="*80)
[System.IO.File]::WriteAllText($outFile, ($hdr -join $nl) + $nl, [System.Text.Encoding]::UTF8)

$written = 0
$skippedBinary = 0
$skippedErrors = 0

foreach ($fp in $files) {
  try {
    if (Should-SkipByDir $fp) { continue }
    if (-not (Is-TextFile $fp)) { $skippedBinary++; continue }

    $rel = [System.IO.Path]::GetRelativePath($Root, $fp)
    $head = @()
    $head += ""
    $head += ("# FILE: {0}" -f $rel)
    $head += ("# LASTWRITE: {0}" -f ((Get-Item $fp).LastWriteTime.ToString("yyyy-MM-dd HH:mm:ss")))
    $head += ("-"*80)
    Add-Content -Path $outFile -Value ($head -join $nl) -Encoding UTF8

    # Preserve file exactly (as text)
    $content = Get-Content -Path $fp -Raw -ErrorAction Stop
    Add-Content -Path $outFile -Value $content -Encoding UTF8
    Add-Content -Path $outFile -Value $nl -Encoding UTF8

    $written++
  } catch {
    $skippedErrors++
    $rel = $fp
    try { $rel = [System.IO.Path]::GetRelativePath($Root, $fp) } catch {}
    Add-Content -Path $outFile -Value ("`r`n# FILE: {0}`r`n# ERROR: {1}`r`n" -f $rel, $_.Exception.Message) -Encoding UTF8
  }
}

# Update state for delta mode
$state = [PSCustomObject]@{ lastRunUtc = (Get-Date).ToUniversalTime().ToString("o") }
$state | ConvertTo-Json | Set-Content -Path $stateFile -Encoding UTF8

# Final footer
$footer = @()
$footer += ""
$footer += ("="*80)
$footer += ("Written: {0}" -f $written)
$footer += ("SkippedBinary: {0}" -f $skippedBinary)
$footer += ("SkippedErrors: {0}" -f $skippedErrors)
Add-Content -Path $outFile -Value ($footer -join $nl) -Encoding UTF8

Write-Host ("OK -> {0}" -f $outFile)
