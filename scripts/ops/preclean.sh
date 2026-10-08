# Kill every process started from the isolated clone, then make sure the build output is really gone.
preclean() {
  powershell -NoProfile -Command "\$ids=(Get-CimInstance Win32_Process -Filter \"Name='node.exe' or Name='workerd.exe' or Name='esbuild.exe'\" | Where-Object { \$_.CommandLine -and (\$_.CommandLine -like '*scratchpad\deploy*' -or \$_.CommandLine -like '*scratchpad/deploy*') }).ProcessId; foreach(\$i in \$ids){ try { Stop-Process -Id \$i -Force -ErrorAction Stop } catch {} }" > /dev/null 2>&1
  for port in 8787 3100; do for p in $(netstat -ano | grep -E "[:.]$port[[:space:]].*LISTENING" | awk '{print $NF}' | sort -u); do [ "$p" != "0" ] && taskkill //F //T //PID $p > /dev/null 2>&1; done; done
  sleep 2
}
