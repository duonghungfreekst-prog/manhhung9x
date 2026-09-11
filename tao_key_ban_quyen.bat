@echo off
chcp 65001 >nul
title DMH TOOLS - BỘ TẠO KEY BẢN QUYỀN (ADMIN)
color 0b
cls
echo ======================================================================
echo           DMH TOOLS - CÔNG CỤ TẠO KEY BẢN QUYỀN THƯƠNG MẠI
echo                  (DÀNH RIÊNG CHO QUẢN TRỊ VIÊN)
echo ======================================================================
echo.
node scripts\keygen_admin.mjs
echo.
pause
