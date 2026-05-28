from PIL import Image, ImageDraw, ImageFont
import os

BASE_DIR = "documents/ui-ux"
SOL_DIR = os.path.join(BASE_DIR, "solution-management")
ART_DIR = os.path.join(BASE_DIR, "artifact-management")
os.makedirs(SOL_DIR, exist_ok=True)
os.makedirs(ART_DIR, exist_ok=True)

def get_font(size=14):
    # Try common monospace fonts for wireframe look
    for name in ["DejaVuSansMono", "LiberationMono", "Courier New", "NotoSansMonoCJK-Regular", "NotoSansCJK-Regular"]:
        try:
            return ImageFont.truetype(name, size)
        except:
            pass
    return ImageFont.load_default()

def get_font_bold(size=14):
    for name in ["DejaVuSansMono-Bold", "LiberationMono-Bold", "Courier New Bold", "NotoSansMonoCJK-Bold", "NotoSansCJK-Bold"]:
        try:
            return ImageFont.truetype(name, size)
        except:
            pass
    return get_font(size)

FONT = get_font(14)
FONT_SM = get_font(12)
FONT_LG = get_font_bold(18)
FONT_MD = get_font_bold(15)

def draw_rounded_rect(draw, xy, radius=6, outline="#555", fill=None, width=2):
    x1, y1, x2, y2 = xy
    draw.rounded_rectangle(xy, radius=radius, outline=outline, fill=fill, width=width)

