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

if (Test-Path -LiteralPath $unpackedDirectory -PathType Container) {
  Remove-Item -LiteralPath $unpackedDirectory -Recurse -Force
}

New-Item -ItemType Directory -Path $unpackedDirectory -Force | Out-Null
Copy-Item -Path (Join-Path $extensionDirectory "*") -Destination $unpackedDirectory -Recurse -Force

if (Test-Path -LiteralPath $archivePath -PathType Leaf) {
  Remove-Item -LiteralPath $archivePath -Force
}

Compress-Archive -Path (Join-Path $extensionDirectory "*") -DestinationPath $archivePath -CompressionLevel Optimal
Write-Output "Extension package created: $archivePath"
