# 校园 AI 助手 - 启动开发服务器
# 用法：在项目根目录双击 start.cmd，或在 PowerShell 中执行：
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\start.ps1

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

if (-not (Test-Path 'node_modules')) {
  Write-Host '[提示] 还没有安装依赖，请先双击 setup.cmd。' -ForegroundColor Yellow
  exit 1
}
if (-not (Test-Path 'apps/server/.env')) {
  Write-Host '[提示] 缺少 apps/server/.env，请先双击 setup.cmd，或从 .env.example 复制后填写。' -ForegroundColor Yellow
  exit 1
}

# 检查 3000 / 5173 是否已被占用（可能有旧的开发进程没关）
foreach ($port in @(3000, 5173)) {
  $busy = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
  if ($busy) {
    Write-Host "[提示] 端口 $port 已被占用，可能是上次的 pnpm dev 没关。请先结束旧进程再启动。" -ForegroundColor Yellow
    Write-Host "  结束方式：在任务管理器结束 node.exe，或运行 Get-Process node | Stop-Process"
    exit 1
  }
}

Write-Host '正在启动前端 + 后端（pnpm dev）... 关闭此窗口即停止服务。' -ForegroundColor Cyan
Write-Host '浏览器地址：http://localhost:5173' -ForegroundColor Green
Write-Host ''

# 等 Vite 就绪后再打开浏览器（后台任务，不阻塞开发服务器）
Start-Job -ScriptBlock {
  Start-Sleep -Seconds 6
  Start-Process 'http://localhost:5173'
} | Out-Null

pnpm dev
