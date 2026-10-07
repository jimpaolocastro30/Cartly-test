param([Parameter(Mandatory = $true)][string]$ManifestPath)

# Renders each { text, file } entry in the JSON manifest to a WAV file.
Add-Type -AssemblyName System.Speech
$items = Get-Content -Raw -Path $ManifestPath | ConvertFrom-Json
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer

$preferred = $synth.GetInstalledVoices() |
  ForEach-Object { $_.VoiceInfo.Name } |
  Where-Object { $_ -match 'Zira|Aria|Jenny' } |
  Select-Object -First 1
if ($preferred) { $synth.SelectVoice($preferred) }
$synth.Rate = 0

foreach ($item in $items) {
  $synth.SetOutputToWaveFile($item.file)
  $synth.Speak($item.text)
}
$synth.SetOutputToNull()
$synth.Dispose()
