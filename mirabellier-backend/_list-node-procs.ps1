Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  Select-Object ProcessId, ParentProcessId, CreationDate,
    @{ Name = 'Cmd'; Expression = { $_.CommandLine } } |
  Format-List
