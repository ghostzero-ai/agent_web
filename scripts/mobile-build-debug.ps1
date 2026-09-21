[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^https://')]
    [string]$ServerUrl,

    [string]$JdkHome = 'E:\development\Java\microsoft-jdk-21\jdk-21.0.12.1+1',

    [string]$AndroidSdkRoot = 'E:\development\Android\sdk'
)

$ErrorActionPreference = 'Stop'

$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$webRoot = Join-Path $repositoryRoot 'web'
$javaExecutable = Join-Path $JdkHome 'bin\java.exe'
$adbExecutable = Join-Path $AndroidSdkRoot 'platform-tools\adb.exe'
$apkPath = Join-Path $webRoot 'android\app\build\outputs\apk\debug\app-debug.apk'

if (-not (Test-Path -LiteralPath $javaExecutable)) {
    throw "JDK executable not found: $javaExecutable"
}
if (-not (Test-Path -LiteralPath $adbExecutable)) {
    throw "Android SDK platform-tools not found: $adbExecutable"
}

$previousJavaHome = $env:JAVA_HOME
$previousAndroidHome = $env:ANDROID_HOME
$previousAndroidSdkRoot = $env:ANDROID_SDK_ROOT
$previousBuildProfile = $env:CAPACITOR_BUILD_PROFILE
$previousServerUrl = $env:CAPACITOR_SERVER_URL

Push-Location $webRoot
try {
    $env:JAVA_HOME = $JdkHome
    $env:ANDROID_HOME = $AndroidSdkRoot
    $env:ANDROID_SDK_ROOT = $AndroidSdkRoot
    $env:CAPACITOR_BUILD_PROFILE = 'spike'
    $env:CAPACITOR_SERVER_URL = $ServerUrl

    npm run mobile:sync
    if ($LASTEXITCODE -ne 0) { throw 'Capacitor sync failed.' }

    npm run mobile:build:debug
    if ($LASTEXITCODE -ne 0) { throw 'Android Debug APK build failed.' }

    if (-not (Test-Path -LiteralPath $apkPath)) {
        throw "Build completed without the expected APK: $apkPath"
    }

    $apk = Get-Item -LiteralPath $apkPath
    $hash = Get-FileHash -Algorithm SHA256 -LiteralPath $apkPath
    Write-Host "Debug APK: $($apk.FullName)"
    Write-Host "Size: $($apk.Length) bytes"
    Write-Host "SHA256: $($hash.Hash)"
}
finally {
    Remove-Item Env:CAPACITOR_BUILD_PROFILE -ErrorAction SilentlyContinue
    Remove-Item Env:CAPACITOR_SERVER_URL -ErrorAction SilentlyContinue
    npm run mobile:sync

    if ($null -eq $previousJavaHome) { Remove-Item Env:JAVA_HOME -ErrorAction SilentlyContinue }
    else { $env:JAVA_HOME = $previousJavaHome }
    if ($null -eq $previousAndroidHome) { Remove-Item Env:ANDROID_HOME -ErrorAction SilentlyContinue }
    else { $env:ANDROID_HOME = $previousAndroidHome }
    if ($null -eq $previousAndroidSdkRoot) { Remove-Item Env:ANDROID_SDK_ROOT -ErrorAction SilentlyContinue }
    else { $env:ANDROID_SDK_ROOT = $previousAndroidSdkRoot }
    if ($null -ne $previousBuildProfile) { $env:CAPACITOR_BUILD_PROFILE = $previousBuildProfile }
    if ($null -ne $previousServerUrl) { $env:CAPACITOR_SERVER_URL = $previousServerUrl }
    Pop-Location
}
