[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
param(
  [Parameter(Position = 0)]
  [ValidateSet('variable', 'split', 'symbols', 'all')]
  [string]$Type = 'variable'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$sourceFolder = Join-Path $projectRoot 'out\ttf'
$fontsFolder = Join-Path $env:LOCALAPPDATA 'Microsoft\Windows\Fonts'
$fontsRegistryPath = 'HKCU:\Software\Microsoft\Windows NT\CurrentVersion\Fonts'

$allFonts = @(
  @{
    File = 'antimono.ttf'
    RegistryName = 'Antimono Variable (TrueType)'
  }
  @{
    File = 'antimono_regular.ttf'
    RegistryName = 'Antimono Regular (TrueType)'
  }
  @{
    File = 'antimono_regular-italic.ttf'
    RegistryName = 'Antimono Italic (TrueType)'
  }
  @{
    File = 'antimono_bold.ttf'
    RegistryName = 'Antimono Bold (TrueType)'
  }
  @{
    File = 'antimono_bold-italic.ttf'
    RegistryName = 'Antimono Bold Italic (TrueType)'
  }
  @{
    File = 'antimono_symbols.ttf'
    RegistryName = 'Antimono Symbols (TrueType)'
  }
)

$selectedFiles = switch ($Type) {
  'variable' { @('antimono.ttf') }
  'split' {
    @(
      'antimono_regular.ttf'
      'antimono_regular-italic.ttf'
      'antimono_bold.ttf'
      'antimono_bold-italic.ttf'
    )
  }
  'symbols' { @('antimono_symbols.ttf') }
  'all' { @($allFonts.File) }
}

$fonts = @(
  $allFonts | Where-Object { $_.File -in $selectedFiles }
)

$missingFiles = @(
  foreach ($font in $fonts) {
    $source = Join-Path $sourceFolder $font.File
    if (-not (Test-Path -LiteralPath $source -PathType Leaf)) {
      $source
    }
  }
)

if ($missingFiles.Count -gt 0) {
  $missingList = $missingFiles -join [Environment]::NewLine
  throw "Missing generated TTF files. Run the Antimono build first:$([Environment]::NewLine)$missingList"
}

if (-not ('Antimono.FontInstaller.NativeMethods' -as [type])) {
  Add-Type -TypeDefinition @'
namespace Antimono.FontInstaller {
  using System;
  using System.Runtime.InteropServices;

  public static class NativeMethods {
    [DllImport("gdi32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern int AddFontResourceEx(string name, uint flags, IntPtr reserved);

    [DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Auto)]
    public static extern IntPtr SendMessageTimeout(
      IntPtr hWnd,
      uint Msg,
      UIntPtr wParam,
      IntPtr lParam,
      uint fuFlags,
      uint uTimeout,
      out UIntPtr lpdwResult
    );
  }
}
'@
}

$installedCount = 0
if (-not (Test-Path -LiteralPath $fontsFolder)) {
  New-Item -ItemType Directory -Path $fontsFolder | Out-Null
}
if (-not (Test-Path -LiteralPath $fontsRegistryPath)) {
  New-Item -Path $fontsRegistryPath | Out-Null
}
foreach ($font in $fonts) {
  $source = Join-Path $sourceFolder $font.File
  $destination = Join-Path $fontsFolder $font.File

  if (-not $PSCmdlet.ShouldProcess($destination, "Install $($font.RegistryName)")) {
    continue
  }

  Copy-Item -LiteralPath $source -Destination $destination -Force
  New-ItemProperty -Path $fontsRegistryPath -Name $font.RegistryName -Value $destination -PropertyType String -Force | Out-Null
  $loadedFonts = [Antimono.FontInstaller.NativeMethods]::AddFontResourceEx($destination, 0, [IntPtr]::Zero)
  if ($loadedFonts -eq 0) {
    Write-Warning "Windows did not immediately load $($font.File); the persistent registration was still written."
  }
  $installedCount++
  Write-Host "Installed $($font.File)"
}

if ($installedCount -eq 0) {
  return
}

$hwndBroadcast = [IntPtr]0xFFFF
$wmFontChange = 0x001D
$smtoAbortIfHung = 0x0002
$result = [UIntPtr]::Zero
[void][Antimono.FontInstaller.NativeMethods]::SendMessageTimeout(
  $hwndBroadcast,
  $wmFontChange,
  [UIntPtr]::Zero,
  [IntPtr]::Zero,
  $smtoAbortIfHung,
  1000,
  [ref]$result
)

Write-Host "Installed $installedCount Antimono TTF file(s) for the current Windows user ($Type)."
