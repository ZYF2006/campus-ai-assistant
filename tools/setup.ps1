# 校园 AI 助手 - 首次安装（换电脑后先运行一次）
# 用法：在项目根目录双击 setup.cmd，或在 PowerShell 中执行：
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\setup.ps1
param(
  [switch]$CheckOnly
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

function Fail($message) {
  Write-Host ''
  Write-Host "[失败] $message" -ForegroundColor Red
  exit 1
}

Write-Host '=== 1/4 检查 Node.js ===' -ForegroundColor Cyan
$nodeVersionText = $null
try { $nodeVersionText = (node -v 2>$null) } catch { }
if (-not $nodeVersionText) {
  Fail '没有找到 Node.js。请先安装 Node.js 22 LTS：https://nodejs.org/zh-cn/download'
}
$nodeVersion = [version]($nodeVersionText.TrimStart('v'))
if ($nodeVersion -lt [version]'20.19.0') {
  Fail "Node.js 版本过低（当前 $nodeVersionText，要求 >= 20.19.0）。请升级到 Node.js 22 LTS。"
}
Write-Host "  Node.js $nodeVersionText OK"

Write-Host '=== 2/4 检查 pnpm ===' -ForegroundColor Cyan
$pnpmVersionText = $null
try { $pnpmVersionText = (pnpm -v 2>$null) } catch { }
if (-not $pnpmVersionText) {
  Write-Host '  未找到 pnpm，尝试用 corepack 安装 pnpm 11 ...'
  try {
    corepack enable 2>$null
    corepack prepare pnpm@11.22.0 --activate 2>$null
    $pnpmVersionText = (pnpm -v 2>$null)
  } catch { }
  if (-not $pnpmVersionText) {
    Write-Host '  corepack 不可用，改用 npm 全局安装 pnpm ...'
    npm install -g pnpm@11 2>&1 | Out-Host
    $pnpmVersionText = (pnpm -v 2>$null)
  }
  if (-not $pnpmVersionText) {
    Fail 'pnpm 安装失败。请手动执行：npm install -g pnpm@11，然后重新运行本脚本。'
  }
}
Write-Host "  pnpm $pnpmVersionText OK"

Write-Host '=== 3/4 检查 MySQL（127.0.0.1:3306） ===' -ForegroundColor Cyan
$mysqlOk = $false
try {
  $client = New-Object System.Net.Sockets.TcpClient
  $connect = $client.BeginConnect('127.0.0.1', 3306, $null, $null)
  if ($connect.AsyncWaitHandle.WaitOne(1500)) {
    $client.EndConnect($connect)
    $mysqlOk = $true
  }
  $client.Close()
} catch { }

if (-not $mysqlOk) {
  Write-Host '  [警告] 连不上 3306 端口：MySQL 未安装，或服务未启动。' -ForegroundColor Yellow
  Write-Host '  请先安装 MySQL 8 Community Server（安装时记住 root 密码），并确认服务正在运行：'
  Write-Host '    Get-Service MySQL80'
  Write-Host '  如果本机已经装过 MySQL，在“服务”里启动 MySQL80 即可。'
  Write-Host ''
} else {
  Write-Host '  MySQL 端口 OK'
}

Write-Host '=== 4/4 检查依赖 ===' -ForegroundColor Cyan
if (Test-Path 'node_modules') {
  Write-Host '  node_modules 已存在，可跳过安装'
} elseif ($CheckOnly) {
  Write-Host '  node_modules 不存在（-CheckOnly 模式不安装）'
}

if (-not (Test-Path 'apps/server/.env')) {
  Write-Host '  [提示] apps/server/.env 不存在，正在从 .env.example 复制；请随后填写真实 API Key 和 MySQL 密码。' -ForegroundColor Yellow
  Copy-Item 'apps/server/.env.example' 'apps/server/.env'
}

if ($CheckOnly) {
  Write-Host ''
  Write-Host '检查完成（-CheckOnly：未安装依赖、未初始化数据库）。' -ForegroundColor Green
  exit 0
}

if (-not (Test-Path 'node_modules')) {
  Write-Host ''
  Write-Host '开始安装依赖（pnpm install，首次约需 1~3 分钟）...' -ForegroundColor Cyan
  pnpm install
  if ($LASTEXITCODE -ne 0) { Fail 'pnpm install 失败，请把上面的报错发给老师/同学。' }
}

Write-Host ''
Write-Host '开始初始化数据库（pnpm db:init）...' -ForegroundColor Cyan
pnpm db:init
if ($LASTEXITCODE -ne 0) {
  Write-Host ''
  Write-Host '[失败] 数据库初始化失败。常见原因：' -ForegroundColor Red
  Write-Host '  1. MySQL 服务没启动：Get-Service MySQL80'
  Write-Host '  2. apps/server/.env 里的 MYSQL_PASSWORD 与本机 root 密码不一致'
  Write-Host '  3. 本机 MySQL 端口不是 3306（改 apps/server/.env 的 MYSQL_PORT）'
  exit 1
}

Write-Host ''
Write-Host '安装完成。以后启动项目请双击 start.cmd（或运行 pnpm dev）。' -ForegroundColor Green
