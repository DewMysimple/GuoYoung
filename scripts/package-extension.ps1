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

Compress-Archive -Path (Join-Path $extensionDirectory "*") -DestinationPath $archivePath -CompressionLevel Optimal -Force
# Replace current files from the actual archive, retaining resources used by open tabs.
Expand-Archive -LiteralPath $archivePath -DestinationPath $unpackedDirectory -Force

Get-ChildItem -LiteralPath $extensionDirectory -File -Recurse | ForEach-Object {
  $relativePath = $_.FullName.Substring($extensionDirectory.Length + 1)
  $installedPath = Join-Path $unpackedDirectory $relativePath
  if ((Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash -ne (Get-FileHash -LiteralPath $installedPath -Algorithm SHA256).Hash) {
    throw "Unpacked extension differs from build: $relativePath"
  }
}
Write-Output "Extension package created: $archivePath"
Write-Output "Extension unpacked and verified: $unpackedDirectory"
