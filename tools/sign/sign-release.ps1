<#
.SYNOPSIS
  Authenticode-signs the FlipDAW release artifacts.

.DESCRIPTION
  Signings uses one of three key sources, checked in this order:

    1. $env:FLIPDAW_PFX          - a .pfx file (cloud HSM export, or a USB-token export)
    2. $env:FLIPDAW_CERT_THUMBPRINT - a certificate already in the Windows store
                                      (or exposed by a cloud HSM as a KSP/CSP)
    3. $env:FLIPDAW_SIGN_COMMAND  - an external signer CLI that receives the file path
                                      (ssl.com `sslctl`, DigiCert `smctl`, Azure `signtool` shim...)

  The RFC 3161 timestamp is always applied, so the signature stays valid after the
  certificate expires.

.EXAMPLE
  $env:FLIPDAW_CERT_THUMBPRINT = 'A1B2C3...'
  pwsh -File tools/sign/sign-release.ps1
#>
[CmdletBinding()]
param(
  [string[]] $Path,
  [string]   $TimestampUrl = 'http://timestamp.digicert.com'
)

$ErrorActionPreference = 'Stop'

if (-not $Path) {
  $bundle = Join-Path $PSScriptRoot '..\..\src-tauri\target\release\bundle'
  $Path = @()
  $appExe = Join-Path $PSScriptRoot '..\..\src-tauri\target\release\flipdaw.exe'
  if (Test-Path $appExe) { $Path += (Resolve-Path $appExe).Path }
  foreach ($glob in @("$bundle\nsis\*.exe", "$bundle\msi\*.msi")) {
    $Path += (Get-ChildItem $glob -ErrorAction SilentlyContinue | Select-Object -ExpandProperty FullName)
  }
  $release = Join-Path $PSScriptRoot '..\..\release'
  $Path += (Get-ChildItem "$release\*.exe", "$release\*.msi" -ErrorAction SilentlyContinue | Select-Object -ExpandProperty FullName)
}

if (-not $Path -or $Path.Count -eq 0) {
  Write-Error 'Nothing to sign: build the release first (`npm run desktop:build`).'
  exit 1
}

# --- locate signtool from the Windows SDK -------------------------------------
$signtool = Get-ChildItem 'C:\Program Files (x86)\Windows Kits\10\bin' -Recurse -Filter signtool.exe -ErrorAction SilentlyContinue |
  Where-Object { $_.FullName -match '\\x64\\' } |
  Sort-Object FullName | Select-Object -Last 1 -ExpandProperty FullName
if (-not $signtool) {
  Write-Error 'signtool.exe not found. Install "Windows SDK for Desktop Apps" (MSIX packaging tools).'
  exit 1
}

$pfx            = $env:FLIPDAW_PFX
$pfxPassword    = $env:FLIPDAW_PFX_PASSWORD
$thumbprint     = $env:FLIPDAW_CERT_THUMBPRINT
$externalSigner = $env:FLIPDAW_SIGN_COMMAND

if (-not $pfx -and -not $thumbprint -and -not $externalSigner) {
  Write-Warning @'
No signing key configured. Set one of:
  $env:FLIPDAW_CERT_THUMBPRINT  = '<thumbprint>'   # certificate in the Windows store
  $env:FLIPDAW_PFX              = 'C:\path\key.pfx' # + $env:FLIPDAW_PFX_PASSWORD
  $env:FLIPDAW_SIGN_COMMAND     = 'sslctl'         # any CLI that signs the file it is given

Artifacts were left UNSIGNED.
'@
  exit 1
}

foreach ($file in $Path) {
  if (-not (Test-Path $file)) { Write-Warning "skip (missing): $file"; continue }
  $name = Split-Path $file -Leaf

  if ($externalSigner) {
    Write-Host "[sign] $name via $externalSigner"
    & $externalSigner $file
    if ($LASTEXITCODE -ne 0) { throw "external signer failed for $file (exit $LASTEXITCODE)" }
    continue
  }

  $args = @('sign', '/fd', 'SHA256', '/td', 'SHA256', '/tr', $TimestampUrl)
  if ($pfx) {
    $args += @('/f', $pfx)
    if ($pfxPassword) { $args += @('/p', $pfxPassword) }
  } else {
    $args += @('/sha1', $thumbprint)
  }
  $args += @('/n', 'v', $file)

  Write-Host "[sign] $name"
  & $signtool @args
  if ($LASTEXITCODE -ne 0) { throw "signtool failed for $file (exit $LASTEXITCODE)" }
}

Write-Host "`n--- verification ---"
$failed = $false
foreach ($file in $Path) {
  if (-not (Test-Path $file)) { continue }
  $out = & $signtool verify /pa $file 2>&1
  $ok = $LASTEXITCODE -eq 0
  if (-not $ok) { $failed = $true }
  "{0,-42} {1}" -f (Split-Path $file -Leaf), $(if ($ok) { 'SIGNED (trusted)' } else { 'FAILED' })
  if (-not $ok) { $out | Select-Object -First 5 | ForEach-Object { "    $_" } }
}

# show who it is signed by, once, for the record
$signed = $Path | Where-Object { Test-Path $_ } | Select-Object -First 1
if ($signed) {
  $sig = Get-AuthenticodeSignature $signed
  "  subject : $($sig.SignerCertificate.Subject)"
  "  issuer  : $($sig.SignerCertificate.Issuer)"
  "  expires : $($sig.SignerCertificate.NotAfter)"
}

exit $(if ($failed) { 1 } else { 0 })