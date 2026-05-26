param(
  [string]$BaseUrl = "http://127.0.0.1:5176"
)

$ErrorActionPreference = "Stop"

function Invoke-JsonRequest {
  param(
    [string]$Method,
    [string]$Url,
    [object]$Body = $null
  )

  $headers = @{ "Content-Type" = "application/json" }

  if ($null -eq $Body) {
    return Invoke-RestMethod -Method $Method -Uri $Url -Headers $headers
  }

  return Invoke-RestMethod -Method $Method -Uri $Url -Headers $headers -Body ($Body | ConvertTo-Json -Depth 20)
}

$statusUrl = "$BaseUrl/api/ai/status"
$adviceUrl = "$BaseUrl/api/ai/operation-advice"

Write-Host "Checking AI status: $statusUrl"
$status = Invoke-JsonRequest -Method "GET" -Url $statusUrl
Write-Host "Status provider: $($status.provider)"
Write-Host "Configured provider: $($status.configuredProvider)"
Write-Host "Has API key: $($status.hasApiKey)"
Write-Host "Model: $($status.model)"

$request = @{
  request = @{
    scenario = "operation-diagnosis"
    responseLanguage = "zh-CN"
    context = @{
      contextVersion = "v1"
      generatedAt = (Get-Date).ToUniversalTime().ToString("o")
      platform = "TEMU"
      storeId = "demo-store"
      storeName = "Demo Store"
      operatorId = "demo-operator"
      operatorName = "Demo Operator"
      storeSnapshots = @(
        @{
          platform = "TEMU"
          storeId = "demo-store"
          storeName = "Demo Store"
          operatorId = "demo-operator"
          operatorName = "Demo Operator"
        }
      )
      dateRange = @{
        startDate = "2026-05-01"
        endDate = "2026-05-07"
      }
      anomalySummary = @{
        total = 1
        criticalCount = 0
        warningCount = 1
        watchCount = 0
      }
      anomalies = @(
        @{
          anomalyId = "demo-anomaly"
          metricKey = "conversionRate"
          metricName = "转化率"
          level = "warning"
          recentValue = 0.018
          baselineValue = 0.032
          changeRate = -0.4375
          ruleName = "转化率下降"
          explanation = "最近 7 天转化率低于基准。"
        }
      )
      relatedMetrics = @()
      possibleReasons = @(
        @{
          reasonCode = "price_competitiveness_drop"
          reasonName = "价格竞争力下降"
          confidence = "medium"
          evidence = @("转化率下降")
          needHumanCheck = $true
        }
      )
      recommendedActions = @(
        @{
          actionCode = "check_price_coupon_competitors"
          actionName = "检查价格、优惠和竞品变化"
          priority = "high"
          ownerRole = "store_operator"
          actionSteps = @("对比竞品价格", "检查优惠券和活动价")
          expectedEffect = "确认是否由报价竞争力不足导致转化下降"
          riskNote = "降价前需评估毛利和库存压力"
        }
      )
      historyCases = @()
      dataQualityNotes = @()
    }
  }
}

Write-Host "Checking AI advice proxy: $adviceUrl"
$advice = Invoke-JsonRequest -Method "POST" -Url $adviceUrl -Body $request

Write-Host "Advice provider: $($advice.provider)"
Write-Host "Advice model: $($advice.model)"
Write-Host "Request ID: $($advice.requestId)"
Write-Host "Summary: $($advice.summary)"

if (-not $advice.provider -or -not $advice.requestId -or -not $advice.summary) {
  throw "AI advice response is missing required fields."
}

Write-Host "AI proxy check passed."
