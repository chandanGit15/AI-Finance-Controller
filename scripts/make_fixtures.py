#!/usr/bin/env python3
"""Generate synthetic INR financial document fixtures (PNG images + a scanned PDF)
for testing the ReconAI document ingestion pipeline. Clearly synthetic.
"""
import os
from PIL import Image, ImageDraw, ImageFont

OUT = os.path.join(os.path.dirname(__file__), '..', 'samples')
os.makedirs(OUT, exist_ok=True)

FONT_CANDIDATES = [
    r'C:\Windows\Fonts\arial.ttf',
    r'C:\Windows\Fonts\segoeui.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
]
FONT = next((f for f in FONT_CANDIDATES if os.path.exists(f)), None)


def render_document(lines, filename, size=28, title_size=30, width_scale=1.0):
    """Render text lines onto a white image."""
    font = ImageFont.truetype(FONT, size) if FONT else ImageFont.load_default()
    title_font = ImageFont.truetype(FONT, title_size) if FONT else font
    temp = Image.new('RGB', (10, 10))
    d = ImageDraw.Draw(temp)
    widths = [d.textlength(t, font=font) for _, t in lines]
    max_w = int(max(widths) * width_scale) + 160
    line_h = int(size * 1.9)
    h = len(lines) * line_h + 160
    img = Image.new('RGB', (max(700, max_w), max(400, h)), 'white')
    dr = ImageDraw.Draw(img)
    dr.rectangle([0, 0, img.width - 1, img.height - 1], outline='black', width=3)
    y = 60
    for kind, t in lines:
        f = title_font if kind == 'title' else font
        dr.text((70, y), t, fill='black', font=f)
        y += line_h + 10
    img.save(os.path.join(OUT, filename))
    print('wrote', filename, img.size)


# --- Sample invoice image (INR) ---
render_document([
    ('title', 'TAX INVOICE  (SYNTHETIC SAMPLE - NOT A REAL TRANSACTION)'),
    ('normal', 'Invoice No : INV-2101'),
    ('normal', 'Customer   : Bengaluru Systems Pvt Ltd'),
    ('normal', 'Invoice Date : 12/08/2026'),
    ('normal', 'Due Date     : 11/09/2026'),
    ('normal', 'Amount       : Rs. 1,25,400.00'),
    ('normal', 'Currency     : INR'),
    ('normal', 'GSTIN        : 29ABCDE1234F1Z5'),
], 'invoice_inr.png', size=30, title_size=24, width_scale=1.2)

# --- Sample payment image (INR) ---
render_document([
    ('title', 'PAYMENT RECEIPT  (SYNTHETIC SAMPLE - NOT A REAL TRANSACTION)'),
    ('normal', 'Payment Ref : PAY-2101'),
    ('normal', 'Payer       : Bengaluru Systems Pvt Ltd'),
    ('normal', 'Against Invoice : INV-2101'),
    ('normal', 'Payment Date : 18/08/2026'),
    ('normal', 'Amount       : Rs. 1,25,400.00'),
    ('normal', 'Mode         : NEFT / UPI'),
    ('normal', 'Bank Ref     : NEFT-88231'),
], 'payment_inr.png', size=30, title_size=24, width_scale=1.2)

# --- Sample bank statement image (INR) ---
render_document([
    ('title', 'BANK STATEMENT EXTRACT  (SYNTHETIC SAMPLE - NOT A REAL TRANSACTION)'),
    ('normal', 'Account  : 50200012345678'),
    ('normal', 'Date         Description                       Debit      Credit'),
    ('normal', '18/08/2026    NEFT INWARD BENGALURU SYSTEMS      -        125400.00'),
    ('normal', '20/08/2026    NEFT CHARGES                       9.50       -'),
    ('normal', '22/08/2026    UPI REFUND AMAZON                   -         452.00'),
], 'bank_statement_inr.png', size=26, title_size=22, width_scale=1.15)

# --- Scanned-style PDF (image inside a PDF, exercises PDF->OCR path) ---
if FONT:
    pdf_path = os.path.join(OUT, 'invoice_scanned_inr.pdf')
    img = Image.new('RGB', (1000, 900), 'white')
    dr = ImageDraw.Draw(img)
    font = ImageFont.truetype(FONT, 30)
    title = ImageFont.truetype(FONT, 26)
    dr.rectangle([20, 20, 979, 879], outline='black', width=3)
    y = 90
    for kind, t in [
        ('t', 'SCANNED INVOICE (SYNTHETIC SAMPLE - NOT A REAL TRANSACTION)'),
        ('n', 'Invoice No : INV-2205'),
        ('n', 'Vendor     : Bharat Logistics'),
        ('n', 'Invoice Date : 05/09/2026'),
        ('n', 'Amount       : Rs. 48,900.00'),
        ('n', 'Currency     : INR'),
    ]:
        f = title if kind == 't' else font
        dr.text((60, y), t, fill='black', font=f)
        y += 110
    img.save(pdf_path, 'PDF', resolution=150)
    print('wrote', pdf_path)

print('fixtures complete')
