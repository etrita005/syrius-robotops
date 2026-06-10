"""
generate_ui_sketches.py
Quickly produce PNG wireframe sketches for key RobotOps Studio screens.
Uses Pillow only; no external UI framework needed.

Run:  python tools/generate_ui_sketches.py
Output: documents/ui-ux/{module}/*.png
"""

import os
from PIL import Image, ImageDraw, ImageFont

BASE_DIR = os.path.join(os.path.dirname(__file__), "..", "documents", "ui-ux")
SOL_DIR = os.path.join(BASE_DIR, "solution-management")
ROBOTS_DIR = os.path.join(SOL_DIR, "robots")
TASKS_DIR = os.path.join(SOL_DIR, "tasks")
ARTIFACT_DIR = os.path.join(BASE_DIR, "artifact-management")
SYSTEM_LOGS_DIR = os.path.join(BASE_DIR, "system-logs")
os.makedirs(SOL_DIR, exist_ok=True)
os.makedirs(ROBOTS_DIR, exist_ok=True)
os.makedirs(TASKS_DIR, exist_ok=True)
os.makedirs(ARTIFACT_DIR, exist_ok=True)
os.makedirs(SYSTEM_LOGS_DIR, exist_ok=True)

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

def draw_common_header(draw, W, active="solutions"):
    draw.rectangle([0, 0, W, 56], fill="#161616")
    draw.text((20, 18), "RobotOps Studio", fill="white", font=FONT_LG)
    items = [("solutions", "Solutions", 280),
             ("artifacts", "Artifacts", 380),
             ("system-logs", "System Logs", 480)]
    for key, label, x in items:
        color = "white" if key == active else "#8d8d8d"
        draw.text((x, 22), label, fill=color, font=FONT_MD)
    draw.text((W-140, 22), "v1.0.0", fill="#8d8d8d", font=FONT_SM)

def draw_active_solution_bar(draw, W):
    draw.rectangle([0, 56, W, 96], fill="#e8e8e8")
    draw.text((20, 64), "Active Solution:  Customer A — Site Alpha", fill="#161616", font=FONT_MD)
    draw_button(draw, (W-180, 62, W-100, 90), "Switch")
    draw_button(draw, (W-90, 62, W-20, 90), "Settings")

def draw_sidebar(draw, H, active_index=0):
    draw.rectangle([0, 96, 220, H], fill="#f4f4f4", outline="#e0e0e0", width=1)
    nav_items = ["Robots", "Tasks"]
    for i, item in enumerate(nav_items):
        y = 120 + i*44
        fill = "#e0e0e0" if i == active_index else None
        if fill:
            draw.rectangle([4, y-4, 216, y+32], fill=fill)
        draw.text((24, y), item, fill="#161616", font=FONT)

# ---------------------------------------------------------------------------
# Solution Management: 01 — Solution Selector (landing page)
# ---------------------------------------------------------------------------
def page_solution_selector():
    W, H = 1200, 800
    img = Image.new("RGB", (W, H), "#f4f4f4")
    draw = ImageDraw.Draw(img)

    draw_common_header(draw, W)
    draw_active_solution_bar(draw, W)

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

    path = os.path.join(SOL_DIR, "01_solution_selector.png")
    img.save(path)
    print(f"Saved {os.path.relpath(path, BASE_DIR)}")

# ---------------------------------------------------------------------------
# Solution Management: 02 — Create Solution Modal
# ---------------------------------------------------------------------------
def page_create_solution():
    W, H = 1200, 800
    img = Image.new("RGB", (W, H), "#f4f4f4")
    draw = ImageDraw.Draw(img)
    page_solution_selector()
    draw.rectangle([0, 0, W, H], fill="#00000080")
    mx, my, mw, mh = 300, 200, 600, 400
    draw.rectangle([mx, my, mx+mw, my+mh], fill="white", outline="#c6c6c6", width=1)
    draw.text((mx+24, my+20), "Create solution", fill="#161616", font=FONT_LG)
    draw_input(draw, (mx+24, my+80, mx+mw-24, my+114), placeholder="Name *")
    draw_input(draw, (mx+24, my+130, mx+mw-24, my+230), placeholder="Description")
    draw_input(draw, (mx+24, my+250, mx+mw-24, my+284), placeholder="Tags (comma-separated)")
    draw_button(draw, (mx+mw-220, my+mh-60, mx+mw-120, my+mh-28), "Cancel")
    draw_button(draw, (mx+mw-110, my+mh-60, mx+mw-24, my+mh-28), "Create", bg="#0f62fe", fg="white")

    path = os.path.join(SOL_DIR, "02_create_solution.png")
    img.save(path)
    print(f"Saved {os.path.relpath(path, BASE_DIR)}")

# ---------------------------------------------------------------------------
# Solution Management: 03 — Delete Solution Confirm Modal
# ---------------------------------------------------------------------------
def page_delete_solution_confirm():
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

    path = os.path.join(SOL_DIR, "03_delete_confirm.png")
    img.save(path)
    print(f"Saved {os.path.relpath(path, BASE_DIR)}")

# ---------------------------------------------------------------------------
# Solution Management: 04 — Main Workspace (after selecting a solution)
# ---------------------------------------------------------------------------
def page_main_workspace():
    W, H = 1200, 800
    img = Image.new("RGB", (W, H), "#f4f4f4")
    draw = ImageDraw.Draw(img)

    draw_common_header(draw, W)
    draw_active_solution_bar(draw, W)
    draw_sidebar(draw, H, active_index=0)

    draw.text((260, 120), "Robots", fill="#161616", font=FONT_LG)
    draw.text((260, 170), "Select a robot to view details or perform actions.", fill="#525252", font=FONT_MD)

    path = os.path.join(SOL_DIR, "04_main_workspace.png")
    img.save(path)
    print(f"Saved {os.path.relpath(path, BASE_DIR)}")

