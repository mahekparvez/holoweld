[CmdletBinding()]
param(
    [string]$Unity = "$env:ProgramFiles\Unity\Hub\Editor\2022.3.62f1\Editor\Unity.exe",
    [switch]$ExportOnly
)
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
if (!(Test-Path -LiteralPath $Unity)) {
    throw 'Install Unity 2022.3.62f1 with Universal Windows Platform Build Support or pass -Unity <Unity.exe>.'
}
$build = Join-Path $root 'Builds'
$uwp = Join-Path $build 'UWP'
$packages = Join-Path $build 'Packages'
New-Item -ItemType Directory -Force $build | Out-Null

function Invoke-Unity([string]$method, [string]$log, [string]$target) {
    $arguments = @('-batchmode','-nographics','-quit','-projectPath',('"' + $root + '"'),
        '-executeMethod',"HoloWeld.EditorTools.WorkshopBuild.$method",'-logFile',('"' + $log + '"'))
    if ($target) { $arguments += @('-buildTarget',$target) }
    $process = Start-Process -FilePath $Unity -ArgumentList $arguments -Wait -PassThru
    if ($process.ExitCode -ne 0) {
        throw "Unity $method failed (exit $($process.ExitCode)). See $log. Close other Unity instances using the project and confirm Unity is activated."
    }
}

if (!$ExportOnly) {
    $vswhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
    if (!(Test-Path -LiteralPath $vswhere)) { throw 'Install Visual Studio 2022 with UWP and ARM64 C++ support.' }
    $msbuild = & $vswhere -latest -products '*' -requires Microsoft.Component.MSBuild -find 'MSBuild\**\Bin\MSBuild.exe' |
        Select-Object -First 1
    if (!$msbuild) { throw 'MSBuild was not found in Visual Studio.' }
    $sdkBin = "${env:ProgramFiles(x86)}\Windows Kits\10\bin"
    $sign = Get-ChildItem -LiteralPath $sdkBin -Filter signtool.exe -File -Recurse |
        Where-Object { $_.Directory.Name -eq 'x64' -and $_.Directory.Parent.Name -match '^10\.' } |
        Sort-Object { [version]$_.Directory.Parent.Name } -Descending | Select-Object -First 1
    if (!$sign) { throw 'Install a Windows SDK with SignTool.' }
}
Invoke-Unity 'PrepareBatch' (Join-Path $build 'unity-prepare.log') ''
Invoke-Unity 'ExportUwp' (Join-Path $build 'unity-uwp.log') 'WindowsStoreApps'
if ($ExportOnly) { Write-Output "Open the solution in $uwp"; return }

$solution = Get-ChildItem -LiteralPath $uwp -Filter '*.sln' -File | Select-Object -First 1
if (!$solution) { throw 'Unity completed but no UWP solution was found.' }
$manifest = Get-ChildItem -LiteralPath $uwp -Filter 'Package.appxmanifest' -File -Recurse |
    Where-Object { $_.FullName -notmatch '\\(?:build|bin|obj|AppPackages)\\' } | Select-Object -First 1
if (!$manifest) { throw 'No generated app manifest was found.' }
[xml]$xml = Get-Content -LiteralPath $manifest.FullName -Raw
$xml.Package.Identity.SetAttribute('Publisher','CN=HOLOWELD')
$xml.Save($manifest.FullName)

$compileStarted = [DateTime]::UtcNow
$buildArgs = @($solution.FullName, '/restore', '/m', '/p:Configuration=Release', '/p:Platform=ARM64',
    '/p:GenerateAppxPackageOnBuild=true', '/p:AppxBundle=Never', '/p:UapAppxPackageBuildMode=SideloadOnly',
    '/p:AppxPackageSigningEnabled=false', ("/p:AppxPackageDir=" + $packages.Replace("\","/") + "/"))
& $msbuild @buildArgs
if ($LASTEXITCODE -ne 0) { throw "MSBuild failed (exit $LASTEXITCODE)." }
$package = Get-ChildItem -LiteralPath $packages -Recurse -File |
    Where-Object { $_.Extension -in '.appx','.msix' -and $_.FullName -notmatch '\\Dependencies\\' -and
        $_.LastWriteTimeUtc -ge $compileStarted.AddSeconds(-2) } |
    Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1
if (!$package) { throw 'MSBuild finished but no new ARM64 .appx or .msix was found.' }

$cert = Get-ChildItem Cert:\CurrentUser\My -CodeSigningCert |
    Where-Object { $_.Subject -eq 'CN=HOLOWELD' -and $_.HasPrivateKey -and $_.NotAfter -gt (Get-Date).AddDays(14) } |
    Sort-Object NotAfter -Descending | Select-Object -First 1
if (!$cert) {
    $certificateOptions = @{
        Type = 'CodeSigningCert'; Subject = 'CN=HOLOWELD'; CertStoreLocation = 'Cert:\CurrentUser\My'
        KeyExportPolicy = 'NonExportable'; HashAlgorithm = 'SHA256'; KeyUsage = 'DigitalSignature'
        NotAfter = (Get-Date).AddYears(1)
    }
    $cert = New-SelfSignedCertificate @certificateOptions
}
& $sign.FullName sign /fd SHA256 /sha1 $cert.Thumbprint $package.FullName
if ($LASTEXITCODE -ne 0) { throw "SignTool failed (exit $LASTEXITCODE)." }
$publicCert = Join-Path $package.Directory.FullName 'HOLOWELD-dev.cer'
Export-Certificate -Cert $cert -FilePath $publicCert -Force | Out-Null
Write-Output "Installer: $($package.FullName)"
Write-Output "Public signing certificate: $publicCert"
Write-Output 'If Device Portal asks for dependencies, use the package folder Dependencies\ARM64 files.'
