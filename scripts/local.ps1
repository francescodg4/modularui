<#
.SYNOPSIS
    Build and run a local Appsmith instance from this repository, using deploy/docker/docker-compose.yml.

.DESCRIPTION
    "build" compiles the server jar and the client in Docker containers (no local Java or Node needed), then builds
    the image modularui/appsmith-ce:local: the official image with this repository's editor and server on top
    (deploy/docker/Dockerfile.local). "start" runs that image; pass -Official to run the official image instead.
    Data is kept in deploy\docker\stacks either way.

.EXAMPLE
    .\scripts\local.ps1 build            # build the image from the current checkout
    .\scripts\local.ps1 start            # start the local image (builds it first if it does not exist)
    .\scripts\local.ps1 rebuild          # build, then restart on the new image
    .\scripts\local.ps1 rebuild -SkipServer   # client-only change: reuse the last server jar
    .\scripts\local.ps1 start -Official  # run the official image instead
    .\scripts\local.ps1 stop
    .\scripts\local.ps1 status
    .\scripts\local.ps1 logs
#>
param(
    [Parameter(Position = 0)]
    [ValidateSet("build", "rebuild", "start", "stop", "restart", "status", "logs")]
    [string]$Action = "start",

    # Run the official image instead of the one built from this repository.
    [switch]$Official,

    # Reuse the last client build in deploy\docker\local-build instead of building it again.
    [switch]$SkipClient,

    # Reuse the last server jar in deploy\docker\local-build instead of building it again.
    [switch]$SkipServer,

    # Image the local build is layered on. Keep it close to this branch: plugins, RTS and MCP come from it.
    [string]$BaseImage = "appsmith/appsmith-ce:release",

    # Seconds to wait for the server to answer its health check after starting.
    [int]$TimeoutSeconds = 300
)

$ErrorActionPreference = "Stop"

$RepoRoot = Join-Path $PSScriptRoot ".." | Resolve-Path
$DockerDir = Join-Path $RepoRoot "deploy\docker"
$ComposeFile = Join-Path $DockerDir "docker-compose.yml"
$LocalComposeFile = Join-Path $DockerDir "docker-compose.local.yml"
$StageDir = Join-Path $DockerDir "local-build"
$LocalImage = "modularui/appsmith-ce:local"
$Url = "http://localhost:8080"
$HealthUrl = "$Url/api/v1/health"

# Build containers and their caches. The client is built in a Docker volume: installing node_modules on a Windows
# bind mount is very slow.
$MavenImage = "maven:3.9-eclipse-temurin-25"
$NodeImage = "node:24.14.1"
$MavenCacheVolume = "appsmith-m2"
$ClientWorkVolume = "modularui-client"
$YarnCacheVolume = "modularui-yarn"

function Invoke-Native {
    param([string]$Description, [string[]]$Arguments)
    # Build tools write progress and warnings to stderr. When the output is redirected, Windows PowerShell turns each
    # stderr line into an error record, which "Stop" makes fatal. Fail on the exit code only.
    $ErrorActionPreference = "Continue"
    & docker @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "$Description failed with exit code $LASTEXITCODE"
    }
}

function Invoke-Compose {
    $files = @("-f", $ComposeFile)
    if (-not $Official) {
        $files += @("-f", $LocalComposeFile)
    }
    Invoke-Native "docker compose $($args -join ' ')" (@("compose") + $files + $args)
}

function Test-ImageExists([string]$Image) {
    $ErrorActionPreference = "Continue"
    & docker image inspect $Image *> $null
    return $LASTEXITCODE -eq 0
}

function Build-Server {
    Write-Host "Building the server jar (Maven in Docker)..." -ForegroundColor Cyan
    $serverDir = Join-Path $RepoRoot "app\server"
    Invoke-Native "Server build" @(
        "run", "--rm",
        "-v", "${serverDir}:/src",
        "-v", "${MavenCacheVolume}:/root/.m2",
        "-w", "/src",
        $MavenImage,
        "mvn", "-B", "-ntp", "-pl", "appsmith-server", "-am", "package", "-DskipTests"
    )

    $jar = Get-ChildItem (Join-Path $serverDir "appsmith-server\target") -Filter "server-*.jar" |
        Where-Object { $_.Name -notlike "original-*" } |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 1
    if (-not $jar) {
        throw "The server build produced no server-*.jar in app\server\appsmith-server\target."
    }
    Copy-Item $jar.FullName (Join-Path $StageDir "server.jar") -Force
}

