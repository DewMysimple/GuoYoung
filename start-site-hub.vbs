Option Explicit

Dim shell, fso, root, result, ready, i
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

root = fso.GetParentFolderName(WScript.ScriptFullName)
shell.CurrentDirectory = root

If Not fso.FolderExists(root & "\node_modules") Then
  result = shell.Run("cmd /c npm install", 0, True)
  If result <> 0 Then
    MsgBox "Dependency installation failed. Check your network and try again.", 16, "Site Hub"
    WScript.Quit 1
  End If
End If

ready = IsServerReady()

If Not ready Then
  shell.Run "node ""node_modules\vite\bin\vite.js"" --host 127.0.0.1 --port 5173", 0, False
  For i = 1 To 60
    WScript.Sleep 100
    If IsServerReady() Then
      ready = True
      Exit For
    End If
  Next
End If

shell.Run "http://localhost:5173", 1, False

Function IsServerReady()
  Dim request
  On Error Resume Next
  Set request = CreateObject("WinHttp.WinHttpRequest.5.1")
  request.SetTimeouts 100, 100, 100, 100
  request.Open "GET", "http://127.0.0.1:5173", False
  request.Send
  IsServerReady = (Err.Number = 0 And request.Status >= 200 And request.Status < 500)
  Err.Clear
  On Error GoTo 0
End Function
