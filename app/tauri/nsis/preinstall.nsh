; Kill running Jarvis AI processes before installing to prevent file-lock errors
!macro NSIS_HOOK_PREINSTALL
  DetailPrint "Closing Jarvis AI if running..."
  nsExec::ExecToLog 'taskkill /F /IM jarvis.exe /T'
  nsExec::ExecToLog 'taskkill /F /IM server.exe /T'
  Sleep 1000
!macroend
