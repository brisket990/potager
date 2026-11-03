# Fabrique l'APK de l'appli « Mon potager ».
#   powershell -ExecutionPolicy Bypass -File appli\construire.ps1
#
# La protection anti-rançongiciel de Windows (accès contrôlé aux dossiers) empêche Java d'écrire dans Documents :
# on construit donc dans une copie hors de Documents (%LOCALAPPDATA%\MonPotager\appli), puis l'APK est recopié
# dans appli\apk\. Java 25 (Temurin) fait tourner Gradle 9.1 ; le SDK est celui d'Android Studio.
$ErrorActionPreference = 'Stop'
$appli = $PSScriptRoot
$copie = Join-Path $env:LOCALAPPDATA 'MonPotager\appli'
$env:JAVA_HOME = 'C:\Program Files\Eclipse Adoptium\jdk-25.0.5.8-hotspot'
$env:ANDROID_HOME = Join-Path $env:LOCALAPPDATA 'Android\Sdk'

Write-Host '1. Code commun du site et fichiers de l''appli'
Push-Location $appli
node preparer.mjs
npx cap sync android
Pop-Location

Write-Host "2. Copie de travail : $copie"
# /MIR : copie identique ; on garde les caches de construction de la copie (.gradle, build) pour aller plus vite.
robocopy $appli $copie /MIR /NFL /NDL /NJH /NJS /NP /XD .gradle build apk /XF *.apk | Out-Null
if ($LASTEXITCODE -ge 8) { throw "Copie impossible (robocopy $LASTEXITCODE)" }

Write-Host '3. Construction (la première fois, téléchargement des composants Android : quelques minutes)'
Push-Location (Join-Path $copie 'android')
.\gradlew.bat assembleDebug --console=plain
$code = $LASTEXITCODE
Pop-Location
if ($code -ne 0) { throw "La construction a échoué (code $code)." }

$apk = Join-Path $copie 'android\app\build\outputs\apk\debug\app-debug.apk'
New-Item -ItemType Directory -Force (Join-Path $appli 'apk') | Out-Null
$sortie = Join-Path $appli 'apk\mon-potager.apk'
Copy-Item $apk $sortie -Force
Write-Host ("APK prêt : {0} ({1:N1} Mo)" -f $sortie, ((Get-Item $sortie).Length / 1MB))
