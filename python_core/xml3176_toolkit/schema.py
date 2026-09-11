from __future__ import annotations

# Mapping này dùng để dựng lại XML đúng wrapper/list/record tag. Trường dữ liệu thực tế
# được lấy động từ file XML hoặc từ Excel, nên vẫn chạy được khi BHXH bổ sung trường mới.
XML_STRUCTURE = {
    "XML1":  {"root": "TONG_HOP", "list": None, "record": "TONG_HOP"},
    "XML2":  {"root": "CHITIEU_CHITIET_THUOC", "list": "DSACH_CHI_TIET_THUOC", "record": "CHI_TIET_THUOC"},
    "XML3":  {"root": "CHITIEU_CHITIET_DVKT_VTYT", "list": "DSACH_CHI_TIET_DVKT", "record": "CHI_TIET_DVKT"},
    "XML4":  {"root": "CHITIEU_CHITIET_DICHVUCANLAMSANG", "list": "DSACH_CHI_TIET_CLS", "record": "CHI_TIET_CLS"},
    "XML5":  {"root": "CHITIEU_CHITIET_DIENBIENLAMSANG", "list": "DSACH_CHI_TIET_DIEN_BIEN_BENH", "record": "CHI_TIET_DIEN_BIEN_BENH"},
    "XML6":  {"root": "CHI_TIEU_HO_SO_BENH_AN_CHAM_SOC_VA_DIEU_TRI_HIV_AIDS", "list": "DSACH_HO_SO_BENH_AN_CHAM_SOC_VA_DIEU_TRI_HIV_AIDS", "record": "HO_SO_BENH_AN_CHAM_SOC_VA_DIEU_TRI_HIV_AIDS"},
    "XML7":  {"root": "CHI_TIEU_DU_LIEU_GIAY_RA_VIEN", "list": None, "record": "CHI_TIEU_DU_LIEU_GIAY_RA_VIEN"},
    "XML8":  {"root": "CHI_TIEU_DU_LIEU_TOM_TAT_HO_SO_BENH_AN", "list": None, "record": "CHI_TIEU_DU_LIEU_TOM_TAT_HO_SO_BENH_AN"},
    "XML9":  {"root": "CHI_TIEU_DU_LIEU_GIAY_CHUNG_SINH", "list": "DSACH_GIAYCHUNGSINH", "record": "DU_LIEU_GIAY_CHUNG_SINH"},
    "XML10": {"root": "CHI_TIEU_DU_LIEU_GIAY_NGHI_DUONG_THAI", "list": None, "record": "CHI_TIEU_DU_LIEU_GIAY_NGHI_DUONG_THAI"},
    "XML11": {"root": "CHI_TIEU_DU_LIEU_GIAY_CHUNG_NHAN_NGHI_VIEC_HUONG_BAO_HIEM_XA_HOI", "list": None, "record": "CHI_TIEU_DU_LIEU_GIAY_CHUNG_NHAN_NGHI_VIEC_HUONG_BAO_HIEM_XA_HOI"},
    "XML13": {"root": "CHI_TIEU_GIAYCHUYENTUYEN", "list": None, "record": "CHI_TIEU_GIAYCHUYENTUYEN"},
    "XML14": {"root": "CHI_TIEU_GIAYHEN_KHAMLAI", "list": None, "record": "CHI_TIEU_GIAYHEN_KHAMLAI"},
    "XML15": {"root": "CHI_TIEU_DIEUTRI_BENHLAO", "list": "DSACH_CHITIET_DIEUTRI_BENHLAO", "record": "CHITIET_DIEUTRI_BENHLAO"},
}

DEFAULT_ORDER = ["XML1", "XML2", "XML3", "XML4", "XML5", "XML6", "XML7", "XML8", "XML9", "XML10", "XML11", "XML13", "XML14", "XML15"]