# ---------------------------------------------------------------------------
# Robots: 01 — Thumbnail View (default)
# ---------------------------------------------------------------------------
def page_robots_grid_view():
    W, H = 1200, 800
    img = Image.new("RGB", (W, H), "#f4f4f4")
    draw = ImageDraw.Draw(img)

    draw_common_header(draw, W)
    draw_active_solution_bar(draw, W)
    draw_sidebar(draw, H, active_index=0)

    draw.text((260, 116), "<  Solutions", fill="#0f62fe", font=FONT_MD)
    draw.text((260, 140), "Robots", fill="#161616", font=FONT_LG)

    draw_input(draw, (260, 180, 520, 214), placeholder="Search by alias, address, model or SN...")
    draw_button(draw, (540, 180, 660, 214), "Add Robot", bg="#0f62fe", fg="white")
    draw_button(draw, (810, 180, 950, 214), "Batch Delete (2)", bg="#fa4d56", fg="white")
    draw_button(draw, (970, 180, 1030, 214), "Grid", bg="#0f62fe", fg="white")
    draw_button(draw, (1040, 180, 1100, 214), "List")

    cards = [
        ("AGV-01", "192.168.1.101:22", "X100", "SN123456", "2.3.1"),
        ("AGV-02", "192.168.1.102:22", "X100", "SN123457", "2.3.1"),
        ("AGV-03", "robot-03.local:22", "X200", "SN789012", "2.4.0"),
        ("AGV-04", "192.168.1.104:22", "X100", "SN123458", "2.3.2"),
        ("AGV-05", "192.168.1.105:22", "X300", "SN999001", "2.5.0"),
    ]
    card_w, card_h = 280, 180
    gap = 20
    cols = 3
    for i, (alias, address, model, sn, osver) in enumerate(cards):
        col = i % cols
        row = i // cols
        cx = 260 + col * (card_w + gap)
        cy = 220 + row * (card_h + gap)
        draw.rectangle([cx, cy, cx+card_w, cy+card_h], fill="white", outline="#e0e0e0", width=1)
        cb_x, cb_y = cx+12, cy+12
        draw.rectangle([cb_x, cb_y, cb_x+16, cb_y+16], outline="#555", width=1)
        if i == 0:
            draw.line([(cb_x+3, cb_y+8), (cb_x+7, cb_y+12), (cb_x+13, cb_y+4)], fill="#0f62fe", width=2)
        icon_cx, icon_cy = cx + card_w//2, cy + 50
        draw.ellipse([icon_cx-28, icon_cy-28, icon_cx+28, icon_cy+28], fill="#e0e0e0", outline="#c6c6c6", width=1)
        draw.text((icon_cx-18, icon_cy-8), "Robot", fill="#8d8d8d", font=FONT_SM)
        draw.text((cx+12, cy+90), alias, fill="#161616", font=FONT_MD)
        draw.text((cx+12, cy+114), f"{address}  |  {model}", fill="#525252", font=FONT_SM)
        draw.text((cx+12, cy+134), f"SN: {sn}", fill="#525252", font=FONT_SM)
        draw.text((cx+12, cy+154), f"megacosmOS: {osver}", fill="#525252", font=FONT_SM)

    path = os.path.join(ROBOTS_DIR, "01_grid_view.png")
    img.save(path)
    print(f"Saved {os.path.relpath(path, BASE_DIR)}")

# ---------------------------------------------------------------------------
# Robots: 02 — List View
# ---------------------------------------------------------------------------
def page_robots_list_view():
    W, H = 1200, 800
    img = Image.new("RGB", (W, H), "#f4f4f4")
    draw = ImageDraw.Draw(img)

    draw_common_header(draw, W)
    draw_active_solution_bar(draw, W)
    draw_sidebar(draw, H, active_index=0)

    draw.text((260, 116), "<  Solutions", fill="#0f62fe", font=FONT_MD)
    draw.text((260, 140), "Robots", fill="#161616", font=FONT_LG)

    draw_input(draw, (260, 180, 520, 214), placeholder="Search by alias, address, model or SN...")
    draw_button(draw, (540, 180, 660, 214), "Add Robot", bg="#0f62fe", fg="white")
    draw_button(draw, (810, 180, 950, 214), "Batch Delete (2)", bg="#fa4d56", fg="white")
    draw_button(draw, (970, 180, 1030, 214), "Grid")
    draw_button(draw, (1040, 180, 1100, 214), "List", bg="#0f62fe", fg="white")

    y = 240
    draw.rectangle([260, y, W-40, y+36], fill="#e0e0e0")
    cols = [
        ("", 270), ("Alias", 320), ("Address", 440), ("Model", 580),
        ("Robot SN", 660), ("Things ID", 780), ("megacosmOS", 900), ("Actions", 1020)
    ]
    for text, cx in cols:
        draw.text((cx, y+8), text, fill="#161616", font=FONT_MD)

    rows = [
        (True, "AGV-01", "192.168.1.101:22", "X100", "SN123456", "thing-abc-001", "2.3.1"),
        (False, "AGV-02", "192.168.1.102:22", "X100", "SN123457", "thing-abc-002", "2.3.1"),
        (False, "AGV-03", "robot-03.local:22", "X200", "SN789012", "thing-abc-003", "2.4.0"),
    ]
    for i, (checked, alias, address, model, sn, things, osver) in enumerate(rows):
        y = 280 + i*44
        fill = "white" if i % 2 == 0 else "#fafafa"
        draw.rectangle([260, y, W-40, y+40], fill=fill, outline="#e0e0e0", width=1)
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

    path = os.path.join(ROBOTS_DIR, "02_list_view.png")
    img.save(path)
    print(f"Saved {os.path.relpath(path, BASE_DIR)}")

# ---------------------------------------------------------------------------
# Robots: 03 — Add Robot Modal
# ---------------------------------------------------------------------------
def page_add_robot_modal():
    W, H = 1200, 800
    img = Image.new("RGB", (W, H), "#f4f4f4")
    draw = ImageDraw.Draw(img)
    page_robots_grid_view()
    draw.rectangle([0, 0, W, H], fill="#00000080")
    mx, my, mw, mh = 350, 220, 500, 300
    draw.rectangle([mx, my, mx+mw, my+mh], fill="white", outline="#c6c6c6", width=1)
    draw.text((mx+24, my+20), "Add Robot", fill="#161616", font=FONT_LG)
    draw_input(draw, (mx+24, my+80, mx+mw-24, my+114), placeholder="IP:port or mDNS:port (e.g. 192.168.1.101:22)")
    draw.text((mx+24, my+120), "Address *", fill="#525252", font=FONT_SM)
    draw_input(draw, (mx+24, my+140, mx+mw-24, my+174), placeholder="Robot alias")
    draw.text((mx+24, my+180), "Alias", fill="#525252", font=FONT_SM)
    draw_button(draw, (mx+mw-220, my+mh-60, mx+mw-120, my+mh-28), "Cancel")
    draw_button(draw, (mx+mw-110, my+mh-60, mx+mw-24, my+mh-28), "Add", bg="#0f62fe", fg="white")

    path = os.path.join(ROBOTS_DIR, "03_add_robot_modal.png")
    img.save(path)
    print(f"Saved {os.path.relpath(path, BASE_DIR)}")

