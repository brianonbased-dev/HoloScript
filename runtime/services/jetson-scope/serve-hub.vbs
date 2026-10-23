' Watchdog starter for the Metal hub (dashboard + LAN join surface).
'
' HEAL-ONLY by default: if something is already serving 8477 this exits and changes
' nothing, so the repeating trigger cannot bounce a healthy hub. Pass "force" to
' recycle deliberately -- that frees the listen ports first, the way this always did.
'
' Why a watchdog at all: the task fired on logon only, with no restart on failure. The
' one time the node process died, the dashboard simply stayed gone until the next
' reboot and nothing anywhere said so. dashboard.html is read from disk per request,
' so page edits never need a recycle -- only jetson-scope.mjs changes do.
Set sh = CreateObject("WScript.Shell")
force = False
If WScript.Arguments.Count > 0 Then
  If LCase(WScript.Arguments(0)) = "force" Then force = True
End If

' Exit code 0 from this probe means the dashboard port already has a listener.
alive = (sh.Run("powershell.exe -NoProfile -WindowStyle Hidden -Command ""if (Get-NetTCPConnection -LocalPort 8477 -State Listen -ErrorAction SilentlyContinue) { exit 0 } else { exit 1 }""", 0, True) = 0)

If alive And Not force Then
  WScript.Quit 0
End If

If force Then
  sh.Run "powershell.exe -NoProfile -WindowStyle Hidden -Command ""$conns = Get-NetTCPConnection -LocalPort 8477,8478 -State Listen -ErrorAction SilentlyContinue; foreach ($c in @($conns)) { Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue }""", 0, True
  WScript.Sleep 1500
End If

' NOTE: this launches the live runtime checkout's copy, not this tree.
sh.Run """C:\Program Files\nodejs\node.exe"" ""C:\holo\runtime\services\jetson-scope\jetson-scope.mjs"" serve", 0, False