function Build-Client {
    Write-Host "Building the client (Node in Docker)..." -ForegroundColor Cyan
    $clientDir = Join-Path $RepoRoot "app\client"
    $editorDir = Join-Path $StageDir "editor"
    New-Item -ItemType Directory -Force $editorDir | Out-Null
    $sha = (& git -C $RepoRoot rev-parse HEAD).Trim()

    # No double quotes in this script: Windows PowerShell does not pass them to native commands reliably.
    $script = @(
        "set -e",
        "rm -rf /work/src",
        "cd /src",
        "tar --exclude=./node_modules --exclude=./.yarn/cache --exclude=./build -cf - . | (cd /work && tar -xf -)",
        "cd /work",
        "corepack enable",
        "yarn install --immutable",
        "node --max-old-space-size=16384 scripts/build.js",
        "rm -rf /out/*",
        "cp -r build/. /out/"
    ) -join " && "

    Invoke-Native "Client build" @(
        "run", "--rm",
        "-v", "${clientDir}:/src:ro",
        "-v", "${editorDir}:/out",
        "-v", "${ClientWorkVolume}:/work",
        "-v", "${YarnCacheVolume}:/root/.yarn/berry",
        "-e", "COREPACK_ENABLE_DOWNLOAD_PROMPT=0",
        "-e", "REACT_APP_SENTRY_RELEASE=$sha",
        "-e", "REACT_APP_CLIENT_LOG_LEVEL=ERROR",
        $NodeImage,
        "bash", "-c", $script
    )
}

function Build-Image {
    New-Item -ItemType Directory -Force $StageDir | Out-Null

    if ($SkipServer) {
        if (-not (Test-Path (Join-Path $StageDir "server.jar"))) {
            throw "-SkipServer needs a previous server build in $StageDir."
        }
    } else {
        Build-Server
    }

    if ($SkipClient) {
        if (-not (Test-Path (Join-Path $StageDir "editor\index.html"))) {
            throw "-SkipClient needs a previous client build in $StageDir."
        }
    } else {
        Build-Client
    }

    Write-Host "Building image $LocalImage on $BaseImage..." -ForegroundColor Cyan
    Invoke-Native "Image build" @(
        "build",
        "-f", (Join-Path $DockerDir "Dockerfile.local"),
        "--build-arg", "BASE_IMAGE=$BaseImage",
        "-t", $LocalImage,
        $StageDir
    )
    Write-Host "Built $LocalImage" -ForegroundColor Green
}

function Assert-LocalImage {
    if ($Official) {
        return
    }
    if (-not (Test-ImageExists $LocalImage)) {
        Write-Host "$LocalImage does not exist yet; building it." -ForegroundColor Yellow
        Build-Image
    }
}

function Test-Healthy {
    try {
        $response = Invoke-WebRequest -Uri $HealthUrl -UseBasicParsing -TimeoutSec 5
        return $response.StatusCode -eq 200
    } catch {
        return $false
    }
}

function Wait-Healthy {
    Write-Host "Waiting for Appsmith to become healthy (up to $TimeoutSeconds s)..."
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        if (Test-Healthy) {
            Write-Host "Appsmith is up at $Url" -ForegroundColor Green
            return
        }
        Start-Sleep -Seconds 5
    }
    Write-Warning "Appsmith did not answer $HealthUrl within $TimeoutSeconds s. Check '.\scripts\local.ps1 logs'."
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw "Docker is not installed or not on PATH."
}
# Windows PowerShell turns native stderr into a terminating error under "Stop", so relax it for this probe.
$ErrorActionPreference = "Continue"
& docker info *> $null
$dockerExitCode = $LASTEXITCODE
$ErrorActionPreference = "Stop"
if ($dockerExitCode -ne 0) {
    throw "Docker daemon is not running. Start Docker Desktop and try again."
}

$imageLabel = if ($Official) { "official image" } else { $LocalImage }

switch ($Action) {
    "build" {
        Build-Image
    }
    "rebuild" {
        Build-Image
        Invoke-Compose up -d --force-recreate
        Wait-Healthy
    }
    "start" {
        Assert-LocalImage
        Write-Host "Starting Appsmith ($imageLabel)..."
        Invoke-Compose up -d
        Wait-Healthy
    }
    "stop" {
        Invoke-Compose down
        Write-Host "Appsmith stopped. Data is kept in deploy\docker\stacks."
    }
    "restart" {
        Assert-LocalImage
        Invoke-Compose down
        Write-Host "Starting Appsmith ($imageLabel)..."
        Invoke-Compose up -d
        Wait-Healthy
    }
    "status" {
        Invoke-Compose ps
        if (Test-Healthy) {
            Write-Host "Health check OK: $Url" -ForegroundColor Green
        } else {
            Write-Host "Health check not responding: $HealthUrl" -ForegroundColor Yellow
        }
    }
    "logs" {
        Invoke-Compose logs -f --tail 200
    }
}