# ---------------------------------------------------------------------------
# Robots: 04 — Robot Detail Modal
# ---------------------------------------------------------------------------
def page_robot_detail_modal():
    W, H = 1200, 800
    img = Image.new("RGB", (W, H), "#f4f4f4")
    draw = ImageDraw.Draw(img)
    page_robots_grid_view()
    draw.rectangle([0, 0, W, H], fill="#00000080")
    mx, my, mw, mh = 200, 80, 800, 640
    draw.rectangle([mx, my, mx+mw, my+mh], fill="white", outline="#c6c6c6", width=1)
    draw.text((mx+24, my+20), "Robot Details — AGV-01", fill="#161616", font=FONT_LG)

    tabs = ["Basic Info", "Other Info", "Software Versions", "Hardware Versions"]
    tx = mx + 24
    for i, tab in enumerate(tabs):
        bg = "#e0e0e0" if i == 0 else None
        if bg:
            draw.rectangle([tx-4, my+52, tx+120, my+78], fill=bg)
        draw.text((tx, my+56), tab, fill="#161616" if i == 0 else "#525252", font=FONT_SM)
        tx += 160

    fields = [
        ("Alias", "AGV-01", True),
        ("Address", "192.168.1.101:22", True),
        ("Model", "X100", False),
        ("Robot SN", "SN-123456", False),
        ("Things ID", "THING-789012", False),
        ("Vendor ID", "SYRIUS", False),
        ("Product ID", "X100-STD", False),
    ]
    fy = my + 90
    for label, value, editable in fields:
        draw.text((mx+24, fy), label, fill="#525252", font=FONT_MD)
        if editable:
            draw_input(draw, (mx+180, fy-4, mx+mw-24, fy+22), placeholder=value)
        else:
            draw.text((mx+180, fy), value, fill="#161616", font=FONT_MD)
        fy += 36

    draw_button(draw, (mx+mw-220, my+mh-60, mx+mw-120, my+mh-28), "Close")
    draw_button(draw, (mx+mw-110, my+mh-60, mx+mw-24, my+mh-28), "Save", bg="#0f62fe", fg="white")

    path = os.path.join(ROBOTS_DIR, "04_robot_detail_modal.png")
    img.save(path)
    print(f"Saved {os.path.relpath(path, BASE_DIR)}")

# ---------------------------------------------------------------------------
# Artifact Management: 01 — Artifact Manager
# ---------------------------------------------------------------------------
def page_artifact_manager():
    W, H = 1200, 800
    img = Image.new("RGB", (W, H), "#f4f4f4")
    draw = ImageDraw.Draw(img)

    draw_common_header(draw, W)
    draw_active_solution_bar(draw, W)

    draw.text((40, 120), "Artifact Manager", fill="#161616", font=FONT_LG)
    draw.text((40, 150), "Global binary artifacts shared across all solutions.", fill="#525252", font=FONT_MD)
    draw_input(draw, (40, 190, 400, 224), placeholder="Search artifacts...")
    draw_button(draw, (W-200, 190, W-40, 224), "Upload artifact", bg="#0f62fe", fg="white")

    y = 260
    draw.rectangle([40, y, W-40, y+36], fill="#e0e0e0")
    for text, cx in [("Name", 60), ("Type", 300), ("Size", 450), ("Checksum", 580), ("Created", 780), ("Actions", 980)]:
        draw.text((cx, y+8), text, fill="#161616", font=FONT_MD)

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

    path = os.path.join(ARTIFACT_DIR, "01_artifact_manager.png")
    img.save(path)
    print(f"Saved {os.path.relpath(path, BASE_DIR)}")

# ---------------------------------------------------------------------------
# Artifact Management: 02 — Artifact Selector Modal
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

    path = os.path.join(ARTIFACT_DIR, "02_artifact_selector.png")
    img.save(path)
    print(f"Saved {os.path.relpath(path, BASE_DIR)}")

# ---------------------------------------------------------------------------
# Artifact Management: 03 — Artifact Detail Modal
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

    path = os.path.join(ARTIFACT_DIR, "03_artifact_detail.png")
    img.save(path)
    print(f"Saved {os.path.relpath(path, BASE_DIR)}")

# ---------------------------------------------------------------------------
# Artifact Management: 04 — Delete Artifact Confirm Modal
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

    path = os.path.join(ARTIFACT_DIR, "04_delete_confirm.png")
    img.save(path)
    print(f"Saved {os.path.relpath(path, BASE_DIR)}")

# ---------------------------------------------------------------------------
# Helpers for Tasks
# ---------------------------------------------------------------------------

