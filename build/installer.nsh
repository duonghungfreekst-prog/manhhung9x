; =============================================================================
; DMH_Tools - NSIS Custom Install & Uninstall Hooks
; Dam bao khi go bo ung dung, toan bo key ban quyen tren may bi huy vinh vien
; =============================================================================
!macro customInit
  ; Tu dong tat tien trinh DMH_Tools cu dang chay de installer ghi de tap tin thanh cong
  nsExec::Exec 'taskkill /F /IM DMH_Tools.exe /T'
  Sleep 1000
!macroend

!macro customUnInstall
  ${ifNot} ${isUpdated}
    ; 1. Doc ActiveKeyHash hien tai va ghi vao RevokedKeys blacklist
    ReadRegStr $0 HKCU "Software\DMH_Tools\License" "ActiveKeyHash"
    ${If} $0 != ""
      ReadRegStr $1 HKCU "Software\DMH_Tools\License" "RevokedKeys"
      ${If} $1 != ""
        StrCpy $1 "$1,$0"
      ${Else}
        StrCpy $1 "$0"
      ${EndIf}
      WriteRegStr HKCU "Software\DMH_Tools\License" "RevokedKeys" $1
    ${EndIf}

    ; 2. Ghi nhan trang thai go cai dat vao Registry HKCU
    WriteRegStr HKCU "Software\DMH_Tools\License" "Status" "REVOKED_UNINSTALLED"
    WriteRegStr HKCU "Software\DMH_Tools\License" "UninstalledAt" "1"
    DeleteRegValue HKCU "Software\DMH_Tools\License" "ActiveKeyHash"
    DeleteRegValue HKCU "Software\DMH_Tools\License" "ActiveInstanceId"
  ${EndIf}

  ; 3. Bao toan thong tin HWID va moc dung thu (KHONG xoa .lic_sys hay .hwid_vault)
  ; Dam bao khi nguoi dung go app va cai lai, so ngay dung thu van khong bi reset
!macroend
