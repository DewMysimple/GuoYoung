param([Parameter(Mandatory)][string]$ProfilePath, [ValidateSet('allow', 'deny')][string]$Action)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

# Scope UI automation to the Chromium instance with our fresh, isolated profile.
$browser = Get-CimInstance Win32_Process -Filter "name='chrome.exe'" | Where-Object {
  $_.CommandLine -like "*$ProfilePath*" -and $_.CommandLine -notmatch '--type='
} | Select-Object -First 1
if (-not $browser) { throw 'Isolated Chromium process not found' }
$condition = [System.Windows.Automation.PropertyCondition]::new(
  [System.Windows.Automation.AutomationElement]::ProcessIdProperty, [int]$browser.ProcessId)
$labels = if ($Action -eq 'allow') { @('Allow', (([char]0x5141).ToString() + [char]0x8bb8)) }
  else { @('Deny', (([char]0x62d2).ToString() + [char]0x7edd)) }
$deadline = [DateTime]::UtcNow.AddSeconds(8)
do {
  $window = [System.Windows.Automation.AutomationElement]::RootElement.FindFirst(
    [System.Windows.Automation.TreeScope]::Children, $condition)
  if ($window) {
    $buttons = $window.FindAll([System.Windows.Automation.TreeScope]::Descendants,
      [System.Windows.Automation.PropertyCondition]::new(
        [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
        [System.Windows.Automation.ControlType]::Button))
    foreach ($button in $buttons) {
      if ($button.Current.IsEnabled -and $labels -contains $button.Current.Name) {
        # Chromium protects a just-opened permission dialog from accidental clicks.
        Start-Sleep -Milliseconds 700
        $button.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke()
        Write-Output "Native permission dialog: $Action"
        return
      }
    }
  }
  Start-Sleep -Milliseconds 100
} while ([DateTime]::UtcNow -lt $deadline)
throw "Native permission dialog button not found: $Action"