def draw_state_tag(draw, bbox, state):
    colors = {
        "RUNNING": ("#0f62fe", "white"),
        "PAUSED": ("#f1c21b", "#161616"),
        "COMPLETED": ("#24a148", "white"),
        "FAILED": ("#fa4d56", "white"),
        "STOPPED": ("#8d8d8d", "white"),
        "PENDING": ("#e0e0e0", "#525252"),
    }
    bg, fg = colors.get(state, ("#e0e0e0", "#161616"))
    x1, y1, x2, y2 = bbox
    draw.rounded_rectangle(bbox, radius=4, fill=bg)
    tw = len(state) * 7 + 4
    draw.text(((x1 + x2 - tw) // 2, (y1 + y2 - 14) // 2), state, fill=fg, font=FONT_SM)

def draw_step_indicator(draw, mx, my, steps, current_step):
    total_w = len(steps) * 120
    start_x = mx + (600 - total_w) // 2
    for i, step in enumerate(steps):
        x = start_x + i * 120
        color = "#0f62fe" if i + 1 <= current_step else "#c6c6c6"
        draw.ellipse([x, my, x + 24, my + 24], fill=color)
        draw.text((x + 8, my + 5), str(i + 1), fill="white", font=FONT_SM)
        draw.text((x + 30, my + 5), step, fill="#161616" if i + 1 <= current_step else "#8d8d8d", font=FONT_SM)
        if i < len(steps) - 1:
            draw.line([(x + 100, my + 12), (x + 120, my + 12)], fill="#c6c6c6", width=2)

# ---------------------------------------------------------------------------
# Tasks: 01 — Task List
# ---------------------------------------------------------------------------
def page_tasks_list():
    W, H = 1200, 800
    img = Image.new("RGB", (W, H), "#f4f4f4")
    draw = ImageDraw.Draw(img)

    draw_common_header(draw, W)
    draw_active_solution_bar(draw, W)
    draw_sidebar(draw, H, active_index=1)

    draw.text((260, 116), "<  Solutions", fill="#0f62fe", font=FONT_MD)
    draw.text((260, 140), "Tasks", fill="#161616", font=FONT_LG)

    draw_input(draw, (260, 180, 520, 214), placeholder="Search by robot alias or task name...")
    draw_button(draw, (540, 180, 680, 214), "Create Task", bg="#0f62fe", fg="white")
    draw_button(draw, (W - 280, 180, W - 180, 214), "< Prev")
    draw.text((W - 170, 188), "Page 1 of 3", fill="#161616", font=FONT_MD)
    draw_button(draw, (W - 120, 180, W - 40, 214), "Next >")

    # Batch action toolbar (shown when rows are selected)
    draw.rectangle([260, 224, W - 40, 260], fill="#e8e8e8", outline="#c6c6c6", width=1)
    draw.text((270, 232), "2 selected", fill="#161616", font=FONT_MD)
    draw_button(draw, (380, 228, 460, 256), "Batch Pause")
    draw_button(draw, (470, 228, 560, 256), "Batch Resume")
    draw_button(draw, (570, 228, 650, 256), "Batch Stop")
    draw_button(draw, (660, 228, 750, 256), "Batch Delete", bg="#fa4d56", fg="white")

    y = 270
    draw.rectangle([260, y, W - 40, y + 36], fill="#e0e0e0")
    cols = [
        ("", 270),
        ("Robot Aliases", 320),
        ("Task Name", 500),
        ("State", 640),
        ("Result", 740),
        ("Elapsed", 840),
        ("Actions", 940),
    ]
    for text, cx in cols:
        draw.text((cx, y + 8), text, fill="#161616", font=FONT_MD)

    rows = [
        (True, "AGV-01, AGV-02", "Upgrade BUP", "RUNNING", "In progress", "00:05:32"),
        (True, "AGV-03", "Upgrade Movebase", "PAUSED", "Paused", "00:12:45"),
        (False, "AGV-04", "Upgrade BUP", "COMPLETED", "Success", "00:08:10"),
        (False, "AGV-05", "Upgrade Movebase", "FAILED", "Failed", "00:03:22"),
        (False, "AGV-01", "Upgrade BUP", "STOPPED", "Stopped", "00:01:05"),
    ]
    for i, (checked, aliases, name, state, result, elapsed) in enumerate(rows):
        y = 310 + i * 44
        fill = "white" if i % 2 == 0 else "#fafafa"
        draw.rectangle([260, y, W - 40, y + 40], fill=fill, outline="#e0e0e0", width=1)
        cb_x, cb_y = 270, y + 10
        draw.rectangle([cb_x, cb_y, cb_x + 16, cb_y + 16], outline="#555", width=1)
        if checked:
            draw.line([(cb_x + 3, cb_y + 8), (cb_x + 7, cb_y + 12), (cb_x + 13, cb_y + 4)], fill="#0f62fe", width=2)
        draw.text((320, y + 10), aliases, fill="#161616", font=FONT_SM)
        draw.text((500, y + 10), name, fill="#161616", font=FONT_SM)
        draw_state_tag(draw, (640, y + 8, 640 + 80, y + 32), state)
        draw.text((740, y + 10), result, fill="#525252", font=FONT_SM)
        draw.text((840, y + 10), elapsed, fill="#525252", font=FONT_SM)

        if state == "RUNNING":
            draw_button(draw, (940, y + 6, 1000, y + 34), "Pause")
            draw_button(draw, (1010, y + 6, 1060, y + 34), "Stop")
            draw_button(draw, (1070, y + 6, 1140, y + 34), "Delete", bg="#fa4d56", fg="white")
        elif state == "PAUSED":
            draw_button(draw, (940, y + 6, 1000, y + 34), "Resume")
            draw_button(draw, (1010, y + 6, 1060, y + 34), "Stop")
            draw_button(draw, (1070, y + 6, 1140, y + 34), "Delete", bg="#fa4d56", fg="white")
        else:
            draw_button(draw, (940, y + 6, 1000, y + 34), "Delete", bg="#fa4d56", fg="white")

    path = os.path.join(TASKS_DIR, "01_task_list.png")
    img.save(path)
    print(f"Saved {os.path.relpath(path, BASE_DIR)}")

# ---------------------------------------------------------------------------
# Tasks: 02 — Create Task Step 1: Select Task Type
# ---------------------------------------------------------------------------
def page_create_task_step1():
    W, H = 1200, 800
    img = Image.new("RGB", (W, H), "#f4f4f4")
    draw = ImageDraw.Draw(img)
    page_tasks_list()
    draw.rectangle([0, 0, W, H], fill="#00000080")
    mx, my, mw, mh = 300, 120, 600, 560
    draw.rectangle([mx, my, mx + mw, my + mh], fill="white", outline="#c6c6c6", width=1)
    draw.text((mx + 24, my + 20), "Create Task", fill="#161616", font=FONT_LG)
    draw_step_indicator(draw, mx, my + 60, ["Type", "Robots", "Params", "Confirm"], 1)

    draw.text((mx + 24, my + 110), "Step 1: Select Task Type", fill="#161616", font=FONT_MD)
    draw.text((mx + 24, my + 130), "The task type determines robot selection mode and parameters.", fill="#525252", font=FONT_SM)
    draw_input(draw, (mx + 24, my + 158, mx + mw - 24, my + 192), placeholder="Search task types...")

    types = [
        ("Upgrade BUP", "Upgrade the BUP firmware on selected robots.", "Multiple robots"),
        ("Upgrade Movebase", "Upgrade the Movebase software on selected robots.", "Single robot"),
    ]
    for i, (name, desc, mode_label) in enumerate(types):
        y = my + 208 + i * 100
        draw.rectangle([mx + 24, y, mx + mw - 24, y + 80], fill="white", outline="#c6c6c6", width=2 if i == 0 else 1)
        if i == 0:
            draw.ellipse([mx + 40, y + 28, mx + 56, y + 44], fill="#0f62fe")
        else:
            draw.ellipse([mx + 40, y + 28, mx + 56, y + 44], outline="#8d8d8d", width=1)
        draw.text((mx + 70, y + 14), name, fill="#161616", font=FONT_MD)
        draw.text((mx + 70, y + 36), desc, fill="#525252", font=FONT_SM)
        draw.text((mx + 70, y + 56), f"Robot selection: {mode_label}", fill="#8d8d8d", font=FONT_SM)

    draw_button(draw, (mx + mw - 220, my + mh - 60, mx + mw - 120, my + mh - 28), "Cancel")
    draw_button(draw, (mx + mw - 110, my + mh - 60, mx + mw - 24, my + mh - 28), "Next", bg="#0f62fe", fg="white")

    path = os.path.join(TASKS_DIR, "02_create_task_step1.png")
    img.save(path)
    print(f"Saved {os.path.relpath(path, BASE_DIR)}")

# ---------------------------------------------------------------------------
# Tasks: 03 — Create Task Step 2: Select Robots
# ---------------------------------------------------------------------------
def page_create_task_step2():
    W, H = 1200, 800
    img = Image.new("RGB", (W, H), "#f4f4f4")
    draw = ImageDraw.Draw(img)
    page_tasks_list()
    draw.rectangle([0, 0, W, H], fill="#00000080")
    mx, my, mw, mh = 300, 120, 600, 560
    draw.rectangle([mx, my, mx + mw, my + mh], fill="white", outline="#c6c6c6", width=1)
    draw.text((mx + 24, my + 20), "Create Task", fill="#161616", font=FONT_LG)
    draw_step_indicator(draw, mx, my + 60, ["Type", "Robots", "Params", "Confirm"], 2)

    draw.text((mx + 24, my + 110), "Step 2: Select Robots", fill="#161616", font=FONT_MD)
    draw.text((mx + 24, my + 130), "Task type: Upgrade BUP (Multiple robots)", fill="#525252", font=FONT_SM)
    draw_input(draw, (mx + 24, my + 158, mx + mw - 24, my + 192), placeholder="Search robots...")

    y = my + 208
    draw.rectangle([mx + 24, y, mx + mw - 24, y + 36], fill="#e0e0e0")
    for text, cx in [("", mx + 40), ("Alias", mx + 80), ("Address", mx + 220), ("Model", mx + 380)]:
        draw.text((cx, y + 8), text, fill="#161616", font=FONT_MD)
    # Select All checkbox in header
    cb_x, cb_y = mx + 40, y + 8
    draw.rectangle([cb_x, cb_y, cb_x + 16, cb_y + 16], outline="#555", width=1)
    draw.line([(cb_x + 3, cb_y + 8), (cb_x + 7, cb_y + 12), (cb_x + 13, cb_y + 4)], fill="#0f62fe", width=2)
    draw.text((cb_x + 20, cb_y - 2), "Select All", fill="#161616", font=FONT_SM)

    robots = [
        (True, "AGV-01", "192.168.1.101:22", "X100"),
        (False, "AGV-02", "192.168.1.102:22", "X100"),
        (True, "AGV-03", "robot-03.local:22", "X200"),
        (False, "AGV-04", "192.168.1.104:22", "X100"),
    ]
    for i, (checked, alias, address, model) in enumerate(robots):
        y = my + 248 + i * 44
        fill = "white" if i % 2 == 0 else "#fafafa"
        draw.rectangle([mx + 24, y, mx + mw - 24, y + 40], fill=fill, outline="#e0e0e0", width=1)
        cb_x, cb_y = mx + 40, y + 10
        draw.rectangle([cb_x, cb_y, cb_x + 16, cb_y + 16], outline="#555", width=1)
        if checked:
            draw.line([(cb_x + 3, cb_y + 8), (cb_x + 7, cb_y + 12), (cb_x + 13, cb_y + 4)], fill="#0f62fe", width=2)
        draw.text((mx + 80, y + 10), alias, fill="#161616", font=FONT_SM)
        draw.text((mx + 220, y + 10), address, fill="#525252", font=FONT_SM)
        draw.text((mx + 380, y + 10), model, fill="#525252", font=FONT_SM)

    draw.text((mx + 24, my + mh - 80), "2 robots selected", fill="#525252", font=FONT_SM)
    draw_button(draw, (mx + mw - 320, my + mh - 60, mx + mw - 220, my + mh - 28), "Back")
    draw_button(draw, (mx + mw - 110, my + mh - 60, mx + mw - 24, my + mh - 28), "Next", bg="#0f62fe", fg="white")

    path = os.path.join(TASKS_DIR, "03_create_task_step2.png")
    img.save(path)
    print(f"Saved {os.path.relpath(path, BASE_DIR)}")

# ---------------------------------------------------------------------------
# Tasks: 04 — Create Task Step 3: Configure Parameters
# ---------------------------------------------------------------------------
def page_create_task_step3():
    W, H = 1200, 800
    img = Image.new("RGB", (W, H), "#f4f4f4")
    draw = ImageDraw.Draw(img)
    page_tasks_list()
    draw.rectangle([0, 0, W, H], fill="#00000080")
    mx, my, mw, mh = 300, 120, 600, 560
    draw.rectangle([mx, my, mx + mw, my + mh], fill="white", outline="#c6c6c6", width=1)
    draw.text((mx + 24, my + 20), "Create Task", fill="#161616", font=FONT_LG)
    draw_step_indicator(draw, mx, my + 60, ["Type", "Robots", "Params", "Confirm"], 3)

    draw.text((mx + 24, my + 110), "Step 3: Configure Parameters", fill="#161616", font=FONT_MD)
    draw.text((mx + 24, my + 132), "Task: Upgrade BUP", fill="#525252", font=FONT_SM)
    draw.text((mx + 24, my + 148), "Parameters are rendered dynamically based on task type.", fill="#8d8d8d", font=FONT_SM)
    draw.text((mx + 24, my + 172), "Artifact file *", fill="#161616", font=FONT_MD)

    y = my + 200
    draw.rectangle([mx + 24, y, mx + mw - 24, y + 36], fill="#e0e0e0")
    for text, cx in [("Name", mx + 40), ("Type", mx + 240), ("Size", mx + 380), ("Created", mx + 480)]:
        draw.text((cx, y + 8), text, fill="#161616", font=FONT_MD)

    artifacts = [
        (True, "bup_v2.3.1.bin", "Firmware", "12.5 MB", "2026-05-27"),
        (False, "bup_v2.4.0.bin", "Firmware", "13.1 MB", "2026-05-28"),
        (False, "map_floor_2.zip", "Map", "45.2 MB", "2026-05-26"),
    ]
    for i, (checked, name, typ, size, created) in enumerate(artifacts):
        y = my + 240 + i * 44
        fill = "white" if i % 2 == 0 else "#fafafa"
        draw.rectangle([mx + 24, y, mx + mw - 24, y + 40], fill=fill, outline="#e0e0e0", width=1)
        cb_x, cb_y = mx + 40, y + 10
        draw.ellipse([cb_x, cb_y, cb_x + 16, cb_y + 16], fill="#0f62fe" if checked else "white", outline="#555", width=1)
        if checked:
            draw.ellipse([cb_x + 4, cb_y + 4, cb_x + 12, cb_y + 12], fill="white")
        draw.text((mx + 70, y + 10), name, fill="#161616", font=FONT_SM)
        draw.text((mx + 240, y + 10), typ, fill="#525252", font=FONT_SM)
        draw.text((mx + 380, y + 10), size, fill="#525252", font=FONT_SM)
        draw.text((mx + 480, y + 10), created, fill="#525252", font=FONT_SM)

    draw_button(draw, (mx + mw - 320, my + mh - 60, mx + mw - 220, my + mh - 28), "Back")
    draw_button(draw, (mx + mw - 110, my + mh - 60, mx + mw - 24, my + mh - 28), "Next", bg="#0f62fe", fg="white")

    path = os.path.join(TASKS_DIR, "04_create_task_step3.png")
    img.save(path)
    print(f"Saved {os.path.relpath(path, BASE_DIR)}")

# ---------------------------------------------------------------------------
# Tasks: 05 — Create Task Step 4: Confirm and Create
# ---------------------------------------------------------------------------
def page_create_task_step4():
    W, H = 1200, 800
    img = Image.new("RGB", (W, H), "#f4f4f4")
    draw = ImageDraw.Draw(img)
    page_tasks_list()
    draw.rectangle([0, 0, W, H], fill="#00000080")
    mx, my, mw, mh = 300, 120, 600, 560
    draw.rectangle([mx, my, mx + mw, my + mh], fill="white", outline="#c6c6c6", width=1)
    draw.text((mx + 24, my + 20), "Create Task", fill="#161616", font=FONT_LG)
    draw_step_indicator(draw, mx, my + 60, ["Type", "Robots", "Params", "Confirm"], 4)

    draw.text((mx + 24, my + 110), "Step 4: Confirm", fill="#161616", font=FONT_MD)

    fields = [
        ("Task Type", "Upgrade BUP"),
        ("Target Robots", "AGV-01, AGV-03"),
        ("Artifact", "bup_v2.3.1.bin (12.5 MB)"),
    ]
    fy = my + 160
    for label, value in fields:
        draw.text((mx + 24, fy), label + ":", fill="#525252", font=FONT_MD)
        draw.text((mx + 220, fy), value, fill="#161616", font=FONT_MD)
        fy += 40

    draw.text((mx + 24, fy + 10), "Are you sure you want to create this task?", fill="#161616", font=FONT_MD)

    draw_button(draw, (mx + mw - 320, my + mh - 60, mx + mw - 220, my + mh - 28), "Back")
    draw_button(draw, (mx + mw - 110, my + mh - 60, mx + mw - 24, my + mh - 28), "Create", bg="#0f62fe", fg="white")

    path = os.path.join(TASKS_DIR, "05_create_task_step4.png")
    img.save(path)
    print(f"Saved {os.path.relpath(path, BASE_DIR)}")

# ---------------------------------------------------------------------------
# Tasks: 06 — Delete Task Confirm Modal
# ---------------------------------------------------------------------------
def page_delete_task_confirm():
    W, H = 1200, 800
    img = Image.new("RGB", (W, H), "#f4f4f4")
    draw = ImageDraw.Draw(img)
    page_tasks_list()
    draw.rectangle([0, 0, W, H], fill="#00000080")
    mx, my, mw, mh = 350, 250, 500, 220
    draw.rectangle([mx, my, mx + mw, my + mh], fill="white", outline="#c6c6c6", width=1)
    draw.text((mx + 24, my + 20), "Delete Task", fill="#161616", font=FONT_LG)
    draw.text((mx + 24, my + 70), "This action cannot be undone.", fill="#525252", font=FONT_MD)
    draw.text((mx + 24, my + 100), "The task record will be permanently removed.", fill="#525252", font=FONT_MD)
    draw_button(draw, (mx + mw - 220, my + mh - 60, mx + mw - 120, my + mh - 28), "Cancel")
    draw_button(draw, (mx + mw - 110, my + mh - 60, mx + mw - 24, my + mh - 28), "Delete", bg="#fa4d56", fg="white")

    path = os.path.join(TASKS_DIR, "06_delete_task_confirm.png")
    img.save(path)
    print(f"Saved {os.path.relpath(path, BASE_DIR)}")

# ---------------------------------------------------------------------------
# System Logs: 01 — Main View (file list + query toolbar + entry table)
# ---------------------------------------------------------------------------
def page_system_logs_main():
    W, H = 1400, 900
    img = Image.new("RGB", (W, H), "#f4f4f4")
    draw = ImageDraw.Draw(img)

    draw_common_header(draw, W, active="system-logs")

    # Page title
    draw.text((40, 80), "System Logs", fill="#161616", font=FONT_LG)
    draw.text((40, 110), "Backend service runtime logs (read-only view of pino-roll output)",
              fill="#525252", font=FONT_SM)

    # Left panel: log files
    panel_x1, panel_y1 = 20, 150
    panel_x2, panel_y2 = 380, H - 20
    draw.rectangle([panel_x1, panel_y1, panel_x2, panel_y2], fill="white", outline="#e0e0e0", width=1)
    draw.text((panel_x1 + 16, panel_y1 + 12), "Log Files", fill="#161616", font=FONT_MD)

    files = [
        ("app.3.log", "412 MB", "12:45:02", True),
        ("app.2.log", "500 MB", "10:32:11", False),
        ("app.1.log", "500 MB", "08:11:50", False),
    ]
    fy = panel_y1 + 48
    for name, size, mtime, active in files:
        draw.rectangle([panel_x1 + 8, fy, panel_x2 - 8, fy + 76],
                       fill="#fafafa", outline="#e0e0e0", width=1)
        draw.text((panel_x1 + 20, fy + 10), name, fill="#0f62fe", font=FONT_MD)
        if active:
            draw.rounded_rectangle([panel_x1 + 130, fy + 10, panel_x1 + 200, fy + 28],
                                   radius=4, fill="#42be65")
            draw.text((panel_x1 + 138, fy + 12), "ACTIVE", fill="white", font=FONT_SM)
        draw.text((panel_x1 + 20, fy + 36), f"{size}  ·  modified {mtime}",
                  fill="#525252", font=FONT_SM)
        draw_button(draw, (panel_x2 - 100, fy + 40, panel_x2 - 16, fy + 68), "Download")
        fy += 88

    # Right panel: toolbar + entry table
    tool_x1, tool_y1 = 400, 150
    tool_x2 = W - 20
    draw.rectangle([tool_x1, tool_y1, tool_x2, tool_y1 + 110], fill="white", outline="#e0e0e0", width=1)

    # Time range
    draw.text((tool_x1 + 16, tool_y1 + 12), "Time range", fill="#161616", font=FONT_SM)
    draw_input(draw, (tool_x1 + 16, tool_y1 + 32, tool_x1 + 260, tool_y1 + 60),
               placeholder="Last 30 minutes  ▾")
    draw_input(draw, (tool_x1 + 268, tool_y1 + 32, tool_x1 + 460, tool_y1 + 60),
               placeholder="2026-06-07 12:15:02")
    draw.text((tool_x1 + 466, tool_y1 + 38), "→", fill="#525252", font=FONT_MD)
    draw_input(draw, (tool_x1 + 484, tool_y1 + 32, tool_x1 + 676, tool_y1 + 60),
               placeholder="2026-06-07 12:45:02")

    # Levels & modules
    draw.text((tool_x1 + 16, tool_y1 + 70), "Levels", fill="#161616", font=FONT_SM)
    draw_input(draw, (tool_x1 + 16, tool_y1 + 86, tool_x1 + 260, tool_y1 + 108),
               placeholder="info, warn, error  ▾")

    draw.text((tool_x1 + 268, tool_y1 + 70), "Modules", fill="#161616", font=FONT_SM)
    draw_input(draw, (tool_x1 + 268, tool_y1 + 86, tool_x1 + 560, tool_y1 + 108),
               placeholder="All modules  ▾")

    draw.text((tool_x1 + 568, tool_y1 + 70), "Search msg", fill="#161616", font=FONT_SM)
    draw_input(draw, (tool_x1 + 568, tool_y1 + 86, tool_x1 + 820, tool_y1 + 108),
               placeholder="keyword...")

    # Download zip button (top-right of toolbar)
    draw_button(draw, (tool_x2 - 200, tool_y1 + 16, tool_x2 - 16, tool_y1 + 50),
                "↓ Download zip", bg="#0f62fe", fg="white")
    draw_button(draw, (tool_x2 - 200, tool_y1 + 58, tool_x2 - 16, tool_y1 + 92),
                "Refresh")

    # Entry table
    table_y1 = tool_y1 + 124
    table_y2 = panel_y2
    draw.rectangle([tool_x1, table_y1, tool_x2, table_y2], fill="white", outline="#e0e0e0", width=1)

    # Table header
    cols = [("Time", tool_x1 + 16, 200),
            ("Level", tool_x1 + 220, 70),
            ("Module", tool_x1 + 296, 160),
            ("Message", tool_x1 + 460, tool_x2 - tool_x1 - 470)]
    draw.rectangle([tool_x1, table_y1, tool_x2, table_y1 + 32], fill="#f4f4f4")
    for label, x, _w in cols:
        draw.text((x, table_y1 + 9), label, fill="#161616", font=FONT_MD)

    # Sample rows
    rows = [
        ("12:44:58.123", "info",  "#198038", "TaskFlowEngine",  "Robot upgrade started  { robotSn: 'R-001', taskId: 'tf-42' }"),
        ("12:44:57.011", "info",  "#198038", "SshCommand",      "ssh exec  { host: '192.168.1.10', cmd: 'systemctl status mc' }"),
        ("12:44:55.882", "warn",  "#f1c21b", "SshFileTransfer", "retry attempt  { attempt: 2, max: 3 }"),
        ("12:44:54.220", "error", "#da1e28", "SshCommand",      "ssh failed  { host: '192.168.1.10', err: 'ETIMEDOUT' }"),
        ("12:44:53.001", "info",  "#198038", "App",             "HTTP  { method: 'GET', path: '/api/solutions', status: 200, durationMs: 12 }"),
        ("12:44:52.778", "debug", "#525252", "MemStore",        "cache evict  { key: 'robot:R-002', reason: 'ttl' }"),
        ("12:44:50.110", "info",  "#198038", "SseManager",      "client connected  { id: 'c-7', total: 3 }"),
        ("12:44:48.992", "error", "#da1e28", "TaskFlowEngine",  "task failed  { taskId: 'tf-41', err: 'upgrade aborted' }"),
        ("12:44:47.330", "info",  "#198038", "App",             "HTTP  { method: 'POST', path: '/api/flows', status: 201, durationMs: 87 }"),
        ("12:44:46.001", "info",  "#198038", "RobotService",    "robot list refreshed  { count: 12 }"),
    ]
    ry = table_y1 + 36
    for time, lvl, lvl_color, mod, msg in rows:
        draw.text((cols[0][1], ry), time, fill="#161616", font=FONT_SM)
        # level badge
        bw = len(lvl)*8 + 16
        draw.rounded_rectangle([cols[1][1], ry - 2, cols[1][1] + bw, ry + 16],
                               radius=8, fill=lvl_color)
        draw.text((cols[1][1] + 8, ry), lvl, fill="white", font=FONT_SM)
        draw.text((cols[2][1], ry), mod, fill="#0f62fe", font=FONT_SM)
        # truncate msg
        max_chars = (cols[3][2]) // 7
        shown = msg if len(msg) <= max_chars else msg[:max_chars-1] + "…"
        draw.text((cols[3][1], ry), shown, fill="#161616", font=FONT_SM)
        draw.line([(tool_x1, ry + 22), (tool_x2, ry + 22)], fill="#e8e8e8", width=1)
        ry += 30

    # Footer status
    footer_y = table_y2 - 26
    draw.rectangle([tool_x1, footer_y, tool_x2, table_y2], fill="#f4f4f4")
    draw.text((tool_x1 + 16, footer_y + 6),
              "Showing 10 of 487 entries  ·  Scroll down to load more  ·  0 parse errors",
              fill="#525252", font=FONT_SM)

    path = os.path.join(SYSTEM_LOGS_DIR, "01_main_view.png")
    img.save(path)
    print(f"Saved {os.path.relpath(path, BASE_DIR)}")

# ---------------------------------------------------------------------------
# System Logs: 02 — Entry Detail Drawer
# ---------------------------------------------------------------------------
def page_system_logs_entry_detail():
    W, H = 1400, 900
    img = Image.new("RGB", (W, H), "#f4f4f4")
    draw = ImageDraw.Draw(img)
    page_system_logs_main()
    base = Image.open(os.path.join(SYSTEM_LOGS_DIR, "01_main_view.png"))
    img.paste(base, (0, 0))

    # Drawer overlay on right side
    drawer_w = 520
    dx1 = W - drawer_w
    draw = ImageDraw.Draw(img)
    draw.rectangle([0, 0, W, H], fill="#00000040")
    draw.rectangle([dx1, 0, W, H], fill="white", outline="#c6c6c6", width=1)

    draw.text((dx1 + 24, 24), "Log Entry Detail", fill="#161616", font=FONT_LG)
    draw_button(draw, (W - 80, 20, W - 24, 52), "✕")

    # Field rows
    fields = [
        ("time",      "2026-06-07T12:44:54.220Z"),
        ("level",     "error"),
        ("module",    "SshCommand"),
        ("msg",       "ssh failed"),
        ("host",      "192.168.1.10"),
        ("port",      "22"),
        ("cmd",       "systemctl status megacosm"),
        ("err",       "ETIMEDOUT"),
        ("durationMs", "30002"),
        ("attempt",   "3"),
        ("robotSn",   "R-001"),
    ]
    fy = 80
    for k, v in fields:
        draw.text((dx1 + 24, fy), k, fill="#525252", font=FONT_SM)
        draw.text((dx1 + 180, fy), v, fill="#161616", font=FONT_MD)
        fy += 30

    # Raw JSON section
    draw.text((dx1 + 24, fy + 16), "Raw JSON", fill="#525252", font=FONT_SM)
    box_y1 = fy + 38
    box_y2 = box_y1 + 220
    draw.rectangle([dx1 + 24, box_y1, W - 24, box_y2], fill="#262626")
    raw = ('{"time":"2026-06-07T12:44:54.220Z","level":50,\n'
           ' "module":"SshCommand","msg":"ssh failed",\n'
           ' "host":"192.168.1.10","port":22,\n'
           ' "cmd":"systemctl status megacosm",\n'
           ' "err":"ETIMEDOUT","durationMs":30002,\n'
           ' "attempt":3,"robotSn":"R-001"}')
    ry = box_y1 + 10
    for line in raw.split("\n"):
        draw.text((dx1 + 36, ry), line, fill="#42be65", font=FONT_SM)
        ry += 18

    draw_button(draw, (dx1 + 24, box_y2 + 16, dx1 + 160, box_y2 + 48), "Copy JSON")

    path = os.path.join(SYSTEM_LOGS_DIR, "02_entry_detail_drawer.png")
    img.save(path)
    print(f"Saved {os.path.relpath(path, BASE_DIR)}")

# ---------------------------------------------------------------------------
# System Logs: 03 — Bundle Download Confirmation
# ---------------------------------------------------------------------------
def page_system_logs_bundle_download():
    W, H = 1400, 900
    img = Image.new("RGB", (W, H), "#f4f4f4")
    draw = ImageDraw.Draw(img)
    page_system_logs_main()
    base = Image.open(os.path.join(SYSTEM_LOGS_DIR, "01_main_view.png"))
    img.paste(base, (0, 0))

    draw = ImageDraw.Draw(img)
    draw.rectangle([0, 0, W, H], fill="#00000080")
    mx, my, mw, mh = 400, 240, 600, 420
    draw.rectangle([mx, my, mx + mw, my + mh], fill="white", outline="#c6c6c6", width=1)

    draw.text((mx + 24, my + 20), "Download log bundle (zip)", fill="#161616", font=FONT_LG)
    draw.text((mx + 24, my + 60),
              "The selected time range will be packaged into a zip file.",
              fill="#525252", font=FONT_MD)
    draw.text((mx + 24, my + 84),
              "Matching log files are included as-is, alongside manifest.json.",
              fill="#525252", font=FONT_MD)

    draw.text((mx + 24, my + 124), "From", fill="#525252", font=FONT_SM)
    draw_input(draw, (mx + 24, my + 142, mx + mw - 24, my + 174),
               placeholder="2026-06-07 12:15:02")
    draw.text((mx + 24, my + 184), "To", fill="#525252", font=FONT_SM)
    draw_input(draw, (mx + 24, my + 202, mx + mw - 24, my + 234),
               placeholder="2026-06-07 12:45:02")

    # Preview
    draw.text((mx + 24, my + 254), "Files to be included (3)", fill="#161616", font=FONT_MD)
    preview = [
        "app.3.log     412 MB     covers 12:30:00 — 12:45:02",
        "app.2.log     500 MB     covers 10:32:11 — 12:30:00",
        "manifest.json (auto-generated)",
    ]
    py = my + 280
    for line in preview:
        draw.text((mx + 40, py), "•  " + line, fill="#525252", font=FONT_SM)
        py += 22

    draw_button(draw, (mx + mw - 220, my + mh - 60, mx + mw - 130, my + mh - 28), "Cancel")
    draw_button(draw, (mx + mw - 120, my + mh - 60, mx + mw - 24, my + mh - 28),
                "Download", bg="#0f62fe", fg="white")

    path = os.path.join(SYSTEM_LOGS_DIR, "03_bundle_download.png")
    img.save(path)
    print(f"Saved {os.path.relpath(path, BASE_DIR)}")

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    # Solution Management
    page_solution_selector()
    page_create_solution()
    page_delete_solution_confirm()
    page_main_workspace()

    # Robots (sub-module of Solution Management)
    page_robots_grid_view()
    page_robots_list_view()
    page_add_robot_modal()
    page_robot_detail_modal()

    # Tasks (sub-module of Solution Management)
    page_tasks_list()
    page_create_task_step1()
    page_create_task_step2()
    page_create_task_step3()
    page_create_task_step4()
    page_delete_task_confirm()

    # Artifact Management
    page_artifact_manager()
    page_artifact_selector()
    page_artifact_detail()
    page_delete_artifact_modal()

    # System Logs
    page_system_logs_main()
    page_system_logs_entry_detail()
    page_system_logs_bundle_download()

    print(f"\nAll UI sketches generated in {BASE_DIR}")
