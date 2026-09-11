@echo off
chcp 65001 >nul
title DMH Tools - Auto-Publish Update to GitHub

echo ===============================================================
echo   HỆ THỐNG TỰ ĐỘNG ĐẨY BẢN PHÁT HÀNH LÊN GITHUB RELEASES
echo   DMH Tools Suite (c) DMH Healthcare ^& Computer Tech
echo ===============================================================
echo.

node scripts/publish_release.mjs %*

echo.
echo Nhấn phím bất kỳ để thoát...
pause >nul
