[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$OutputPath
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech

$synthesizer = [System.Speech.Synthesis.SpeechSynthesizer]::new()
try {
    $preferredVoices = @(
        'Microsoft Huihui',
        'Microsoft Huihui Desktop',
        'Microsoft Yaoyao',
        'Microsoft Kangkang'
    )
    $installedVoices = @(
        $synthesizer.GetInstalledVoices() |
            ForEach-Object { $_.VoiceInfo.Name }
    )
    $selectedVoice = $preferredVoices |
        Where-Object { $installedVoices -contains $_ } |
        Select-Object -First 1
    if (-not $selectedVoice) {
        throw 'No compatible zh-CN System.Speech voice is installed.'
    }

    $synthesizer.SelectVoice($selectedVoice)
    $synthesizer.Rate = 3
    $synthesizer.Volume = 100
    $synthesizer.SetOutputToWaveFile($OutputPath)

    $narration = [System.Speech.Synthesis.PromptBuilder]::new(
        [System.Globalization.CultureInfo]::GetCultureInfo('zh-CN')
    )
    $narration.AppendText('一个 MCP App 能显示，并不代表它符合规范。')
    $narration.AppendBreak([TimeSpan]::FromMilliseconds(500))
    $narration.AppendText('这个例子故意写错了 MIME 类型。页面看似正常，但 MCP App Lab 会直接标出兼容性错误，并告诉你问题出在 APP003。')
    $narration.AppendBreak([TimeSpan]::FromMilliseconds(500))
    $narration.AppendText('它连接真实的标准输入输出，或者 HTTP 服务，把 App 放进两个不同来源的双层 iframe 沙箱。资源、内容安全策略、消息来源和能力声明，会同时接受确定性检查。')
    $narration.AppendBreak([TimeSpan]::FromMilliseconds(400))
    $narration.AppendText('修改参数并运行工具以后，App、调用结果和 Inspector 会一起更新。你可以马上判断，问题发生在资源、消息桥、沙箱策略，还是浏览器渲染这一层。')
    $narration.AppendBreak([TimeSpan]::FromMilliseconds(400))
    $narration.AppendText('每条 MCP 和 bridge 消息都会进入协议轨迹。交互还能脱敏导出，并进行确定性回放。')
    $narration.AppendBreak([TimeSpan]::FromMilliseconds(500))
    $narration.AppendText('仓库同时提供九个故意做坏的夹具，以及 Playwright 视觉回归。MCP App Lab 已经开源，几分钟就能测试你自己的 App。')

    $synthesizer.Speak($narration)
    Write-Output ('Voiceover saved with {0}: {1}' -f $selectedVoice, $OutputPath)
}
finally {
    $synthesizer.Dispose()
}
