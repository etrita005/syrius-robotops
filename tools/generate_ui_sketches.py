"""
generate_ui_sketches.py
Quickly produce PNG wireframe sketches for key RobotOps Studio screens.
Uses Pillow only; no external UI framework needed.

Run:  python tools/generate_ui_sketches.py
Output: documents/ui-ux/solution-management/*.png
"""

import os
from PIL import Image, ImageDraw, ImageFont

BASE_DIR = os.path.join(os.path.dirname(__file__), "..", "documents", "ui-ux", "solution-management")
SOL_DIR = os.path.join(BASE_DIR, "solution-management")
os.makedirs(SOL_DIR, exist_ok=True)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def get_font(size: int) -> ImageFont.FreeTypeFont:
    """Try to load a system TTF; fall back to default bitmap font."""
    candidates = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
        "C:/Windows/Fonts/arial.ttf",
    ]
    for path in candidates:
        if os.path.exists(path):
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()

FONT_LG = get_font(20)
FONT_MD = get_font(14)
FONT_SM = get_font(12)
FONT    = get_font(13)

def draw_button(draw, bbox, text, bg="#e0e0e0", fg="#161616", font=FONT):
    x1, y1, x2, y2 = bbox
    draw.rectangle(bbox, fill=bg, outline="#c6c6c6", width=1)
    tw, th = draw.textsize(text, font=font) if hasattr(draw, "textsize") else (len(text)*7, 14)
    draw.text(((x1+x2-tw)//2, (y1+y2-th)//2), text, fill=fg, font=font)

def draw_input(draw, bbox, placeholder="", font=FONT):
    x1, y1, x2, y2 = bbox
    draw.rectangle(bbox, fill="white", outline="#8d8d8d", width=1)
    if placeholder:
        draw.text((x1+8, (y1+y2)//2-6), placeholder, fill="#a8a8a8", font=font)

def draw_card(draw, bbox, title, desc, tags, corrupted=False):
    x1, y1, x2, y2 = bbox
    fill = "#fff0f0" if corrupted else "white"
    draw.rectangle(bbox, fill=fill, outline="#e0e0e0", width=1)
    draw.text((x1+16, y1+12), title, fill="#161616", font=FONT_MD)
    draw.text((x1+16, y1+36), desc[:80], fill="#525252", font=FONT_SM)
    tx = x1 + 16
    for t in tags[:3]:
        tw = len(t)*7 + 12
        draw.rounded_rectangle([tx, y1+58, tx+tw, y1+76], radius=4, fill="#e0e0e0")
        draw.text((tx+6, y1+60), t, fill="#161616", font=FONT_SM)
        tx += tw + 6
    draw_button(draw, (x2-140, y1+14, x2-70, y1+42), "Open")
    draw_button(draw, (x2-60, y1+14, x2-16, y1+42), "Delete", bg="#fa4d56", fg="white")

# ---------------------------------------------------------------------------
# 1. Solution Selector (landing page)
# ---------------------------------------------------------------------------
def page_solution_selector():
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

    # Content
    draw.text((40, 120), "Solutions", fill="#161616", font=FONT_LG)
    draw_button(draw, (W-200, 120, W-40, 152), "Create solution", bg="#0f62fe", fg="white")
    draw_input(draw, (40, 120, 400, 152), placeholder="Search solutions...")

    draw_card(draw, (40, 180, W-40, 280),
              "Customer A — Site Alpha",
              "3号楼2层初次部署，共12台机器人。",
              ["customer-a", "building-3"])
    draw_card(draw, (40, 300, W-40, 400),
              "Customer B — Beta",
              "Beta site deployment with 5 robots.",
              ["customer-b", "beta"])
    draw_card(draw, (40, 420, W-40, 520),
              "Customer C — Gamma (corrupted)",
              "Metadata unreadable",
              [], corrupted=True)

    img.save(os.path.join(SOL_DIR, "01_solution_selector.png"))
    print("Saved solution-management/01_solution_selector.png")

# ---------------------------------------------------------------------------
# 2. Create Solution Modal
# ---------------------------------------------------------------------------
def page_create_solution():
    W, H = 1200, 800
    img = Image.new("RGB", (W, H), "#f4f4f4")
    draw = ImageDraw.Draw(img)
    page_solution_selector()  # background
    # Modal overlay
    draw.rectangle([0, 0, W, H], fill="#00000080")
    mx, my, mw, mh = 300, 200, 600, 400
    draw.rectangle([mx, my, mx+mw, my+mh], fill="white", outline="#c6c6c6", width=1)
    draw.text((mx+24, my+20), "Create solution", fill="#161616", font=FONT_LG)
    draw_input(draw, (mx+24, my+80, mx+mw-24, my+114), placeholder="Name *")
    draw_input(draw, (mx+24, my+130, mx+mw-24, my+230), placeholder="Description")
    draw_input(draw, (mx+24, my+250, mx+mw-24, my+284), placeholder="Tags (comma-separated)")
    draw_button(draw, (mx+mw-220, my+mh-60, mx+mw-120, my+mh-28), "Cancel")
    draw_button(draw, (mx+mw-110, my+mh-60, mx+mw-24, my+mh-28), "Create", bg="#0f62fe", fg="white")

    img.save(os.path.join(SOL_DIR, "02_create_solution.png"))
    print("Saved solution-management/02_create_solution.png")

# ---------------------------------------------------------------------------
# 3. Delete Confirm Modal
# ---------------------------------------------------------------------------
def page_delete_confirm():
    W, H = 1200, 800
    img = Image.new("RGB", (W, H), "#f4f4f4")
    draw = ImageDraw.Draw(img)
    page_solution_selector()
    draw.rectangle([0, 0, W, H], fill="#00000080")
    mx, my, mw, mh = 350, 250, 500, 220
    draw.rectangle([mx, my, mx+mw, my+mh], fill="white", outline="#c6c6c6", width=1)
    draw.text((mx+24, my+20), "Delete solution", fill="#161616", font=FONT_LG)
    draw.text((mx+24, my+70), "This action is destructive and cannot be undone.", fill="#525252", font=FONT_MD)
    draw.text((mx+24, my+100), "All sub-resources will be permanently deleted.", fill="#525252", font=FONT_MD)
    draw_button(draw, (mx+mw-220, my+mh-60, mx+mw-120, my+mh-28), "Cancel")
    draw_button(draw, (mx+mw-110, my+mh-60, mx+mw-24, my+mh-28), "Delete solution", bg="#fa4d56", fg="white")

    img.save(os.path.join(SOL_DIR, "03_delete_confirm.png"))
    print("Saved solution-management/03_delete_confirm.png")

# ---------------------------------------------------------------------------
# 4. Main Workspace (after selecting a solution)
# ---------------------------------------------------------------------------
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
        fill = "#e0e0e0" if i == 0 else None
        if fill:
            draw.rectangle([4, y-4, 216, y+32], fill=fill)
        draw.text((24, y), item, fill="#161616", font=FONT)

    # Main content placeholder
    draw.text((260, 120), "Robots", fill="#161616", font=FONT_LG)
    draw.text((260, 170), "Select a robot to view details or perform actions.", fill="#525252", font=FONT_MD)

    img.save(os.path.join(SOL_DIR, "04_main_workspace.png"))
    print("Saved solution-management/04_main_workspace.png")

# ---------------------------------------------------------------------------
# 5. Robots Sub Interface — Thumbnail View (default)
# ---------------------------------------------------------------------------
def page_robots_sub_interface():
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
        fill = "#e0e0e0" if i == 0 else None
        if fill:
            draw.rectangle([4, y-4, 216, y+32], fill=fill)
        draw.text((24, y), item, fill="#161616", font=FONT)

    # Main content area — Robots Thumbnail View
    # Breadcrumb with back navigation
    draw.text((260, 116), "<  Solutions", fill="#0f62fe", font=FONT_MD)
    draw.text((260, 140), "Robots", fill="#161616", font=FONT_LG)

    # Toolbar
    draw_input(draw, (260, 180, 520, 214), placeholder="Search by alias, address, model or SN...")
    draw_button(draw, (540, 180, 660, 214), "Add Robot", bg="#0f62fe", fg="white")
    draw_button(draw, (670, 180, 790, 214), "Batch Add")
    draw_button(draw, (810, 180, 950, 214), "Batch Delete (2)", bg="#fa4d56", fg="white")
    # View toggle buttons
    draw_button(draw, (970, 180, 1030, 214), "Grid", bg="#0f62fe", fg="white")
    draw_button(draw, (1040, 180, 1100, 214), "List")

    # Thumbnail cards (3 columns)
    cards = [
        ("AGV-01", "192.168.1.101", "X100", "SN123456", "2.3.1"),
        ("AGV-02", "192.168.1.102", "X100", "SN123457", "2.3.1"),
        ("AGV-03", "robot-03.local", "X200", "SN789012", "2.4.0"),
        ("AGV-04", "192.168.1.104", "X100", "SN123458", "2.3.2"),
        ("AGV-05", "192.168.1.105", "X300", "SN999001", "2.5.0"),
    ]
    card_w, card_h = 280, 180
    gap = 20
    cols = 3
    for i, (alias, address, model, sn, osver) in enumerate(cards):
        col = i % cols
        row = i // cols
        cx = 260 + col * (card_w + gap)
        cy = 220 + row * (card_h + gap)
        # Card background
        draw.rectangle([cx, cy, cx+card_w, cy+card_h], fill="white", outline="#e0e0e0", width=1)
        # Checkbox (top-left)
        cb_x, cb_y = cx+12, cy+12
        draw.rectangle([cb_x, cb_y, cb_x+16, cb_y+16], outline="#555", width=1)
        if i == 0:  # first card checked
            draw.line([(cb_x+3, cb_y+8), (cb_x+7, cb_y+12), (cb_x+13, cb_y+4)], fill="#0f62fe", width=2)
        # Robot icon placeholder (center-top)
        icon_cx, icon_cy = cx + card_w//2, cy + 50
        draw.ellipse([icon_cx-28, icon_cy-28, icon_cx+28, icon_cy+28], fill="#e0e0e0", outline="#c6c6c6", width=1)
        draw.text((icon_cx-18, icon_cy-8), "Robot", fill="#8d8d8d", font=FONT_SM)
        # Alias
        draw.text((cx+12, cy+90), alias, fill="#161616", font=FONT_MD)
        # Info lines
        draw.text((cx+12, cy+114), f"{address}  |  {model}", fill="#525252", font=FONT_SM)
        draw.text((cx+12, cy+134), f"SN: {sn}", fill="#525252", font=FONT_SM)
        draw.text((cx+12, cy+154), f"megacosmOS: {osver}", fill="#525252", font=FONT_SM)

    img.save(os.path.join(SOL_DIR, "05_robots_sub_interface.png"))
    print("Saved solution-management/05_robots_sub_interface.png")

# ---------------------------------------------------------------------------
# 6. Robots Sub Interface — List View
# ---------------------------------------------------------------------------
def page_robots_list_view():
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
        fill = "#e0e0e0" if i == 0 else None
        if fill:
            draw.rectangle([4, y-4, 216, y+32], fill=fill)
        draw.text((24, y), item, fill="#161616", font=FONT)

    # Main content area — Robots List View
    # Breadcrumb with back navigation
    draw.text((260, 116), "<  Solutions", fill="#0f62fe", font=FONT_MD)
    draw.text((260, 140), "Robots", fill="#161616", font=FONT_LG)

    # Toolbar
    draw_input(draw, (260, 180, 520, 214), placeholder="Search by alias, address, model or SN...")
    draw_button(draw, (540, 180, 660, 214), "Add Robot", bg="#0f62fe", fg="white")
    draw_button(draw, (670, 180, 790, 214), "Batch Add")
    draw_button(draw, (810, 180, 950, 214), "Batch Delete (2)", bg="#fa4d56", fg="white")
    # View toggle buttons
    draw_button(draw, (970, 180, 1030, 214), "Grid")
    draw_button(draw, (1040, 180, 1100, 214), "List", bg="#0f62fe", fg="white")

    # Table header
    y = 240
    draw.rectangle([260, y, W-40, y+36], fill="#e0e0e0")
    cols = [
        ("", 270), ("Alias", 320), ("Address", 440), ("Model", 580),
        ("Robot SN", 660), ("Things ID", 780), ("megacosmOS", 900), ("Actions", 1020)
    ]
    for text, cx in cols:
        draw.text((cx, y+8), text, fill="#161616", font=FONT_MD)

    # Table rows
    rows = [
        (True, "AGV-01", "192.168.1.101", "X100", "SN123456", "thing-abc-001", "2.3.1"),
        (False, "AGV-02", "192.168.1.102", "X100", "SN123457", "thing-abc-002", "2.3.1"),
        (False, "AGV-03", "robot-03.local", "X200", "SN789012", "thing-abc-003", "2.4.0"),
    ]
    for i, (checked, alias, address, model, sn, things, osver) in enumerate(rows):
        y = 280 + i*44
        fill = "white" if i % 2 == 0 else "#fafafa"
        draw.rectangle([260, y, W-40, y+40], fill=fill, outline="#e0e0e0", width=1)
        # Checkbox
        cb_x, cb_y = 270, y+10
        draw.rectangle([cb_x, cb_y, cb_x+16, cb_y+16], outline="#555", width=1)
        if checked:
            draw.line([(cb_x+3, cb_y+8), (cb_x+7, cb_y+12), (cb_x+13, cb_y+4)], fill="#0f62fe", width=2)
        draw.text((320, y+10), alias, fill="#161616", font=FONT_SM)
        draw.text((440, y+10), address, fill="#525252", font=FONT_SM)
        draw.text((580, y+10), model, fill="#525252", font=FONT_SM)
        draw.text((660, y+10), sn, fill="#525252", font=FONT_SM)
        draw.text((780, y+10), things, fill="#525252", font=FONT_SM)
        draw.text((900, y+10), osver, fill="#525252", font=FONT_SM)
        draw_button(draw, (1020, y+6, 1090, y+34), "Details")
        draw_button(draw, (1100, y+6, 1160, y+34), "Delete", bg="#fa4d56", fg="white")

    img.save(os.path.join(SOL_DIR, "06_robots_list_view.png"))
    print("Saved solution-management/06_robots_list_view.png")

# ---------------------------------------------------------------------------
# 7. Artifact Manager
# ---------------------------------------------------------------------------
def page_artifact_manager():
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

    # Content
    draw.text((40, 120), "Artifact Manager", fill="#161616", font=FONT_LG)
    draw.text((40, 150), "Global binary artifacts shared across all solutions.", fill="#525252", font=FONT_MD)
    draw_input(draw, (40, 190, 400, 224), placeholder="Search artifacts...")
    draw_button(draw, (W-200, 190, W-40, 224), "Upload artifact", bg="#0f62fe", fg="white")

    # Table header
    y = 260
    draw.rectangle([40, y, W-40, y+36], fill="#e0e0e0")
    for text, cx in [("Name", 60), ("Type", 300), ("Size", 450), ("Checksum", 580), ("Created", 780), ("Actions", 980)]:
        draw.text((cx, y+8), text, fill="#161616", font=FONT_MD)

    # Rows
    for i, (name, typ, size, checksum, created) in enumerate([
        ("firmware_v1.2.3.bin", "Firmware", "12.5 MB", "a1b2c3...", "2026-05-27"),
        ("map_floor_2.zip", "Map", "45.2 MB", "d4e5f6...", "2026-05-26"),
    ]):
        y = 300 + i*44
        fill = "white" if i % 2 == 0 else "#fafafa"
        draw.rectangle([40, y, W-40, y+40], fill=fill, outline="#e0e0e0", width=1)
        draw.text((60, y+10), name, fill="#161616", font=FONT_SM)
        draw.text((300, y+10), typ, fill="#525252", font=FONT_SM)
        draw.text((450, y+10), size, fill="#525252", font=FONT_SM)
        draw.text((580, y+10), checksum, fill="#525252", font=FONT_SM)
        draw.text((780, y+10), created, fill="#525252", font=FONT_SM)
        draw_button(draw, (980, y+6, 1050, y+34), "Details")
        draw_button(draw, (1060, y+6, 1120, y+34), "Delete", bg="#fa4d56", fg="white")

    img.save(os.path.join(SOL_DIR, "07_artifact_manager.png"))
    print("Saved solution-management/07_artifact_manager.png")

# ---------------------------------------------------------------------------
# 8. Artifact Selector Modal
# ---------------------------------------------------------------------------
def page_artifact_selector():
    W, H = 1200, 800
    img = Image.new("RGB", (W, H), "#f4f4f4")
    draw = ImageDraw.Draw(img)
    page_main_workspace()
    draw.rectangle([0, 0, W, H], fill="#00000080")
    mx, my, mw, mh = 200, 120, 800, 560
    draw.rectangle([mx, my, mx+mw, my+mh], fill="white", outline="#c6c6c6", width=1)
    draw.text((mx+24, my+20), "Select Artifact", fill="#161616", font=FONT_LG)
    draw_input(draw, (mx+24, my+70, mx+400, my+104), placeholder="Search artifacts...")
    draw_button(draw, (mx+mw-120, my+70, mx+mw-24, my+104), "Confirm", bg="#0f62fe", fg="white")

    # Table header
    y = my + 130
    draw.rectangle([mx+24, y, mx+mw-24, y+36], fill="#e0e0e0")
    for text, cx in [("Name", mx+40), ("Type", mx+300), ("Size", mx+450), ("Created", mx+580)]:
        draw.text((cx, y+8), text, fill="#161616", font=FONT_MD)

    for i, (name, typ, size, created) in enumerate([
        ("firmware_v1.2.3.bin", "Firmware", "12.5 MB", "2026-05-27"),
        ("map_floor_2.zip", "Map", "45.2 MB", "2026-05-26"),
    ]):
        y = my + 170 + i*44
        fill = "white" if i % 2 == 0 else "#fafafa"
        draw.rectangle([mx+24, y, mx+mw-24, y+40], fill=fill, outline="#e0e0e0", width=1)
        draw.text((mx+40, y+10), name, fill="#161616", font=FONT_SM)
        draw.text((mx+300, y+10), typ, fill="#525252", font=FONT_SM)
        draw.text((mx+450, y+10), size, fill="#525252", font=FONT_SM)
        draw.text((mx+580, y+10), created, fill="#525252", font=FONT_SM)

    img.save(os.path.join(SOL_DIR, "08_artifact_selector.png"))
    print("Saved solution-management/08_artifact_selector.png")

# ---------------------------------------------------------------------------
# 9. Artifact Detail Modal
# ---------------------------------------------------------------------------
def page_artifact_detail():
    W, H = 1200, 800
    img = Image.new("RGB", (W, H), "#f4f4f4")
    draw = ImageDraw.Draw(img)
    page_main_workspace()
    draw.rectangle([0, 0, W, H], fill="#00000080")
    mx, my, mw, mh = 300, 180, 600, 440
    draw.rectangle([mx, my, mx+mw, my+mh], fill="white", outline="#c6c6c6", width=1)
    draw.text((mx+24, my+20), "Artifact Details", fill="#161616", font=FONT_LG)

    fields = [
        ("ID", "artifact-001"),
        ("File Name", "firmware_v1.2.3.bin"),
        ("Content Type", "application/octet-stream"),
        ("Size", "12.5 MB"),
        ("Checksum (SHA-256)", "a1b2c3d4e5f6..."),
        ("Created", "2026-05-27T10:30:00Z"),
        ("Reference Count", "3"),
    ]
    for i, (label, value) in enumerate(fields):
        y = my + 80 + i*40
        draw.text((mx+24, y), label + ":", fill="#525252", font=FONT_MD)
        draw.text((mx+220, y), value, fill="#161616", font=FONT_MD)

    draw_button(draw, (mx+mw-220, my+mh-60, mx+mw-120, my+mh-28), "Close")
    draw_button(draw, (mx+mw-110, my+mh-60, mx+mw-24, my+mh-28), "Download", bg="#0f62fe", fg="white")

    img.save(os.path.join(SOL_DIR, "09_artifact_detail.png"))
    print("Saved solution-management/09_artifact_detail.png")

# ---------------------------------------------------------------------------
# 10. Delete Artifact Modal
# ---------------------------------------------------------------------------
def page_delete_artifact_modal():
    W, H = 1200, 800
    img = Image.new("RGB", (W, H), "#f4f4f4")
    draw = ImageDraw.Draw(img)
    page_main_workspace()
    draw.rectangle([0, 0, W, H], fill="#00000080")
    mx, my, mw, mh = 350, 250, 500, 220
    draw.rectangle([mx, my, mx+mw, my+mh], fill="white", outline="#c6c6c6", width=1)
    draw.text((mx+24, my+20), "Delete Artifact", fill="#161616", font=FONT_LG)
    draw.text((mx+24, my+70), "This action cannot be undone.", fill="#525252", font=FONT_MD)
    draw.text((mx+24, my+100), "The artifact file will be permanently removed.", fill="#525252", font=FONT_MD)
    draw_button(draw, (mx+mw-220, my+mh-60, mx+mw-120, my+mh-28), "Cancel")
    draw_button(draw, (mx+mw-110, my+mh-60, mx+mw-24, my+mh-28), "Delete", bg="#fa4d56", fg="white")

    img.save(os.path.join(SOL_DIR, "10_delete_artifact_modal.png"))
    print("Saved solution-management/10_delete_artifact_modal.png")

if __name__ == "__main__":
    page_solution_selector()
    page_create_solution()
    page_delete_confirm()
    page_main_workspace()
    page_robots_sub_interface()
    page_robots_list_view()
    page_artifact_manager()
    page_artifact_selector()
    page_artifact_detail()
    page_delete_artifact_modal()
    print("\nAll UI sketches generated in", BASE_DIR)