def draw_button(draw, xy, text, bg="#e0e0e0", fg="#333"):
    x1, y1, x2, y2 = xy
    draw.rounded_rectangle(xy, radius=4, outline="#888", fill=bg, width=1)
    tw, th = draw.textbbox((0,0), text, font=FONT_SM)[2:]
    draw.text(((x1+x2-tw)//2, (y1+y2-th)//2), text, fill=fg, font=FONT_SM)

def draw_input(draw, xy, placeholder="", value=""):
    x1, y1, x2, y2 = xy
    draw.rounded_rectangle(xy, radius=4, outline="#aaa", fill="#fafafa", width=1)
    text = value if value else placeholder
    fill = "#333" if value else "#999"
    draw.text((x1+8, (y1+y2-FONT_SM.size)//2), text, fill=fill, font=FONT_SM)

# =============================================================================
# 1. Solution Selector (Landing Page)
# =============================================================================
def page_solution_selector():
    W, H = 1200, 800
    img = Image.new("RGB", (W, H), "#f4f4f4")
    draw = ImageDraw.Draw(img)

    # Header
    draw.rectangle([0, 0, W, 56], fill="#161616")
    draw.text((20, 18), "RobotOps Studio", fill="white", font=FONT_LG)
    draw.text((280, 22), "Solutions", fill="#c6c6c6", font=FONT_MD)
    draw.text((380, 22), "Artifacts", fill="#8d8d8d", font=FONT_MD)
    draw.text((W-140, 22), "v1.0.0", fill="#8d8d8d", font=FONT_SM)

    # Title bar
    draw.text((40, 80), "Select or create a Solution", fill="#161616", font=FONT_LG)
    draw_button(draw, (W-260, 76, W-140, 110), "+ Create Solution", bg="#0f62fe", fg="white")
    draw_button(draw, (W-130, 76, W-40, 110), "Import", bg="#e0e0e0", fg="#161616")

    # Search/filter bar
    draw_input(draw, (40, 130, 360, 164), placeholder="Search solutions...")
    draw.text((380, 140), "Recent: Customer-A-Site  |  Building-3-Deploy", fill="#0f62fe", font=FONT_SM)

    # Card grid
    cards = [
        ("Customer A — Site Alpha", "3号楼2层初次部署，共12台机器人", "2026-05-27", ["customer-a", "building-3"]),
        ("Customer B — Phase 1", "仓库区域首批8台机器人上线", "2026-05-25", ["customer-b", "warehouse"]),
        ("Internal Test Fleet", "研发测试机群，3台X100 + 2台X200", "2026-05-20", ["internal", "test"]),
        ("Demo — Shanghai Expo", "展会演示专用，已锁定配置", "2026-05-18", ["demo", "expo"]),
    ]
    cx, cy = 40, 200
    for i, (name, desc, date, tags) in enumerate(cards):
        x = cx + (i % 3) * 380
        y = cy + (i // 3) * 200
        draw_rounded_rect(draw, [x, y, x+360, y+180], fill="white", width=1)
        draw.text((x+16, y+16), name, fill="#161616", font=FONT_MD)
        draw.text((x+16, y+46), desc[:40]+("..." if len(desc)>40 else ""), fill="#525252", font=FONT_SM)
        draw.text((x+16, y+72), f"Modified: {date}", fill="#8d8d8d", font=FONT_SM)
        tx = x+16
        for t in tags:
            tw = draw.textbbox((0,0), t, font=FONT_SM)[2]
            draw.rounded_rectangle([tx, y+102, tx+tw+12, y+126], radius=10, fill="#e8e8e8", width=0)
            draw.text((tx+6, y+104), t, fill="#525252", font=FONT_SM)
            tx += tw + 20
        # Actions
        draw_button(draw, (x+16, y+144, x+90, y+168), "Open", bg="#0f62fe", fg="white")
        draw_button(draw, (x+100, y+144, x+170, y+168), "Export")
        draw_button(draw, (x+180, y+144, x+250, y+168), "Clone")
        draw_button(draw, (x+260, y+144, x+340, y+168), "Delete", bg="#fa4d56", fg="white")

    img.save(os.path.join(SOL_DIR, "01_solution_selector.png"))
    print("Saved solution-management/01_solution_selector.png")

# =============================================================================
# 2. Create Solution Modal
# =============================================================================
def page_create_solution():
    W, H = 1200, 800
    img = Image.new("RGB", (W, H), "#f4f4f4")
    draw = ImageDraw.Draw(img)
    # Background dim
    draw.rectangle([0,0,W,H], fill="#00000088")

    # Modal
    mx, my, mw, mh = 350, 180, 500, 420
    draw.rounded_rectangle([mx, my, mx+mw, my+mh], radius=8, fill="white", outline="#ccc", width=1)
    draw.text((mx+24, my+24), "Create New Solution", fill="#161616", font=FONT_LG)
    draw.text((mx+24, my+60), "All fields marked with * are required.", fill="#8d8d8d", font=FONT_SM)

    labels = [("Solution Name *", 110), ("Description", 190), ("Tags (comma separated)", 270)]
    for label, yoff in labels:
        draw.text((mx+24, my+yoff), label, fill="#161616", font=FONT_MD)
    draw_input(draw, (mx+24, my+135, mx+mw-24, my+169), value="Customer C — Site Gamma")
    draw_input(draw, (mx+24, my+215, mx+mw-24, my+249), value="5号楼1层新部署")
    draw_input(draw, (mx+24, my+295, mx+mw-24, my+329), value="customer-c, building-5")

    # Buttons
    draw_button(draw, (mx+mw-160, my+mh-56, mx+mw-24, my+mh-24), "Create", bg="#0f62fe", fg="white")
    draw_button(draw, (mx+mw-310, my+mh-56, mx+mw-174, my+mh-24), "Cancel")

    img.save(os.path.join(SOL_DIR, "02_create_solution_modal.png"))
    print("Saved solution-management/02_create_solution_modal.png")

# =============================================================================
# 3. Delete Confirm Modal
# =============================================================================
def page_delete_confirm():
    W, H = 1200, 800
    img = Image.new("RGB", (W, H), "#f4f4f4")
    draw = ImageDraw.Draw(img)
    draw.rectangle([0,0,W,H], fill="#00000088")

    mx, my, mw, mh = 350, 220, 500, 220
    draw.rounded_rectangle([mx, my, mx+mw, my+mh], radius=8, fill="white", outline="#ccc", width=1)
    draw.text((mx+24, my+24), "Delete Solution", fill="#161616", font=FONT_LG)
    draw.text((mx+24, my+64), "This action cannot be undone. All robots, configs,", fill="#525252", font=FONT_SM)
    draw.text((mx+24, my+86), "maps and logs under this solution will be permanently removed.", fill="#525252", font=FONT_SM)
    draw.text((mx+24, my+118), "Customer A — Site Alpha", fill="#fa4d56", font=FONT_SM)

    draw_button(draw, (mx+mw-160, my+mh-56, mx+mw-24, my+mh-24), "Delete", bg="#fa4d56", fg="white")
    draw_button(draw, (mx+mw-310, my+mh-56, mx+mw-174, my+mh-24), "Cancel")

    img.save(os.path.join(SOL_DIR, "03_delete_confirm_modal.png"))
    print("Saved solution-management/03_delete_confirm_modal.png")

# =============================================================================
# 4. Main Workspace (with active solution)
# =============================================================================
def page_main_workspace():
    W, H = 1200, 800
    img = Image.new("RGB", (W, H), "#f4f4f4")
    draw = ImageDraw.Draw(img)

    # Header
    draw.rectangle([0, 0, W, 56], fill="#161616")
    draw.text((20, 18), "RobotOps Studio", fill="white", font=FONT_LG)
    draw.text((280, 22), "Solutions", fill="#8d8d8d", font=FONT_MD)
    draw.text((380, 22), "Artifacts", fill="#8d8d8d", font=FONT_MD)
    draw.text((W-140, 22), "v1.0.0", fill="#8d8d8d", font=FONT_SM)

    # Active solution bar
    draw.rectangle([0, 56, W, 96], fill="#e8e8e8")
    draw.text((20, 64), "Active Solution:  Customer A — Site Alpha", fill="#161616", font=FONT_MD)
    draw_button(draw, (W-180, 62, W-100, 90), "Switch")
    draw_button(draw, (W-90, 62, W-20, 90), "Settings")

    # Left sidebar
    draw.rectangle([0, 96, 220, H], fill="#f4f4f4", outline="#e0e0e0", width=1)
    nav_items = ["Robots", "Upgrade Packages", "Maps", "Program Configs", "Diagnostics", "Logs"]
    for i, item in enumerate(nav_items):
        y = 120 + i*44
        fill = "#e0e0e0" if i == 1 else None
        if fill:
            draw.rectangle([4, y-4, 216, y+32], fill=fill)
        draw.text((24, y), item, fill="#161616", font=FONT)

    # Main content area placeholder
    draw.text((260, 120), "Upgrade Packages", fill="#161616", font=FONT_LG)
    draw.text((260, 160), "Select a BSP or OS upgrade package to deploy to robots.", fill="#525252", font=FONT_SM)

    # Package list placeholder
    draw_rounded_rect(draw, [260, 200, 580, 260], fill="white", width=1)
    draw.text((280, 220), "BSP v2.3.1", fill="#161616", font=FONT_MD)
    draw.text((280, 242), "Ref: bsp-v2-3-1-a7b2c3  |  16.0 MB", fill="#525252", font=FONT_SM)
    draw_button(draw, (480, 216, 560, 248), "Change")

    draw_button(draw, (260, 300, 420, 334), "+ Add Upgrade Package")

    img.save(os.path.join(SOL_DIR, "04_main_workspace.png"))
    print("Saved solution-management/04_main_workspace.png")

# =============================================================================
# 5. Artifact Manager
# =============================================================================
def page_artifact_manager():
    W, H = 1200, 800
    img = Image.new("RGB", (W, H), "#f4f4f4")
    draw = ImageDraw.Draw(img)

    # Header
    draw.rectangle([0, 0, W, 56], fill="#161616")
    draw.text((20, 18), "RobotOps Studio", fill="white", font=FONT_LG)
    draw.text((280, 22), "Solutions", fill="#8d8d8d", font=FONT_MD)
    draw.text((380, 22), "Artifacts", fill="#c6c6c6", font=FONT_MD)
    draw.text((W-140, 22), "v1.0.0", fill="#8d8d8d", font=FONT_SM)

    # Title
    draw.text((40, 80), "Artifact Manager", fill="#161616", font=FONT_LG)
    draw.text((40, 116), "Global binary artifacts shared across all solutions.", fill="#525252", font=FONT_SM)

    # Drop zone
    draw_rounded_rect(draw, [40, 150, W-40, 230], fill="#f4f4f4", outline="#0f62fe", width=2)
    draw.text((W//2-140, 178), "Drag & drop files here or click to browse", fill="#0f62fe", font=FONT_MD)
    draw.text((W//2-80, 202), "Supports batch upload", fill="#8d8d8d", font=FONT_SM)

    # Upload progress (one item)
    draw.text((40, 248), "Uploading: bsp_v2.3.1_release.fw  —  67%", fill="#161616", font=FONT_SM)
    draw.rectangle([40, 270, W-40, 280], fill="#e0e0e0")
    draw.rectangle([40, 270, 40+int((W-80)*0.67), 280], fill="#0f62fe")

    # Filter bar
    draw_input(draw, (40, 300, 300, 334), value="Search artifacts...")
    draw.text((320, 308), "Type: All  |  Sort: Recent  |  Show: Unreferenced only", fill="#0f62fe", font=FONT_SM)

    # Table header
    y = 360
    draw.rectangle([40, y, W-40, y+36], fill="#e0e0e0")
    cols = [("File Name", 180), ("Size", 320), ("Type", 420), ("Refs", 540), ("Uploaded", 680), ("Actions", 900)]
    for text, cx in cols:
        draw.text((cx, y+8), text, fill="#161616", font=FONT_MD)

    # Table rows
    rows = [
        ("bsp_v2.3.1_release.fw", "16.0 MB", "Firmware", "3", "2026-05-20", False),
        ("map_floor2_v1.png", "4.2 MB", "Map", "1", "2026-05-22", False),
        ("os_upgrade_v2.1.pkg", "128 MB", "OS Package", "0", "2026-05-18", True),
        ("config_default.zip", "256 KB", "Config", "2", "2026-05-25", False),
    ]
    for i, (fname, size, ctype, refs, date, orphan) in enumerate(rows):
        y = 400 + i*44
        fill = "#fff1f1" if orphan else "white"
        draw.rectangle([40, y, W-40, y+40], fill=fill, outline="#e0e0e0", width=1)
        draw.text((60, y+10), fname, fill="#161616", font=FONT_SM)
        draw.text((320, y+10), size, fill="#525252", font=FONT_SM)
        draw.text((420, y+10), ctype, fill="#525252", font=FONT_SM)
        ref_color = "#fa4d56" if orphan else "#161616"
        draw.text((540, y+10), refs, fill=ref_color, font=FONT_SM)
        if orphan:
            tw = draw.textbbox((0,0), "Unreferenced", font=FONT_SM)[2]
            draw.rounded_rectangle([590, y+8, 590+tw+8, y+28], radius=8, fill="#fa4d56", width=0)
            draw.text((594, y+10), "Unreferenced", fill="white", font=FONT_SM)
        draw.text((680, y+10), date, fill="#525252", font=FONT_SM)
        draw_button(draw, (900, y+6, 960, y+34), "View")
        draw_button(draw, (970, y+6, 1030, y+34), "Download")
        draw_button(draw, (1040, y+6, 1100, y+34), "Delete")

    img.save(os.path.join(ART_DIR, "01_artifact_manager.png"))
    print("Saved artifact-management/01_artifact_manager.png")

# =============================================================================
# 6. Artifact Selector (Modal / Drawer)
# =============================================================================
def page_artifact_selector():
    W, H = 1200, 800
    img = Image.new("RGB", (W, H), "#f4f4f4")
    draw = ImageDraw.Draw(img)
    # Dim background
    draw.rectangle([0,0,W,H], fill="#00000066")

    # Drawer from right
    dw = 560
    dx = W - dw
    draw.rectangle([dx, 0, W, H], fill="white")
    draw.line([dx, 0, dx, H], fill="#e0e0e0", width=2)

    draw.text((dx+24, 24), "Select Artifact", fill="#161616", font=FONT_LG)
    draw.text((dx+24, 56), "Choose an existing artifact or upload a new one.", fill="#525252", font=FONT_SM)

    # Search
    draw_input(draw, (dx+24, 90, dx+dw-24, 124), value="Search firmware...")
    draw.text((dx+24, 134), "Filter: Firmware  |  Sort: Recent", fill="#0f62fe", font=FONT_SM)

    # List
    items = [
        ("bsp_v2.3.1_release.fw", "16.0 MB", "SHA: e3b0c4...", True),
        ("bsp_v2.2.0_legacy.fw", "15.1 MB", "SHA: a1b2c3...", False),
        ("bsp_v2.3.2_beta.fw", "16.2 MB", "SHA: d4e5f6...", False),
    ]
    for i, (fname, size, sha, selected) in enumerate(items):
        y = 170 + i*70
        fill = "#e8f0fe" if selected else "white"
        draw.rectangle([dx+24, y, dx+dw-24, y+60], fill=fill, outline="#e0e0e0", width=1)
        draw.text((dx+40, y+10), fname, fill="#161616", font=FONT_MD)
        draw.text((dx+40, y+34), f"{size}  |  {sha}", fill="#525252", font=FONT_SM)
        if selected:
            draw.rounded_rectangle([dx+dw-80, y+18, dx+dw-40, y+42], radius=10, fill="#0f62fe", width=0)
            draw.text((dx+dw-72, y+22), "OK", fill="white", font=FONT_SM)

    # Bottom actions
    draw.line([dx, H-80, W, H-80], fill="#e0e0e0", width=1)
    draw_button(draw, (dx+24, H-60, dx+160, H-28), "+ Upload New Artifact", bg="#0f62fe", fg="white")
    draw_button(draw, (dx+dw-160, H-60, dx+dw-24, H-28), "Confirm Selection", bg="#0f62fe", fg="white")
    draw_button(draw, (dx+dw-310, H-60, dx+dw-174, H-28), "Cancel")

    img.save(os.path.join(ART_DIR, "02_artifact_selector.png"))
    print("Saved artifact-management/02_artifact_selector.png")

# =============================================================================
# 7. Artifact Detail
# =============================================================================
def page_artifact_detail():
    W, H = 1200, 800
    img = Image.new("RGB", (W, H), "#f4f4f4")
    draw = ImageDraw.Draw(img)

    # Header
    draw.rectangle([0, 0, W, 56], fill="#161616")
    draw.text((20, 18), "RobotOps Studio", fill="white", font=FONT_LG)
    draw.text((280, 22), "Solutions", fill="#8d8d8d", font=FONT_MD)
    draw.text((380, 22), "Artifacts", fill="#c6c6c6", font=FONT_MD)
    draw.text((W-140, 22), "v1.0.0", fill="#8d8d8d", font=FONT_SM)

    # Back link
    draw.text((40, 80), "<  Back to Artifacts", fill="#0f62fe", font=FONT_MD)

    # Detail card
    draw_rounded_rect(draw, [40, 120, W-40, 420], fill="white", width=1)
    draw.text((60, 140), "bsp_v2.3.1_release.fw", fill="#161616", font=FONT_LG)
    draw.text((60, 176), "ID: bsp-v2-3-1-a7b2c3", fill="#525252", font=FONT_SM)

    fields = [
        ("File Name", "bsp_v2.3.1_release.fw"),
        ("Size", "16,777,216 bytes (16.0 MB)"),
        ("Content Type", "application/x-firmware"),
        ("Checksum (SHA-256)", "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"),
        ("Created At", "2026-05-20T08:00:00.000Z"),
        ("Reference Count", "3"),
        ("Tags", "bsp, x100, release"),
    ]
    for i, (label, value) in enumerate(fields):
        y = 210 + i*28
        draw.text((60, y), label+":", fill="#8d8d8d", font=FONT_SM)
        draw.text((220, y), value, fill="#161616", font=FONT_SM)

    # Metadata section
    draw.text((60, 410), "Custom Metadata", fill="#161616", font=FONT_MD)
    draw.text((60, 440), "version: 2.3.1  |  targetModel: X100  |  releaseDate: 2026-05-18", fill="#525252", font=FONT_SM)

    # Actions
    draw_button(draw, (60, 480, 160, 514), "Download", bg="#0f62fe", fg="white")
    draw_button(draw, (180, 480, 280, 514), "Edit Tags")
    draw_button(draw, (W-140, 480, W-40, 514), "Delete", bg="#fa4d56", fg="white")

    img.save(os.path.join(ART_DIR, "03_artifact_detail.png"))
    print("Saved artifact-management/03_artifact_detail.png")

if __name__ == "__main__":
    page_solution_selector()
    page_create_solution()
    page_delete_confirm()
    page_main_workspace()
    page_artifact_manager()
    page_artifact_selector()
    page_artifact_detail()
    print("\nAll UI sketches generated in", BASE_DIR)
