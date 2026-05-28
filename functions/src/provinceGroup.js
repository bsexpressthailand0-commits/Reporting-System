exports.getProvinceGroup = (province) => {
  const nine = [
    "กรุงเทพมหานคร",
    "ชลบุรี",
    "สมุทรปราการ",
    "นครปฐม",
    "สมุทรสาคร",
    "ปทุมธานี",
    "ราชบุรี",
    "นนทบุรี",
    "สมุทรสงคราม"
  ];

  const normalized = String(province || "").trim().replace(/\s+/g, "");

  return nine.some(p => p.replace(/\s+/g, "") === normalized)
    ? "9_PROVINCES"
    : "68_PROVINCES";
};
