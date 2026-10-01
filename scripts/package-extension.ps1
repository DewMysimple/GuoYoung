$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$extensionDirectory = Join-Path $projectRoot "dist-extension"
$artifactsDirectory = Join-Path $projectRoot "artifacts"
$unpackedDirectory = Join-Path $artifactsDirectory "site-hub-extension"
$archivePath = Join-Path $artifactsDirectory "site-hub-extension.zip"

if (-not (Test-Path -LiteralPath $extensionDirectory -PathType Container)) {
  throw "Extension build directory not found: $extensionDirectory"
}

$manifestPath = Join-Path $extensionDirectory "manifest.json"
if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
  throw "Extension manifest not found: $manifestPath"
}

New-Item -ItemType Directory -Path $artifactsDirectory -Force | Out-Null

# Keep the browser-loaded directory and old hashed assets alive until reload.
# The ZIP is built only from dist-extension, so retained assets are not shipped.
$pendingArchivePath = Join-Path $artifactsDirectory "site-hub-extension.pending.zip"
Compress-Archive -Path (Join-Path $extensionDirectory "*") -DestinationPath $pendingArchivePath -CompressionLevel Optimal -Force
New-Item -ItemType Directory -Path $unpackedDirectory -Force | Out-Null
Copy-Item -Path (Join-Path $extensionDirectory "*") -Destination $unpackedDirectory -Recurse -Force

Move-Item -LiteralPath $pendingArchivePath -Destination $archivePath -Force
Write-Output "Extension package created: $archivePath"
